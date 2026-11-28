"use client";

import { useState, type FormEvent } from "react";
import { personKey } from "../lib/availability";
import { uid, type Member } from "../lib/club";
import { canReceiveDirectNotice, noticeBodyLimit, noticeTitleLimit } from "../lib/notification-types";
import { MemberName, MemberOption } from "./member-identity";
import { Dialog, Field, FormFooter } from "./ui";

type AudienceMode = "one" | "multiple" | "all";
const modes: { id: AudienceMode; label: string }[] = [
  { id: "one", label: "Một thành viên" },
  { id: "multiple", label: "Nhiều thành viên" },
  { id: "all", label: "Toàn Đội" },
];

export function DirectNoticeComposer({ senderId, people, busy, onSend, onClose }: {
  senderId: string; people: Member[]; busy: boolean;
  onSend: (draft: Record<string, unknown>, onError: (message: string) => void) => Promise<boolean>;
  onClose: () => void;
}) {
  const [id] = useState(uid);
  const [mode, setMode] = useState<AudienceMode>("one");
  const [person, setPerson] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const eligible = people.filter(member => canReceiveDirectNotice(member, senderId))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const queryKey = personKey(query);
  const shown = eligible.filter(member => personKey(member.name + " " + member.studentId).includes(queryKey));
  const recipients = mode === "one" ? eligible.filter(member => member.id === person) :
    mode === "multiple" ? eligible.filter(member => selected.includes(member.id)) : eligible;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !recipients.length) return;
    setError("");
    const data = new FormData(event.currentTarget);
    if (await onSend({
      id, title: data.get("title"), body: data.get("body"),
      audience: mode === "all" ? "all" : "members",
      recipientIds: mode === "all" ? undefined : recipients.map(member => member.id),
    }, setError)) onClose();
  }

  return <Dialog title="Soạn thông báo" onClose={onClose} busy={busy}>
    <form onSubmit={submit}>
      <Field label="Tiêu đề"><input name="title" required maxLength={noticeTitleLimit} disabled={busy} /></Field>
      <Field label="Nội dung ngắn"><textarea name="body" required maxLength={noticeBodyLimit} rows={4} disabled={busy} /></Field>
      <Field label="Đối tượng nhận">
        <select value={mode} disabled={busy} onChange={event => setMode(event.target.value as AudienceMode)}>
          {modes.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </Field>
      {mode === "one" ? <Field label="Thành viên">
        <select value={person} disabled={busy} onChange={event => setPerson(event.target.value)} required>
          <option value="" disabled>Chọn thành viên</option>
          {eligible.map(member => <MemberOption key={member.id} memberId={member.id} />)}
        </select>
      </Field> : mode === "multiple" ? <div className="direct-notice-picker">
        <Field label="Tìm người nhận">
          <input value={query} disabled={busy} onChange={event => setQuery(event.target.value)} />
        </Field>
        <fieldset>
          <legend className="sr-only">Chọn người nhận</legend>
          {shown.map(member => <label key={member.id} className="checkbox-label">
            <input type="checkbox" disabled={busy} checked={selected.includes(member.id)} onChange={event => {
              const checked = event.target.checked;
              setSelected(ids => checked ? [...ids, member.id] : ids.filter(id => id !== member.id));
            }} /> <MemberName memberId={member.id} />
          </label>)}
          {!shown.length && <p className="hint">Không tìm thấy tài khoản phù hợp</p>}
        </fieldset>
      </div> : null}
      <p className="hint" aria-live="polite">{recipients.length} tài khoản nhận thông báo</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <FormFooter label="Gửi thông báo" disabled={!recipients.length} busy={busy} onCancel={onClose} />
    </form>
  </Dialog>;
}
