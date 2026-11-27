"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MessageSquare, Plus, UserRound } from "lucide-react";
import { personKey } from "../lib/availability";
import { uid } from "../lib/club";
import { feedbackBodyLimit, type FeedbackConsentDraft, type FeedbackDraft, type FeedbackEdit, type FeedbackReplyDraft, type FeedbackView } from "../lib/feedback";
import { MemberName, useMemberIdentity } from "./member-identity";
import { Avatar, Button, Dialog, Empty, Field, FormFooter } from "./ui";

export type SubmitFeedback = (draft: FeedbackDraft, onError: (message: string) => void) => Promise<boolean>;
export type EditFeedback = (draft: FeedbackEdit, onError: (message: string) => void) => Promise<boolean>;
export type RecallFeedback = (id: string, onError: (message: string) => void) => Promise<boolean>;
export type FeedbackConversationActions = {
  onReply: (draft: FeedbackReplyDraft, onError: (message: string) => void) => Promise<boolean>;
  onConsent: (draft: FeedbackConsentDraft, onError: (message: string) => void) => Promise<boolean>;
};
type FeedbackAction = { kind: "edit"; item: FeedbackView } | { kind: "recall"; id: string };

const orderNames = new Intl.Collator("vi-VN");
const feedbackClock = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const pageSize = 8;

export function FeedbackComposer({ initialRecipientId, busy, onSubmit, onSent, onCancel }: {
  initialRecipientId?: string; busy: boolean; onSubmit: SubmitFeedback; onSent: () => void; onCancel: () => void;
}) {
  const directory = useMemberIdentity()?.members;
  const [draftId] = useState(uid);
  const [selectedIds, setSelectedIds] = useState(() => initialRecipientId ? [initialRecipientId] : []);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const members = useMemo(() => Array.from(directory?.values() ?? []).sort((a, b) =>
    orderNames.compare(a.name, b.name) || a.id.localeCompare(b.id)), [directory]);
  const query = personKey(search);
  const matched = members.filter(member => personKey(`${member.name} ${member.studentId}`).includes(query));
  const selected = selectedIds.filter(id => directory?.has(id));

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") ?? "").trim();
    if (!selected.length) {
      setError("Chọn ít nhất một người nhận");
      return;
    }
    if (!body) {
      setError("Nhập nội dung feedback");
      return;
    }
    setError("");
    const saved = await onSubmit({
      id: draftId, body, recipientIds: selected, anonymous: form.get("identity") === "anonymous",
    }, setError);
    if (saved) onSent();
  }

  return <form className="feedback-composer" onSubmit={send}>
    <fieldset className="feedback-group" disabled={busy}>
      <legend>Người nhận</legend>
      <input type="search" aria-label="Tìm người nhận" placeholder="Tìm theo tên hoặc MSSV" value={search}
        onChange={event => setSearch(event.target.value)} />
      <div className="feedback-people">
        {matched.length ? matched.map(member => (
          <label className="feedback-person-option" key={member.id}>
            <input type="checkbox" checked={selected.includes(member.id)}
              onChange={event => {
                const checked = event.target.checked;
                setSelectedIds(ids => checked ? [...ids, member.id] : ids.filter(id => id !== member.id));
                setError("");
              }} />
            <span>
              <MemberName as="strong" memberId={member.id} />
              {member.studentId && <small>{member.studentId}</small>}
            </span>
          </label>
        )) : <p>Không tìm thấy thành viên</p>}
      </div>
      <p className="feedback-selected" aria-live="polite">Đã chọn {selected.length} người</p>
    </fieldset>
    <Field label="Nội dung feedback">
      <textarea name="body" rows={4} required maxLength={feedbackBodyLimit} disabled={busy} />
    </Field>
    <fieldset className="feedback-group" disabled={busy}>
      <legend>Tên người gửi</legend>
      <div className="feedback-visibility-options">
        <label><input type="radio" name="identity" value="public" defaultChecked /> Công khai tên</label>
        <label><input type="radio" name="identity" value="anonymous" /> Ẩn danh</label>
      </div>
      <p className="feedback-visibility-note">Mỗi người nhận có một cuộc trao đổi riêng. Sửa, xóa, phản hồi và công khai trong 24 giờ đầu</p>
    </fieldset>
    {error && <p className="feedback-error" role="alert">{error}</p>}
    <FormFooter label="Gửi feedback" busy={busy} onCancel={onCancel} />
  </form>;
}

