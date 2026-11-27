"use client";

import { Bookmark, CalendarClock, ChevronLeft, Ellipsis, Heart, ImagePlus, MessageCircle, Newspaper, Pencil, Plus, Share2, Trash2, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { bulletinCommentLimit, parseBulletinDate, type BulletinAuthor, type BulletinPostView } from "../lib/bulletin";
import { uid } from "../lib/club";
import { BulletinAttachments } from "./bulletin-attachments";
import { BulletinComposer, bulletinVideoAccept, type BulletinMediaSelection } from "./bulletin-composer";
import { Avatar, Button, Dialog, Empty, Field } from "./ui";

type Overlay =
  | { mode: "edit"; id: string; original?: BulletinPostView; selection?: BulletinMediaSelection }
  | { mode: "delete" | "share"; original: BulletinPostView };
type BulletinAction = "saveBulletinPost" | "deleteBulletinPost" | "setBulletinLike" | "setBulletinSaved" | "commentOnBulletin" | "setBulletinCommentLike";
type Act = (action: BulletinAction, data: Record<string, unknown>, message: string) => Promise<boolean>;
type Feed = "all" | "liked" | "saved" | "scheduled";
const feedTabs: { id: Feed; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "liked", label: "Đã thích" },
  { id: "saved", label: "Đã lưu" },
  { id: "scheduled", label: "Đã hẹn" },
];
const bulletinClock = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});
const compactCount = new Intl.NumberFormat("vi-VN", { notation: "compact" });

function Byline({ author, time, scheduled = false, small = false }: {
  author: BulletinAuthor; time?: number; scheduled?: boolean; small?: boolean;
}) {
  return <div className="bulletin-byline">
    <Avatar name={author.name} photoId={author.avatarId} size={small ? "small" : ""} />
    <div>
      <strong>{author.name}</strong>
      {time !== undefined && <time dateTime={new Date(time).toISOString()}>
        {scheduled && "Hẹn đăng "}{bulletinClock.format(time)}
      </time>}
    </div>
  </div>;
}

function PostHeader({ post, onEdit, onDelete }: {
  post: BulletinPostView; onEdit?: () => void; onDelete?: () => void;
}) {
  return <header className="bulletin-post-header">
    <Byline author={post.author} time={post.publishAt ?? post.createdAt} scheduled={!post.published} />
    {onEdit && onDelete && <details className="bulletin-post-menu">
      <summary aria-label={`Quản lý bản tin ${post.title}`}><Ellipsis size={20} aria-hidden="true" /></summary>
      <div className="bulletin-post-menu-items">
        <button type="button" onClick={event => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onEdit();
        }}><Pencil size={15} aria-hidden="true" /> Sửa tin</button>
        <button type="button" onClick={event => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onDelete();
        }}><Trash2 size={15} aria-hidden="true" /> Xóa tin</button>
      </div>
    </details>}
  </header>;
}

function PostActions({ post, busy, act, onDiscuss, onShare }: {
  post: BulletinPostView; busy: boolean; act: Act; onDiscuss: () => void; onShare: () => void;
}) {
  return <div className="bulletin-actions bulletin-post-actions" aria-label="Tương tác với bản tin" role="group">
    <button type="button" aria-pressed={post.liked} disabled={busy}
      aria-label={post.likeCount > 0 ? `${post.likeCount} lượt thích` : "Thích"} title={post.liked ? "Bỏ thích" : "Thích"}
      onClick={() => void act("setBulletinLike", { postId: post.id, liked: !post.liked }, post.liked ? "Đã bỏ thích" : "Đã thích bản tin")}>
      <Heart size={19} aria-hidden="true" /> <span aria-hidden="true">{compactCount.format(post.likeCount)}</span>
    </button>
    <button type="button" onClick={onDiscuss} aria-label={`${post.comments.length} bình luận`} title="Bình luận">
      <MessageCircle size={19} aria-hidden="true" /> <span aria-hidden="true">{compactCount.format(post.comments.length)}</span>
    </button>
    <button type="button" aria-pressed={post.saved} disabled={busy}
      aria-label={post.saved ? "Đã lưu" : "Lưu"} title={post.saved ? "Bỏ lưu" : "Lưu"}
      onClick={() => void act("setBulletinSaved", { postId: post.id, saved: !post.saved }, post.saved ? "Đã bỏ lưu bản tin" : "Đã lưu bản tin")}>
      <Bookmark size={19} aria-hidden="true" />
    </button>
    <button type="button" onClick={onShare} aria-label="Chia sẻ" title="Chia sẻ"><Share2 size={19} aria-hidden="true" /></button>
  </div>;
}

