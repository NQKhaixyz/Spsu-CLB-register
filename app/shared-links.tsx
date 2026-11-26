"use client";

import { ArrowDown, ArrowUp, ArrowUpRight, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import type { SharedLink } from "../lib/shared-links";
import { Button, Dialog, Empty, Field, FormFooter } from "./ui";

type LinkAction = "saveSharedLink" | "deleteSharedLink" | "moveSharedLink";
type Editor = { mode: "add" } | { mode: "edit" | "delete"; link: SharedLink };

export default function SharedLinks({ links, isAdmin, busy, onAction }: {
  links: SharedLink[];
  isAdmin: boolean;
  busy: boolean;
  onAction: (action: LinkAction, data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const closeEditor = useCallback(() => setEditor(null), []);
  const current = editor && "link" in editor ? editor.link : null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (await onAction("saveSharedLink", { ...data, id: current?.id, updatedAt: current?.updatedAt })) {
      setEditor(null);
    }
  }

  async function remove() {
    if (current && await onAction("deleteSharedLink", { id: current.id, updatedAt: current.updatedAt })) setEditor(null);
  }

  return (
    <>
      <div className="page-heading">
        <div><h1>Link</h1><p>Tài liệu và đường dẫn BĐH chia sẻ với Đội</p></div>
        {isAdmin && <Button onClick={() => setEditor({ mode: "add" })}><Plus size={17} /> Thêm link</Button>}
      </div>
      {links.length ? (
        <ul className="shared-links">
          {links.map((link, index) => (
            <li className="panel shared-link" key={link.id}>
              <div className="shared-link-content">
                <Link2 className="shared-link-icon" size={18} aria-hidden="true" />
                <div>
                  <h2><a href={link.url} target="_blank" rel="noopener noreferrer">{link.title}<ArrowUpRight size={16} aria-hidden="true" /></a></h2>
                  <span className="shared-link-address">{link.url}</span>
                  {link.description && <p>{link.description}</p>}
                </div>
              </div>
              {isAdmin && (
                <div className="shared-link-actions">
                  {links.length > 1 && (
                    <>
                      <Button variant="secondary" aria-label={`Đưa ${link.title} lên`} title="Đưa lên" disabled={busy || index === 0}
                        onClick={() => onAction("moveSharedLink", { id: link.id, offset: -1, neighborId: links[index - 1]?.id })}>
                        <ArrowUp size={15} aria-hidden="true" />
                      </Button>
                      <Button variant="secondary" aria-label={`Đưa ${link.title} xuống`} title="Đưa xuống" disabled={busy || index === links.length - 1}
                        onClick={() => onAction("moveSharedLink", { id: link.id, offset: 1, neighborId: links[index + 1]?.id })}>
                        <ArrowDown size={15} aria-hidden="true" />
                      </Button>
                    </>
                  )}
                  <Button variant="secondary" onClick={() => setEditor({ mode: "edit", link })}><Pencil size={15} /> Sửa</Button>
                  <Button variant="secondary" onClick={() => setEditor({ mode: "delete", link })}><Trash2 size={15} /> Xóa</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <section className="panel"><Empty title="Chưa có link được chia sẻ" icon={Link2} /></section>
      )}
      {isAdmin && editor && (
        <Dialog
          title={editor.mode === "delete" ? "Xóa link" : editor.mode === "edit" ? "Chỉnh sửa link" : "Thêm link"}
          onClose={closeEditor}
          busy={busy}
        >
          {editor.mode === "delete" ? (
            <>
              <p className="dialog-copy">Bạn muốn xóa “{editor.link.title}” khỏi danh sách chung?</p>
              <div className="form-footer">
                <Button variant="secondary" disabled={busy} onClick={() => setEditor(null)}>Hủy</Button>
                <Button variant="danger" disabled={busy} onClick={() => void remove()}>Xóa link</Button>
              </div>
            </>
          ) : (
            <form onSubmit={save}>
              <Field label="Tên link">
                <input name="title" required maxLength={120} defaultValue={current?.title} />
              </Field>
              <Field label="Đường dẫn">
                <input name="url" type="url" placeholder="https://" required maxLength={2048} defaultValue={current?.url} />
              </Field>
              <Field label="Mô tả">
                <textarea name="description" rows={3} maxLength={1500} defaultValue={current?.description} />
              </Field>
              <FormFooter label="Lưu link" busy={busy} onCancel={() => setEditor(null)} />
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