function EditFeedbackForm({ item, busy, onEdit, onClose }: {
  item: FeedbackView; busy: boolean; onEdit: EditFeedback; onClose: () => void;
}) {
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get("body") ?? "").trim();
    if (!body) {
      setError("Nhập nội dung feedback");
      return;
    }
    setError("");
    if (await onEdit({ id: item.id, body, previousEditedAt: item.editedAt }, setError)) onClose();
  }

  return <form className="feedback-edit" onSubmit={save}>
    <Field label="Nội dung feedback">
      <textarea name="body" rows={4} required maxLength={feedbackBodyLimit} defaultValue={item.body} disabled={busy} />
    </Field>
    {!!item.approvalCount && <p className="hint">Lưu nội dung mới sẽ đưa cuộc trao đổi về riêng tư để hai bên xem lại</p>}
    {error && <p className="feedback-error" role="alert">{error}</p>}
    <div className="feedback-entry-actions">
      <Button variant="secondary" disabled={busy} onClick={onClose}>Quay lại</Button>
      <Button type="submit" disabled={busy}>Lưu thay đổi</Button>
    </div>
  </form>;
}

function FeedbackConversation({ item, openForActions, busy, actions, initiallyOpen }: {
  item: FeedbackView; openForActions: boolean; busy: boolean; actions: FeedbackConversationActions; initiallyOpen: boolean;
}) {
  const [draftId, setDraftId] = useState(uid);
  const [error, setError] = useState("");
  const canReply = openForActions && item.canReply;
  const consent = openForActions ? item.consent : undefined;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("reply") ?? "").trim();
    if (!body) {
      setError("Nhập nội dung phản hồi");
      return;
    }
    setError("");
    if (await actions.onReply({ id: draftId, feedbackId: item.id, body }, setError)) {
      form.reset();
      setDraftId(uid());
    }
  }

  if (!item.replies.length && !canReply && !consent) return null;
  return <details className="feedback-conversation" open={initiallyOpen || undefined}>
    <summary>Phản hồi{item.replies.length > 0 && ` · ${item.replies.length}`}</summary>
    {item.replies.length > 0 && <ol className="feedback-messages">
      {item.replies.map(reply => <li key={reply.id}>
        <header className="feedback-entry-meta">
          {reply.anonymous ? <strong>Ẩn danh</strong> : <MemberName as="strong" memberId={reply.authorId} />}
          <time dateTime={new Date(reply.createdAt).toISOString()}>{feedbackClock.format(reply.createdAt)}</time>
        </header>
        <p className="feedback-body">{reply.body}</p>
      </li>)}
    </ol>}
    {canReply && <form className="feedback-edit" onSubmit={send}>
      <Field label="Nội dung phản hồi">
        <textarea name="reply" rows={3} required maxLength={feedbackBodyLimit} disabled={busy} />
      </Field>
      {!!item.approvalCount && <p className="hint">Phản hồi mới sẽ đưa cuộc trao đổi về riêng tư để hai bên xem lại</p>}
      <div className="feedback-entry-actions">
        <Button type="submit" disabled={busy}>Gửi phản hồi</Button>
      </div>
    </form>}
    {consent && <div className="feedback-consent">
      <p className="hint">Cuộc trao đổi tự công khai trên hồ sơ người nhận khi hai bên đều đồng ý</p>
      <div className="feedback-entry-actions">
        <Button variant="secondary" disabled={busy} onClick={() => {
          setError("");
          void actions.onConsent({ feedbackId: item.id, approved: !consent.approved, version: consent.version }, setError);
        }}>{consent.approved ? "Rút đồng ý công khai" : "Đồng ý công khai"}</Button>
        <span className="hint">{item.approvalCount ?? 0}/{item.approvalTotal} đã đồng ý</span>
      </div>
    </div>}
    {error && <p className="feedback-error" role="alert">{error}</p>}
  </details>;
}