function CommentThread({ post, me, busy, act }: {
  post: BulletinPostView; me: BulletinAuthor; busy: boolean; act: Act;
}) {
  const [draftId, setDraftId] = useState(uid);
  const [replyId, setReplyId] = useState<string>();
  const editor = useRef<HTMLTextAreaElement>(null);
  const commentsById = new Map(post.comments.map(comment => [comment.id, comment]));
  const reply = replyId ? commentsById.get(replyId) : undefined;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const content = new FormData(form).get("comment");
    if (await act("commentOnBulletin", {
      id: draftId, postId: post.id, content, replyTo: reply?.id,
    }, reply ? "Đã gửi trả lời" : "Đã gửi bình luận")) {
      form.reset();
      setReplyId(undefined);
      setDraftId(uid());
    }
  }

  return <section className="bulletin-thread" aria-label="Bình luận">
    <h2>Bình luận <span>{post.comments.length}</span></h2>
    {post.comments.length ? <ol className="bulletin-replies">
      {post.comments.map(comment => {
        const parent = comment.replyTo ? commentsById.get(comment.replyTo) : undefined;
        return <li key={comment.id} className={parent ? "bulletin-reply is-reply" : "bulletin-reply"}>
          <Byline author={comment.author} time={comment.createdAt} small />
          {parent && <span className="bulletin-reply-label">Trả lời {parent.author.name}</span>}
          <p>{comment.content}</p>
          <div className="bulletin-actions">
            <button type="button" aria-pressed={comment.liked} disabled={busy}
              onClick={() => void act("setBulletinCommentLike", {
                postId: post.id, commentId: comment.id, liked: !comment.liked,
              }, comment.liked ? "Đã bỏ thích bình luận" : "Đã thích bình luận")}>
              <Heart size={15} aria-hidden="true" /> {comment.likeCount ? `${comment.likeCount} lượt thích` : "Thích"}
            </button>
            <button type="button" disabled={busy} onClick={() => {
              setReplyId(comment.id);
              editor.current?.focus();
            }}>Trả lời</button>
          </div>
        </li>;
      })}
    </ol> : <p className="hint">Chưa có bình luận</p>}
    <form className="bulletin-comment-form" onSubmit={send}>
      <Avatar name={me.name} photoId={me.avatarId} />
      <div>
        {reply && <div className="bulletin-replying">
          <span>Đang trả lời {reply.author.name}</span>
          <button type="button" className="text-button" disabled={busy} onClick={() => setReplyId(undefined)}>Bỏ trả lời</button>
        </div>}
        <Field label={reply ? "Viết trả lời" : "Viết bình luận"}>
          <textarea id="bulletin-comment" ref={editor} name="comment" rows={2} maxLength={bulletinCommentLimit} required />
        </Field>
        <Button type="submit" disabled={busy}>{reply ? "Gửi trả lời" : "Gửi bình luận"}</Button>
      </div>
    </form>
  </section>;
}

function SharePost({ post, onClose }: { post: BulletinPostView; onClose: () => void }) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("tin", post.id);
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url.href);
      setMessage("Đã sao chép link");
    } catch {
      input.current?.focus();
      input.current?.select();
      setMessage("Link đã được chọn để bạn sao chép");
    }
  }

  return <Dialog title="Chia sẻ bản tin" description={post.title} onClose={onClose}>
    <Field label="Link bản tin">
      <input ref={input} value={url.href} type="url" readOnly onFocus={event => event.currentTarget.select()} />
    </Field>
    {message && <p className="hint" role="status">{message}</p>}
    <div className="form-footer">
      <Button variant="secondary" onClick={onClose}>Đóng</Button>
      <Button onClick={() => void copyLink()}>Sao chép link</Button>
    </div>
  </Dialog>;
}

