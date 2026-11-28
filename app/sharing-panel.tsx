"use client";

import { Heart, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { Member } from "../lib/club";
import { formatCredits } from "../lib/games";
import { sharingConsentVersion, sharingRule, sharingTagText, type CupidTag, type PublicSharingGroup, type SharingView } from "../lib/sharing-types";
import { MemberName, MemberOption, useMemberIdentity } from "./member-identity";
import { formatScore } from "../lib/score-format";
import { Avatar, Button, Dialog, Field, FormFooter } from "./ui";

type SharingAction = (action: string, data: Record<string, unknown>, message: string, onError?: (message: string) => void) => Promise<boolean>;
type InvitationConsent = { joining: boolean; name: string; hashtag?: string; data: Record<string, unknown> };

const dateTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});
const rosterOrder = new Intl.Collator("vi");

export function SharingProfileCard({ memberId }: { memberId: string }) {
  const group = useMemberIdentity()?.sharingGroups?.get(memberId);
  return group?.kind === "cupid" && <div className="sharing-profile"><CupidCard group={group} profileMemberId={memberId} /></div>;
}

function CupidCard({ group, profileMemberId }: { group: PublicSharingGroup; profileMemberId?: string }) {
  const identity = useMemberIdentity();
  return <section className="sharing-card" data-kind="cupid" data-milestone={group.jointEvent || group.sevenDays} aria-label="Thẻ Cupid">
    <header className="sharing-card-title">
      <span className="sharing-emblem"><Heart size={21} fill="currentColor" aria-hidden="true" /></span>
      <div><h3>Cupid</h3><span>Ghép từ {dateTime.format(group.startedAt)}</span></div>
    </header>
    <ul className="sharing-roster">
      {group.memberIds.map(id => {
        const member = identity?.members.get(id);
        return member && <li key={id}>
          <Avatar memberId={id} name={member.name} photoId={member.avatarId} profileLink={id !== profileMemberId} />
          <MemberName memberId={id} />
        </li>;
      })}
    </ul>
    <div className="sharing-milestones">
      {group.sevenDays && <span><Sparkles size={14} aria-hidden="true" /> 7 ngày đồng hành</span>}
      {group.jointEvent && <span><Users size={14} aria-hidden="true" /> Cùng dự sự kiện</span>}
    </div>
  </section>;
}

function ConsentDialog({ consent, busy, onAction, onClose }: {
  consent: InvitationConsent; busy: boolean; onAction: SharingAction; onClose: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const button = consent.joining ? "Xác nhận tham gia Cupid" : "Xác nhận gửi lời mời";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const action = consent.joining ? "answerSharingInvite" : "inviteCupid";
    if (accepted && await onAction(action, { ...consent.data, consentVersion: sharingConsentVersion, acceptedGuide: true },
      consent.joining ? "Đã ghép Cupid" : "Đã gửi lời mời Cupid", setError)) onClose();
  }

  return createPortal(<Dialog title="Hướng dẫn tham gia Cupid" description={<>{consent.name}{consent.hashtag && " · #" + consent.hashtag}</>}
    wide focusDialog busy={busy} onClose={onClose}>
    <form className="sharing-guide" onSubmit={submit}>
      <section><h3>Gộp ví credits</h3>
        <p>{sharingRule}. Ví dụ một người có 8.000 và người kia có 12.000 thì mỗi người thấy 10.000 credits.</p>
        <p>Mỗi lượt cược, tiền thắng, tiền hoàn, đổi điểm hoặc điều chỉnh sẽ thay đổi ví chung. Nếu ví được cộng 2.000 credits thì số dư của mỗi người tăng 1.000.</p>
      </section>
      <section><h3>Điểm hoạt động và hashtag</h3>
        <p>Điểm tuần, tháng và học kỳ được ghi riêng theo tài khoản. Hai bạn dùng chung một hashtag hiện cạnh tên.</p>
      </section>
      <section><h3>Kết thúc Cupid</h3>
        <p>Một trong hai có thể kết thúc bất cứ lúc nào. Mỗi người giữ số dư đã chia và dùng ví riêng kể từ lúc đó. Phần lẻ 0,01 credit nếu có được chuyển cho người gửi lời mời.</p>
      </section>
      <label className="sharing-guide-check">
        <input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} />
        Tôi đã đọc hướng dẫn và đồng ý gộp ví credits
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <FormFooter label={button} disabled={!accepted} busy={busy} onCancel={onClose} />
    </form>
  </Dialog>, document.body);
}

