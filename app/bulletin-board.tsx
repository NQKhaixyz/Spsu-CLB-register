"use client";

import { ArrowRight, MessageSquare, Newspaper, Pencil, Plus, ThumbsUp, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { bulletinCommentLimit, bulletinContentLimit, bulletinDateInput, bulletinTitleLimit, type BulletinPostView } from "../lib/bulletin";
import { uid } from "../lib/club";
import { Button, Dialog, Empty, Field, FormFooter } from "./ui";

type Selection =
  | { mode: "read"; id: string }
  | { mode: "edit"; id: string; original?: BulletinPostView }
  | { mode: "delete"; original: BulletinPostView };
type BulletinAction = "saveBulletinPost" | "deleteBulletinPost" | "setBulletinLike" | "commentOnBulletin";
const bulletinClock = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});

export default function BulletinBoard({ posts, nextChangeAt, isAdmin, busy, onOpen, onAction }: {
  posts: BulletinPostView[];
  nextChangeAt?: number;
  isAdmin: boolean;
  busy: boolean;
  onOpen: (signal: AbortSignal) => Promise<void>;
  onAction: (action: BulletinAction, data: Record<string, unknown>, message: string) => Promise<boolean>;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [commentId, setCommentId] = useState(uid);
  const close = useCallback(() => setSelection(null), []);
  const selected = selection?.mode === "read" ? posts.find(post => post.id === selection.id) : undefined;
  const original = selection?.mode === "edit" ? selection.original : undefined;

  useEffect(() => {
    const controller = new AbortController();
    void onOpen(controller.signal);
    return () => controller.abort();
  }, [onOpen]);
  useEffect(() => {
    if (nextChangeAt === undefined) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = nextChangeAt - Date.now() + 50;
      if (delay <= 0) void onOpen(controller.signal);
      else timer = setTimeout(schedule, Math.min(delay, 2_147_483_647));
    };
    schedule();
    return () => { clearTimeout(timer); controller.abort(); };
  }, [nextChangeAt, onOpen]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selection?.mode !== "edit") return;
    const fields = new FormData(event.currentTarget);
    if (await onAction("saveBulletinPost", {
      id: selection.id,
      title: String(fields.get("title") ?? ""),
      content: String(fields.get("content") ?? ""),
      publishAt: fields.get("publishAt"),
      deleteAt: fields.get("deleteAt"),
      revision: original?.revision,
    }, original ? "Đã cập nhật bản tin" : "Đã đăng bản tin")) close();
  }

  async function comment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const content = new FormData(form).get("comment");
    if (await onAction("commentOnBulletin", { id: commentId, postId, content }, "Đã gửi bình luận")) {
      form.reset();
      setCommentId(uid());
    }
  }

  function likeButton(post: BulletinPostView) {
    return <button className="btn secondary bulletin-like" type="button" aria-pressed={post.liked}
      disabled={busy} onClick={() => void onAction("setBulletinLike", { postId: post.id, liked: !post.liked }, post.liked ? "Đã bỏ thích" : "Đã thích bản tin")}>
      <ThumbsUp size={16} aria-hidden="true" /> {post.liked ? "Đã thích" : "Thích"} · {post.likeCount}
    </button>;
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
                {isAdmin && !post.published && post.publishAt !== undefined &&
                  <span className="bulletin-time">Hẹn đăng {bulletinClock.format(post.publishAt)}</span>}
                <span className="bulletin-preview" aria-hidden="true">{post.content}</span>
                <span className="bulletin-read" aria-hidden="true">Xem nội dung <ArrowRight size={14} /></span>
              </button>
              {post.published && <div className="bulletin-social">
                {likeButton(post)}
                <Button variant="secondary" onClick={() => setSelection({ mode: "read", id: post.id })}>
                  <MessageSquare size={16} /> {post.comments.length} bình luận
                </Button>
              </div>}
            </li>
          ))}
        </ul>
      ) : (
        <section className="panel"><Empty title="Chưa có bản tin" icon={Newspaper} /></section>
      )}
      {selected && (
        <Dialog key={selected.id} title={selected.title} onClose={close} wide>
          <div className="bulletin-fulltext">{selected.content}</div>
          {isAdmin && selected.deleteAt !== undefined &&
            <p className="bulletin-time">Tự xóa {bulletinClock.format(selected.deleteAt)} · giờ Việt Nam</p>}
          {selected.published && <section className="bulletin-comments" aria-label="Bình luận">
            {likeButton(selected)}
            <h3>Bình luận · {selected.comments.length}</h3>
            {selected.comments.length > 0 && <ul>
              {selected.comments.map(item => <li key={item.id}>
                <strong>{item.authorName}</strong>
                <time dateTime={new Date(item.createdAt).toISOString()}>{bulletinClock.format(item.createdAt)}</time>
                <p>{item.content}</p>
              </li>)}
            </ul>}
            <form onSubmit={event => void comment(event, selected.id)}>
              <Field label="Viết bình luận"><textarea name="comment" rows={2} maxLength={bulletinCommentLimit} required /></Field>
              <Button type="submit" disabled={busy}>Gửi bình luận</Button>
            </form>
          </section>}
          <div className="form-footer">
            <Button variant="secondary" onClick={close}>Đóng</Button>
            {isAdmin && <Button disabled={busy} onClick={() => setSelection({
              mode: "edit", id: selected.id, original: selected,
            })}><Pencil size={15} /> Sửa tin</Button>}
            {isAdmin && <Button variant="danger" disabled={busy} onClick={() => setSelection({ mode: "delete", original: selected })}>
              <Trash2 size={15} /> Xóa tin
            </Button>}
          </div>
        </Dialog>
      )}
      {isAdmin && selection?.mode === "edit" && (
        <Dialog key={`edit:${selection.id}`} title={original ? "Sửa tin" : "Đăng tin"} onClose={close} wide busy={busy}>
          <form onSubmit={save}>
            <Field label="Tiêu đề"><input name="title" required maxLength={bulletinTitleLimit} defaultValue={original?.title} /></Field>
            <Field label="Nội dung"><textarea name="content" rows={7} required maxLength={bulletinContentLimit} defaultValue={original?.content} /></Field>
            <div className="form-grid">
              <Field label="Hẹn đăng" hint="Giờ Việt Nam · Để trống để đăng ngay">
                <input name="publishAt" type="datetime-local" defaultValue={bulletinDateInput(original?.publishAt)} />
              </Field>
              <Field label="Hẹn tự xóa" hint="Giờ Việt Nam · Để trống để giữ tin">
                <input name="deleteAt" type="datetime-local" defaultValue={bulletinDateInput(original?.deleteAt)} />
              </Field>
            </div>
            <FormFooter label={original ? "Lưu thay đổi" : "Đăng tin"} busy={busy} onCancel={close} />
          </form>
        </Dialog>
      )}
      {isAdmin && selection?.mode === "delete" && (
        <Dialog key={`delete:${selection.original.id}`} title="Xóa bản tin" onClose={close} busy={busy}>
          <p>Xóa “{selection.original.title}” cùng lượt thích và bình luận?</p>
          <div className="form-footer">
            <Button variant="secondary" disabled={busy} onClick={close}>Hủy</Button>
            <Button variant="danger" disabled={busy} onClick={async () => {
              const { id, revision } = selection.original;
              if (await onAction("deleteBulletinPost", { id, revision }, "Đã xóa bản tin")) close();
            }}>Xóa bản tin</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