export default function BulletinBoard({ posts, nextChangeAt, me, isAdmin, busy, linkedPostId, onDismissLink, onOpen, onAction }: {
  posts: BulletinPostView[];
  nextChangeAt?: number;
  me: BulletinAuthor;
  isAdmin: boolean;
  busy: boolean;
  linkedPostId?: string;
  onDismissLink: () => void;
  onOpen: (signal: AbortSignal) => Promise<void>;
  onAction: Act;
}) {
  const [readingId, setReadingId] = useState(linkedPostId);
  const [feed, setFeed] = useState<Feed>("all");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const threadTitle = useRef<HTMLHeadingElement>(null);
  const quickPhoto = useRef<HTMLInputElement>(null);
  const quickVideo = useRef<HTMLInputElement>(null);
  const closeOverlay = useCallback(() => setOverlay(null), []);
  const selected = posts.find(post => post.id === readingId);
  const original = overlay?.mode === "edit" ? overlay.original : undefined;
  const scheduled = posts.filter(post => !post.published);
  const visible = posts.filter(post => feed === "scheduled" ? !post.published :
    post.published && (feed === "all" || (feed === "liked" && post.liked) || (feed === "saved" && post.saved)));

  useEffect(() => {
    const controller = new AbortController();
    void onOpen(controller.signal);
    return () => controller.abort();
  }, [onOpen, readingId]);
  const selectedId = selected?.id;
  useEffect(() => {
    if (selectedId) threadTitle.current?.focus({ preventScroll: true });
  }, [selectedId]);
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

  async function save(fields: FormData, mediaIds: string[]) {
    if (overlay?.mode !== "edit") return false;
    const publishAt = fields.get("publishAt");
    const saved = await onAction("saveBulletinPost", {
      id: overlay.id,
      title: fields.get("title"),
      content: fields.get("content"),
      mediaIds,
      ...(isAdmin ? { publishAt, deleteAt: fields.get("deleteAt") } : {}),
      revision: original?.revision,
    }, original ? "Đã cập nhật bản tin" : "Đã đăng bản tin");
    if (saved) {
      if (!readingId) setFeed((parseBulletinDate(publishAt) ?? 0) > Date.now() ? "scheduled" : "all");
      closeOverlay();
    }
    return saved;
  }

  function showPost(id: string) {
    setReadingId(id);
    window.scrollTo(0, 0);
  }

  function backToFeed() {
    setReadingId(undefined);
    onDismissLink();
    window.scrollTo(0, 0);
  }

  function composeFromFile(event: ChangeEvent<HTMLInputElement>, kind: BulletinMediaSelection["kind"]) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length && !busy) setOverlay({ mode: "edit", id: uid(), selection: { files, kind } });
  }

  function postHeader(post: BulletinPostView) {
    return <PostHeader post={post}
      onEdit={post.canManage ? () => setOverlay({ mode: "edit", id: post.id, original: post }) : undefined}
      onDelete={post.canManage ? () => setOverlay({ mode: "delete", original: post }) : undefined}
    />;
  }

  function postActions(post: BulletinPostView, onDiscuss: () => void) {
    return <PostActions post={post} busy={busy} act={onAction}
      onDiscuss={onDiscuss} onShare={() => setOverlay({ mode: "share", original: post })} />;
  }

  return <div className="bulletin-board">
    <h1 className="bulletin-screen-title">Bảng tin</h1>
    {readingId && <Button className="bulletin-back" variant="secondary" onClick={backToFeed}>
      <ChevronLeft size={16} aria-hidden="true" /> Về bảng tin
    </Button>}
    {readingId ? selected ? (
      <>
        <article className="panel bulletin-post bulletin-detail">
          {postHeader(selected)}
          <h2 className="bulletin-post-title" ref={threadTitle} tabIndex={-1}>{selected.title}</h2>
          {selected.content && <div className="bulletin-fulltext">{selected.content}</div>}
          <BulletinAttachments postId={selected.id} title={selected.title} files={selected.media} />
          {isAdmin && selected.deleteAt !== undefined && <p className="bulletin-note">
            <CalendarClock size={15} aria-hidden="true" /> Tự xóa {bulletinClock.format(selected.deleteAt)} · Giờ Việt Nam
          </p>}
          {selected.published && postActions(selected, () => document.getElementById("bulletin-comment")?.focus())}
        </article>
        {selected.published && <CommentThread key={selected.id} post={selected} me={me} busy={busy} act={onAction} />}
      </>
    ) : <section className="panel"><Empty title="Bản tin không còn khả dụng" icon={Newspaper} /></section> : (
      <>
        <div className="bulletin-compose" data-pet-avoid>
          <Avatar name={me.name} photoId={me.avatarId} />
          <Button className="bulletin-compose-start" disabled={busy} onClick={() => setOverlay({ mode: "edit", id: uid() })}>
            <Plus size={17} aria-hidden="true" /> Đăng tin
          </Button>
          <button className="bulletin-compose-media" type="button" disabled={busy} aria-label="Thêm ảnh" title="Thêm ảnh"
            onClick={() => quickPhoto.current?.click()}><ImagePlus size={20} aria-hidden="true" /></button>
          <button className="bulletin-compose-media" type="button" disabled={busy} aria-label="Thêm video" title="Thêm video"
            onClick={() => quickVideo.current?.click()}><Video size={20} aria-hidden="true" /></button>
          <input ref={quickPhoto} type="file" accept="image/*" multiple hidden onChange={event => composeFromFile(event, "image")} />
          <input ref={quickVideo} type="file" accept={bulletinVideoAccept} multiple hidden onChange={event => composeFromFile(event, "video")} />
        </div>
        <div className="bulletin-feeds" aria-label="Lọc bảng tin" role="group">
          {feedTabs.filter(tab => tab.id !== "scheduled" || isAdmin).map(tab =>
            <button key={tab.id} type="button" aria-pressed={feed === tab.id} onClick={() => setFeed(tab.id)}>
              {tab.label}{tab.id === "scheduled" && scheduled.length > 0 ? ` · ${scheduled.length}` : ""}
            </button>
          )}
        </div>
        {visible.length ? (
          <ul className="bulletin-list">
            {visible.map(post => <li key={post.id} className="bulletin-post">
              {postHeader(post)}
              <button className="bulletin-post-open" type="button" aria-label={`Xem bản tin ${post.title}`} onClick={() => showPost(post.id)}>
                <strong className="bulletin-post-title">{post.title}</strong>
                {post.content && <span className="bulletin-preview" aria-hidden="true">{post.content}</span>}
                <span className="bulletin-read" aria-hidden="true">Xem thêm</span>
              </button>
              <BulletinAttachments postId={post.id} title={post.title} files={post.media} onOpen={() => showPost(post.id)} />
              {post.published && postActions(post, () => showPost(post.id))}
            </li>)}
          </ul>
        ) : <section className="panel"><Empty icon={Newspaper} title={
          feed === "saved" ? "Bạn chưa lưu bản tin nào" : feed === "liked" ? "Bạn chưa thích bản tin nào" :
          feed === "scheduled" ? "Chưa có bản tin đã hẹn" : "Chưa có bản tin"
        } /></section>}
      </>
    )}
    {overlay?.mode === "share" && <SharePost post={overlay.original} onClose={closeOverlay} />}
    {overlay?.mode === "edit" && <BulletinComposer key={overlay.id} postId={overlay.id} original={original}
      initialSelection={overlay.selection} isAdmin={isAdmin} busy={busy} onSave={save} onClose={closeOverlay} />}
    {overlay?.mode === "delete" && (
      <Dialog title="Xóa bản tin" onClose={closeOverlay} busy={busy}>
        <p>Xóa “{overlay.original.title}” cùng ảnh, video, lượt thích và bình luận?</p>
        <div className="form-footer">
          <Button variant="secondary" disabled={busy} onClick={closeOverlay}>Hủy</Button>
          <Button variant="danger" disabled={busy} onClick={async () => {
            const { id, revision } = overlay.original;
            if (await onAction("deleteBulletinPost", { id, revision }, "Đã xóa bản tin")) {
              closeOverlay();
              if (readingId === id) backToFeed();
            }
          }}>Xóa bản tin</Button>
        </div>
      </Dialog>
    )}
  </div>;
}