function CupidTagSetup({ groupId, memberId, pending, busy, onAction }: {
  groupId: string; memberId: string; pending?: CupidTag; busy: boolean; onAction: SharingAction;
}) {
  const receiving = pending?.memberId === memberId;
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get("text");
    await onAction("proposeCupidTag", { groupId, text }, "Đã gửi đề xuất hashtag");
  }
  return <div className="sharing-tag-editor">
    <h3>Hashtag của cặp</h3>
    {pending ? <>
      <p><strong>#{pending.text}</strong> · Chờ duyệt</p>
      <div className="sharing-actions">
        {receiving && <Button disabled={busy}
          onClick={() => void onAction("approveCupidTag", { groupId, tagId: pending.id }, "Đã chốt hashtag")}>Duyệt hashtag</Button>}
        <Button variant="secondary" disabled={busy}
          onClick={() => void onAction("removeCupidTag", { groupId, tagId: pending.id }, "Đã bỏ đề xuất hashtag")}>
          {receiving ? "Từ chối hashtag" : "Rút đề xuất"}
        </Button>
      </div>
    </> : <form className="sharing-form sharing-tag-form" onSubmit={add}>
      <Field label="Hashtag chung của cặp"><input name="text" required maxLength={31} placeholder="#TrựcC1CóNhau" disabled={busy} /></Field>
      <Button type="submit" disabled={busy}>Gửi hashtag</Button>
    </form>}
  </div>;
}

