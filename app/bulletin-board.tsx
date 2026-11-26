"use client";

import { ArrowRight, Newspaper, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { bulletinContentLimit, bulletinTitleLimit, type BulletinPost } from "../lib/bulletin";
import { uid } from "../lib/club";
import { Button, Dialog, Empty, Field, FormFooter } from "./ui";

type Selection =
  | { mode: "read"; id: string }
  | { mode: "edit"; id: string; original?: BulletinPost };
type Draft = Omit<BulletinPost, "revision"> & { revision?: number };

export default function BulletinBoard({ posts, isAdmin, busy, onOpen, onSave }: {
  posts: BulletinPost[];
  isAdmin: boolean;
  busy: boolean;
  onOpen: (signal: AbortSignal) => Promise<void>;
  onSave: (draft: Draft) => Promise<boolean>;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const close = useCallback(() => setSelection(null), []);
  const selected = selection?.mode === "read" ? posts.find(post => post.id === selection.id) : undefined;
  const original = selection?.mode === "edit" ? selection.original : undefined;

  useEffect(() => {
    const controller = new AbortController();
    void onOpen(controller.signal);
    return () => controller.abort();
  }, [onOpen]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selection?.mode !== "edit") return;
    const fields = new FormData(event.currentTarget);
    if (await onSave({
      id: selection.id,
      title: String(fields.get("title") ?? ""),
      content: String(fields.get("content") ?? ""),
      revision: original?.revision,
    })) close();
  }

  return (
    <>
      <div className="page-heading">
        <h1>Bảng tin</h1>
        {isAdmin && <Button disabled={busy} onClick={() => setSelection({ mode: "edit", id: uid() })}>
          <Plus size={16} /> Đăng tin
        </Button>}
      </div>
      {posts.length > 0 ? (
        <ul className="bulletin-list">
          {posts.map(post => (
            <li className="panel" key={post.id}>
              <button className="bulletin-card" type="button" aria-haspopup="dialog" aria-label={`Xem bản tin ${post.title}`}
                onClick={() => setSelection({ mode: "read", id: post.id })}>
                <strong className="bulletin-title">{post.title}</strong>
                <span className="bulletin-preview" aria-hidden="true">{post.content}</span>
                <span className="bulletin-read" aria-hidden="true">Xem nội dung <ArrowRight size={14} /></span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <section className="panel"><Empty title="Chưa có bản tin" icon={Newspaper} /></section>
      )}
      {selected && (
        <Dialog key={selected.id} title={selected.title} onClose={close} wide>
          <div className="bulletin-fulltext">{selected.content}</div>
          <div className="form-footer">
            <Button variant="secondary" onClick={close}>Đóng</Button>
            {isAdmin && <Button disabled={busy} onClick={() => setSelection({
              mode: "edit", id: selected.id, original: selected,
            })}><Pencil size={15} /> Sửa tin</Button>}
          </div>
        </Dialog>
      )}
      {isAdmin && selection?.mode === "edit" && (
        <Dialog key={`edit:${selection.id}`} title={original ? "Sửa tin" : "Đăng tin"} onClose={close} wide busy={busy}>
          <form onSubmit={save}>
            <Field label="Tiêu đề"><input name="title" required maxLength={bulletinTitleLimit} defaultValue={original?.title} /></Field>
            <Field label="Nội dung"><textarea name="content" rows={7} required maxLength={bulletinContentLimit} defaultValue={original?.content} /></Field>
            <FormFooter label={original ? "Lưu thay đổi" : "Đăng tin"} busy={busy} onCancel={close} />
          </form>
        </Dialog>
      )}
    </>
  );
}