function FeedbackList({ entries, busy, onEdit, onRecall, conversationActions, linkRecipients = false, expandConversation = false }: {
  entries: FeedbackView[]; busy: boolean; onEdit: EditFeedback; onRecall: RecallFeedback;
  conversationActions: FeedbackConversationActions; linkRecipients?: boolean; expandConversation?: boolean;
}) {
  const identity = useMemberIdentity();
  const [limit, setLimit] = useState(pageSize);
  const [action, setAction] = useState<FeedbackAction>();
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const nextDeadline = entries.slice(0, limit).reduce((earliest, { actionsUntil }) =>
    actionsUntil > now ? Math.min(earliest, actionsUntil) : earliest, Infinity);
  useEffect(() => {
    if (!Number.isFinite(nextDeadline)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, nextDeadline - Date.now()) + 1);
    return () => window.clearTimeout(timer);
  }, [nextDeadline]);
  if (!entries.length) return <Empty title="Chưa có feedback" icon={MessageSquare} />;
  return <>
    <ol className="feedback-list">
      {entries.slice(0, limit).map(item => {
        const author = !item.anonymous && item.authorId ? identity?.members.get(item.authorId) : undefined;
        const openForActions = item.actionsUntil > now;
        const canManage = item.canEdit && openForActions;
        const editItem = canManage && action?.kind === "edit" && action.item.id === item.id ? action.item : undefined;
        const confirming = canManage && action?.kind === "recall" && action.id === item.id;
        return <li key={item.id}>
          <article className="feedback-entry">
            <header className="feedback-author">
              {author ? <Avatar memberId={author.id} name={author.name} photoId={author.avatarId} size="small" />
                : <span className="feedback-anonymous" aria-hidden="true"><UserRound size={17} /></span>}
              <div>
                {author ? <MemberName as="strong" memberId={author.id} /> : <strong>Ẩn danh</strong>}
                <div className="feedback-entry-meta">
                  <time dateTime={new Date(item.createdAt).toISOString()}>{feedbackClock.format(item.createdAt)}</time>
                  {item.editedAt !== undefined && <span title={feedbackClock.format(item.editedAt)}>Đã chỉnh sửa</span>}
                  <span>{item.isPublic ? "Công khai" : "Riêng tư"}</span>
                  {!openForActions && <span>Đã khóa</span>}
                </div>
              </div>
            </header>
            <div className="feedback-recipients">
              <span>Gửi đến</span>
              {item.recipientIds.map(id => {
                const name = <MemberName memberId={id} />;
                return linkRecipients && identity?.members.has(id)
                  ? <button key={id} type="button" aria-haspopup="dialog" onClick={() => identity.openProfile(id)}>{name}</button>
                  : <span key={id} className="feedback-recipient">{name}</span>;
              })}
            </div>
            {editItem ? <EditFeedbackForm item={editItem} busy={busy} onEdit={onEdit} onClose={() => setAction(undefined)} /> : <>
              <p className="feedback-body">{item.body}</p>
              {confirming ? <div className="feedback-recall">
                <p>Xóa feedback này và các phản hồi?</p>
                <div className="feedback-entry-actions">
                  <Button variant="secondary" disabled={busy} onClick={() => setAction(undefined)}>Quay lại</Button>
                  <Button variant="danger" disabled={busy} onClick={async () => {
                    setError("");
                    if (await onRecall(item.id, setError)) setAction(undefined);
                  }}>Xác nhận xóa</Button>
                </div>
                {error && <p className="feedback-error" role="alert">{error}</p>}
              </div> : canManage && <div className="feedback-entry-actions">
                <button type="button" className="text-button" disabled={busy}
                  onClick={() => setAction({ kind: "edit", item })}>Chỉnh sửa</button>
                <button type="button" className="text-button" disabled={busy} onClick={() => {
                  setError("");
                  setAction({ kind: "recall", id: item.id });
                }}>Xóa feedback</button>
              </div>}
              {!confirming && <FeedbackConversation item={item} openForActions={openForActions} busy={busy}
                actions={conversationActions} initiallyOpen={expandConversation} />}
            </>}
          </article>
        </li>;
      })}
    </ol>
    {entries.length > limit && <Button variant="secondary" onClick={() => setLimit(value => value + pageSize)}>Xem thêm feedback</Button>}
  </>;
}