export default function SharingPanel({ me, view, target, busy, onAction }: {
  me: Member; view: SharingView; target?: { id: string }; busy: boolean; onAction: SharingAction;
}) {
  const identity = useMemberIdentity();
  const section = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [consent, setConsent] = useState<InvitationConsent>();
  const mine = view.mine;
  const group = identity?.sharingGroups?.get(me.id);
  const candidates = (mine?.availableMemberIds ?? []).flatMap(id => {
    const member = identity?.members.get(id);
    return member ? [member] : [];
  }).sort((a, b) => rosterOrder.compare(a.name, b.name));

  useEffect(() => {
    if (!target || !section.current) return;
    const match = [...section.current.querySelectorAll<HTMLElement>("[data-sharing-target]")]
      .find(element => element.dataset.sharingTarget === target.id);
    if (match?.tagName === "DETAILS") (match as HTMLDetailsElement).open = true;
    const focused = match ?? section.current;
    focused.focus({ preventScroll: true });
    focused.scrollIntoView({ block: "start" });
  }, [target, view]);

  function prepareInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const memberId = String(fields.get("memberId") ?? "");
    const cupidTag = sharingTagText(fields.get("text"));
    const person = candidates.find(member => member.id === memberId);
    if (!person || !cupidTag) return;
    setConsent({ joining: false, name: person.name, hashtag: cupidTag, data: { memberId, cupidTag } });
    setEditing(false);
  }

  if (!mine) return null;
  return <section className="panel sharing-panel" aria-labelledby="my-sharing-title" tabIndex={-1} ref={section}>
    <header className="sharing-panel-title">
      <span className="sharing-emblem"><Heart size={21} fill="currentColor" aria-hidden="true" /></span>
      <h2 id="my-sharing-title">Cupid</h2>
    </header>
    {mine.invited.filter(invite => invite.kind === "cupid").map(invite => {
      const incoming = invite.toId === me.id;
      return <article className="sharing-invite" key={invite.id} tabIndex={-1} data-sharing-target={invite.id}>
        <h3>Lời mời ghép Cupid</h3>
        <p>{incoming ? "Từ " : "Gửi đến "}<MemberName memberId={incoming ? invite.fromId : invite.toId} /></p>
        {invite.cupidTag && <p>Hashtag chung <strong>#{invite.cupidTag}</strong></p>}
        {incoming && <p className="hint">{sharingRule}</p>}
        <div className="sharing-actions">
          {incoming ? <>
            <Button disabled={busy} onClick={() => setConsent({ joining: true,
              name: identity?.members.get(invite.fromId)?.name ?? "Cupid", hashtag: invite.cupidTag,
              data: { id: invite.id, accept: true } })}>Đọc hướng dẫn và xác nhận</Button>
            <Button variant="secondary" disabled={busy}
              onClick={() => void onAction("answerSharingInvite", { id: invite.id, accept: false }, "Đã từ chối lời mời")}>Từ chối</Button>
          </> : <Button variant="secondary" disabled={busy}
            onClick={() => void onAction("recallSharingInvite", { id: invite.id }, "Đã rút lời mời")}>Rút lời mời</Button>}
        </div>
      </article>;
    })}
    {group?.kind === "cupid" ? <div className="sharing-current" tabIndex={-1} data-sharing-target={group.id}>
      <CupidCard group={group} profileMemberId={me.id} />
      {mine.current?.balanceCents !== undefined && <div className="sharing-score-card">
        <h3>Số dư credits mỗi người</h3><strong>{formatCredits(mine.current.balanceCents)} credits</strong>
      </div>}
      {!group.hashtag && <CupidTagSetup groupId={group.id} memberId={me.id} pending={mine.tags[0]} busy={busy} onAction={onAction} />}
      <div className="sharing-actions"><Button variant="danger" disabled={busy} onClick={() => setEnding(true)}>Kết thúc Cupid</Button></div>
      {ending && createPortal(<Dialog title="Kết thúc Cupid" busy={busy} onClose={() => setEnding(false)}>
        <p>Mỗi người sẽ giữ số dư credits đang hiển thị của mình.</p>
        <div className="sharing-actions">
          <Button variant="secondary" disabled={busy} onClick={() => setEnding(false)}>Quay lại</Button>
          <Button variant="danger" disabled={busy} onClick={async () => {
            if (await onAction("leaveSharingGroup", { groupId: group.id, confirm: group.id }, "Đã kết thúc Cupid")) setEnding(false);
          }}>Xác nhận kết thúc Cupid</Button>
        </div>
      </Dialog>, document.body)}
    </div> : mine.eligible && <div className="sharing-choices">
      <p>{sharingRule}</p>
      <div className="sharing-actions">
        <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}><Heart size={16} aria-hidden="true" /> Mời ghép Cupid</Button>
      </div>
      {editing && <form className="sharing-form" onSubmit={prepareInvite}>
        <Field label="Người được mời ghép Cupid">
          <select name="memberId" required defaultValue="" disabled={busy}>
            <option value="" disabled>Chọn thành viên</option>
            {candidates.map(person => <MemberOption key={person.id} memberId={person.id} />)}
          </select>
        </Field>
        <Field label="Hashtag chung của cặp"><input name="text" required maxLength={31} placeholder="#TrựcC1CóNhau" disabled={busy} /></Field>
        <FormFooter label="Gửi lời mời Cupid" disabled={!candidates.length} busy={busy} onCancel={() => setEditing(false)} />
      </form>}
    </div>}
    {mine.history.length > 0 && <div className="sharing-history">
      <h3>Lịch sử Cupid</h3>
      {mine.history.map(summary => <details key={summary.id} tabIndex={-1} data-sharing-target={summary.groupId}>
        <summary>{dateTime.format(summary.startedAt)} – {dateTime.format(summary.endedAt!)}</summary>
        {summary.balanceCents !== undefined ? <p>Số dư lúc kết thúc {formatCredits(summary.balanceCents)} credits mỗi người</p>
          : <ul className="sharing-contributions">
            {summary.contributions.map(row => <li key={row.memberId}><MemberName memberId={row.memberId} />
              <div><small>Điểm đóng góp</small><strong>{formatScore(row.earned)}</strong></div>
              <div><small>Điểm đã chia</small><strong>{formatScore(row.received)}</strong></div>
            </li>)}
          </ul>}
      </details>)}
    </div>}
    {consent && <ConsentDialog consent={consent} busy={busy} onAction={onAction} onClose={() => setConsent(undefined)} />}
  </section>;
}
