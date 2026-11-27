"use client";

import { useMemo, useState, type FormEvent } from "react";
import { MessageSquare, Plus, UserRound } from "lucide-react";
import { personKey } from "../lib/availability";
import { uid } from "../lib/club";
import { feedbackBodyLimit, type FeedbackDraft, type FeedbackView } from "../lib/feedback";
import { MemberName, useMemberIdentity } from "./member-identity";
import { Avatar, Button, Dialog, Empty, Field, FormFooter } from "./ui";

export type SubmitFeedback = (draft: FeedbackDraft, onError: (message: string) => void) => Promise<boolean>;

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
      <p className="feedback-visibility-note">Cả Đội xem được nội dung trên hồ sơ người nhận</p>
    </fieldset>
    {error && <p className="feedback-error" role="alert">{error}</p>}
    <FormFooter label="Gửi feedback" busy={busy} onCancel={onCancel} />
  </form>;
}

export function FeedbackList({ entries, linkRecipients = false }: {
  entries: FeedbackView[]; linkRecipients?: boolean;
}) {
  const identity = useMemberIdentity();
  const [limit, setLimit] = useState(pageSize);
  if (!entries.length) return <Empty title="Chưa có feedback" icon={MessageSquare} />;
  return <>
    <ol className="feedback-list">
      {entries.slice(0, limit).map(item => {
        const author = !item.anonymous && item.authorId ? identity?.members.get(item.authorId) : undefined;
        return <li key={item.id}>
          <article className="feedback-entry">
            <header className="feedback-author">
              {author ? <Avatar memberId={author.id} name={author.name} photoId={author.avatarId} size="small" />
                : <span className="feedback-anonymous" aria-hidden="true"><UserRound size={17} /></span>}
              <div>
                {author ? <MemberName as="strong" memberId={author.id} /> : <strong>Ẩn danh</strong>}
                <time dateTime={new Date(item.createdAt).toISOString()}>{feedbackClock.format(item.createdAt)}</time>
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
            <p className="feedback-body">{item.body}</p>
          </article>
        </li>;
      })}
    </ol>
    {entries.length > limit && <Button variant="secondary" onClick={() => setLimit(value => value + pageSize)}>Xem thêm feedback</Button>}
  </>;
}

export function FeedbackPage({ entries, busy, onSubmit }: {
  entries: FeedbackView[]; busy: boolean; onSubmit: SubmitFeedback;
}) {
  const [composing, setComposing] = useState(false);
  const close = () => setComposing(false);
  return (
    <div className="feedback-page">
      <div className="page-heading">
        <div>
          <h1>Feedback</h1>
          <p>Gửi góp ý đến một hoặc nhiều thành viên trong Đội</p>
        </div>
        <Button onClick={() => setComposing(true)} disabled={busy}><Plus size={17} aria-hidden="true" /> Gửi feedback</Button>
      </div>
      <FeedbackList entries={entries} linkRecipients />
      {composing && <Dialog title="Gửi feedback" onClose={close} wide busy={busy}>
        <FeedbackComposer busy={busy} onSubmit={onSubmit} onSent={close} onCancel={close} />
      </Dialog>}
    </div>
  );
}

export function ProfileFeedback({ recipientId, entries, busy, onSubmit }: {
  recipientId: string; entries: FeedbackView[]; busy: boolean; onSubmit: SubmitFeedback;
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
      <FeedbackList entries={entries} />
    </>}
  </section>;
}