export function FeedbackPage({ entries, busy, onSubmit, onEdit, onRecall, conversationActions, focusId, focusPending, focusError, onBack }: {
  entries: FeedbackView[]; busy: boolean; onSubmit: SubmitFeedback; onEdit: EditFeedback; onRecall: RecallFeedback;
  conversationActions: FeedbackConversationActions;
  focusId?: string; focusPending: boolean; focusError: string; onBack: () => void;
}) {
  const [composing, setComposing] = useState(false);
  const focusedHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusId) focusedHeading.current?.focus();
  }, [focusId]);
  const close = () => setComposing(false);
  if (focusId) {
    const entry = entries.find(item => item.id === focusId);
    return <div className="feedback-page">
      <div className="page-heading">
        <h1 ref={focusedHeading} tabIndex={-1}>Cuộc trao đổi</h1>
        <Button variant="secondary" onClick={onBack}>Về danh sách feedback</Button>
      </div>
      {focusPending ? <p role="status">Đang mở cuộc trao đổi…</p>
        : entry ? <FeedbackList entries={[entry]} busy={busy} onEdit={onEdit} onRecall={onRecall}
          conversationActions={conversationActions} linkRecipients expandConversation />
        : <Empty title={focusError ? "Chưa mở được cuộc trao đổi" : "Cuộc trao đổi không còn hiển thị"} icon={MessageSquare} />}
    </div>;
  }
  return (
    <div className="feedback-page">
      <div className="page-heading">
        <div>
          <h1>Feedback</h1>
          <p>Trao đổi riêng với một hoặc nhiều thành viên trong Đội</p>
        </div>
        <Button onClick={() => setComposing(true)} disabled={busy}><Plus size={17} aria-hidden="true" /> Gửi feedback</Button>
      </div>
      <FeedbackList entries={entries} busy={busy} onEdit={onEdit} onRecall={onRecall} conversationActions={conversationActions} linkRecipients />
      {composing && <Dialog title="Gửi feedback" onClose={close} wide busy={busy}>
        <FeedbackComposer busy={busy} onSubmit={onSubmit} onSent={close} onCancel={close} />
      </Dialog>}
    </div>
  );
}

export function ProfileFeedback({ recipientId, entries, busy, onSubmit, onEdit, onRecall, conversationActions }: {
  recipientId: string; entries: FeedbackView[]; busy: boolean; onSubmit: SubmitFeedback; onEdit: EditFeedback; onRecall: RecallFeedback;
  conversationActions: FeedbackConversationActions;
}) {
  const [composing, setComposing] = useState(false);
  const [sent, setSent] = useState(false);
  return <section className="feedback-profile" aria-label="Feedback trên hồ sơ">
    {composing ? <FeedbackComposer initialRecipientId={recipientId} busy={busy} onSubmit={onSubmit}
      onCancel={() => setComposing(false)} onSent={() => { setComposing(false); setSent(true); }} /> : <>
      <div className="feedback-profile-actions">
        {sent && <span role="status">Đã gửi feedback</span>}
        <Button variant="secondary" disabled={busy} onClick={() => { setSent(false); setComposing(true); }}>
          <Plus size={16} aria-hidden="true" /> Gửi feedback
        </Button>
      </div>
      <FeedbackList entries={entries} busy={busy} onEdit={onEdit} onRecall={onRecall} conversationActions={conversationActions} />
    </>}
  </section>;
}
