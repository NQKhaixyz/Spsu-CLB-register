"use client";

import { Feather, Shield, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { Member } from "../lib/club";
import { sharingConsentVersion, sharingRule, type PublicSharingGroup, type SharingGroupSummary, type SharingView } from "../lib/sharing-types";
import { MemberName, useMemberIdentity } from "./member-identity";
import { formatScore } from "./scoreboard";
import { Avatar, Button, Dialog, Field, FormFooter } from "./ui";

type SharingAction = (action: string, data: Record<string, unknown>, message: string, onError?: (message: string) => void) => Promise<boolean>;
type SharingMine = NonNullable<SharingView["mine"]>;
type SharingConsent = {
  mode: "sendCupid" | "createGuild" | "joinCupid" | "joinGuild";
  label: string;
  count: number;
  data: Record<string, unknown>;
};
const consentCommands = {
  sendCupid: { action: "inviteCupid", button: "Xác nhận gửi lời mời", message: "Đã gửi lời mời Cupid" },
  createGuild: { action: "createGuild", button: "Xác nhận lập Bang hội", message: "Đã lập Bang hội" },
  joinCupid: { action: "answerSharingInvite", button: "Xác nhận tham gia Cupid", message: "Đã ghép Cupid" },
  joinGuild: { action: "answerSharingInvite", button: "Xác nhận vào Bang hội", message: "Đã vào Bang hội" },
} as const;

const dateTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});
const rosterOrder = new Intl.Collator("vi");
function groupLabel(group: PublicSharingGroup) {
  return group.kind === "cupid" ? "Cupid" : group.name;
}

export function SharingProfileCard({ memberId }: { memberId: string }) {
  const group = useMemberIdentity()?.sharingGroups?.get(memberId);
  return group && <div className="sharing-profile"><GroupCard group={group} profileMemberId={memberId} /></div>;
}

function GroupCard({ group, profileMemberId }: { group: PublicSharingGroup; profileMemberId?: string }) {
  const identity = useMemberIdentity();
  const cupid = group.kind === "cupid";
  const Icon = cupid ? Feather : Shield;
  return <section className="sharing-card" data-kind={group.kind} data-milestone={group.jointEvent || group.sevenDays}
    aria-label={cupid ? "Thẻ Cupid" : "Thẻ Bang hội"}>
    <header className="sharing-card-title">
      <span className="sharing-emblem"><Icon size={21} aria-hidden="true" /></span>
      <div>
        <h3>{groupLabel(group)} {group.code && <span className="sharing-code">#{group.code}</span>}</h3>
        <span>{dateTime.format(group.startedAt)} · {cupid ? "Ngày ghép" : `${group.memberIds.length} thành viên`}</span>
      </div>
    </header>
    <ul className="sharing-roster">
      {group.memberIds.map(id => {
        const member = identity?.members.get(id);
        if (!member) return null;
        return <li key={id}>
          <Avatar memberId={id} name={member.name} photoId={member.avatarId} profileLink={id !== profileMemberId} size={cupid ? "" : "small"} />
          <MemberName memberId={id} showSharing={false} />
          {id === group.leaderId && <span className="sharing-leader">Thủ lĩnh</span>}
        </li>;
      })}
    </ul>
    {cupid && <>
      <div className="sharing-milestones">
        {group.sevenDays && <span><Sparkles size={14} aria-hidden="true" /> 7 ngày đồng hành</span>}
        {group.jointEvent && <span><Users size={14} aria-hidden="true" /> Cùng dự sự kiện</span>}
      </div>
      {group.hashtags.some(tag => !profileMemberId || tag.memberId === profileMemberId) && <div className="sharing-tags">
        {group.hashtags.filter(tag => !profileMemberId || tag.memberId === profileMemberId)
          .map(tag => <span className="sharing-tag" key={tag.memberId + ":" + tag.text}>#{tag.text}</span>)}
      </div>}
    </>}
  </section>;
}

function Contributions({ summary }: { summary: SharingGroupSummary }) {
  return <ul className="sharing-contributions">
    {summary.contributions.map(row => <li key={row.memberId}>
      <MemberName memberId={row.memberId} showSharing={false} />
      <div><small>Đóng góp</small><strong>{formatScore(row.earned)}</strong></div>
      <div><small>Phần được chia</small><strong>{formatScore(row.received)}</strong></div>
    </li>)}
  </ul>;
}

function PeopleForm({ people, label, verb, busy, onCancel, onSelect }: {
  people: Member[]; label: string; verb: string; busy: boolean; onCancel: () => void;
  onSelect: (id: string) => Promise<boolean>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = String(new FormData(event.currentTarget).get("memberId") ?? "");
    if (id && await onSelect(id)) onCancel();
  }
  return <form className="sharing-form" onSubmit={submit}>
    <Field label={label}>
      <select name="memberId" required defaultValue="" disabled={busy}>
        <option value="" disabled>Chọn thành viên</option>
        {people.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}
      </select>
    </Field>
    <FormFooter label={verb} disabled={!people.length} busy={busy} onCancel={onCancel} />
  </form>;
}

function GuildForm({ group, busy, onAction, onCancel, onCreate }: {
  group?: PublicSharingGroup; busy: boolean; onAction: SharingAction; onCancel: () => void;
  onCreate?: (fields: Record<string, FormDataEntryValue>) => void;
}) {
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (!group) {
      onCreate?.(fields);
      return;
    }
    if (await onAction("editGuild", { ...fields, groupId: group.id }, "Đã cập nhật Bang hội")) onCancel();
  }
  return <form className="sharing-form" onSubmit={save}>
    <Field label="Tên bang"><input name="name" defaultValue={group?.name} minLength={2} maxLength={60} required disabled={busy} /></Field>
    <Field label="Ký hiệu viết tắt"><input name="code" defaultValue={group?.code} placeholder="C1" maxLength={13} required disabled={busy} /></Field>
    <FormFooter label={group ? "Lưu Bang hội" : "Đọc hướng dẫn lập bang"} busy={busy} onCancel={onCancel} />
  </form>;
}

function SharingConsentDialog({ consent, busy, onAction, onClose }: {
  consent: SharingConsent; busy: boolean; onAction: SharingAction; onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const guild = consent.mode === "createGuild" || consent.mode === "joinGuild";
  const command = consentCommands[consent.mode];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (acknowledged && await onAction(command.action, {
      ...consent.data, consentVersion: sharingConsentVersion, acceptedGuide: true,
    }, command.message, setError)) onClose();
  }
  return createPortal(<Dialog title={guild ? "Hướng dẫn tham gia Bang hội" : "Hướng dẫn tham gia Cupid"} description={consent.label}
    wide focusDialog busy={busy} onClose={onClose}>
    <form className="sharing-guide" onSubmit={submit}>
      <section>
        <h3>Điểm của bạn được tính thế nào</h3>
        <p>Tất cả điểm cộng và điểm trừ của các thành viên trong cùng giai đoạn được cộng lại rồi chia đều. Kết quả đi vào bảng điểm tuần, tháng, học kỳ, rank và Excel.</p>
        {consent.count === 1 ? <p>Bạn tính điểm cá nhân khi bang chỉ có một người. Điểm bắt đầu chia khi thành viên tiếp theo đồng ý vào bang.</p>
          : <p>{consent.count === 2 ? "Ví dụ một người được cộng 4 điểm, người kia bị trừ 2 điểm thì mỗi người nhận 1 điểm."
            : `Bang có ${consent.count} người sau khi bạn vào. Nếu tổng điểm của giai đoạn là ${consent.count}, mỗi người nhận 1 điểm.`}</p>}
      </section>
      <section>
        <h3>Khi nào bắt đầu và chốt điểm</h3>
        <p>Điểm xét theo giờ hoạt động tại Việt Nam. Sự kiện dùng giờ kết thúc, ca trực dùng giờ bắt đầu, cuộc họp dùng giờ đã đặt và khoản nhập tay dùng giờ thực tế BĐH ghi.</p>
        <p>Khoản chỉ có ngày được chia khi trọn ngày thuộc cùng một danh sách. Khi đổi danh sách hoặc kết thúc, điểm đã chia được chốt. Khoản duyệt muộn thuộc giai đoạn đã chốt và khoản điều chỉnh mới tính cá nhân.</p>
      </section>
      <section>
        <h3>Quyền và hiển thị</h3>
        <p>Mỗi người có một Cupid hoặc một Bang hội tại một thời điểm. Bạn xem lịch sử các giai đoạn của mình trong Góc của tôi.</p>
        {guild ? <p>Ký hiệu bang hiện cạnh tên mọi thành viên. Thủ lĩnh có thể mời, mời thành viên rời bang hoặc chuyển quyền. Bạn có thể tự rời và thủ lĩnh chuyển quyền trước khi rời nếu bang còn người.</p>
          : <p>Cupid bắt đầu khi cả hai đã đồng ý. Một trong hai có thể kết thúc ngay. Thẻ hồ sơ hiện cặp đang ghép và những hashtag đã được người nhận duyệt.</p>}
      </section>
      <label className="sharing-guide-check"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} />
        Tôi đã đọc hướng dẫn và đồng ý chia cả điểm cộng lẫn điểm trừ
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <FormFooter label={command.button} disabled={!acknowledged} busy={busy} onCancel={onClose} />
    </form>
  </Dialog>, document.body);
}

function CupidTags({ group, me, tags, busy, onAction }: {
  group: PublicSharingGroup; me: Member; tags: SharingMine["tags"]; busy: boolean; onAction: SharingAction;
}) {
  const own = tags.filter(tag => tag.authorId === me.id);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await onAction("proposeCupidTag", { groupId: group.id, text: new FormData(form).get("text") }, "Đã gửi hashtag để duyệt")) form.reset();
  }
  return <div className="sharing-tag-editor">
    <h3>Hashtag của cặp</h3>
    <form className="sharing-form sharing-tag-form" onSubmit={add}>
      <Field label="Hashtag cho người kia">
        <input name="text" required maxLength={31} placeholder="#TrựcC1CóNhau" disabled={busy || own.length >= 3} />
      </Field>
      <Button type="submit" disabled={busy || own.length >= 3}>Gửi hashtag</Button>
    </form>
    <p className="hint">{own.length}/3 hashtag đã đặt</p>
    {tags.length > 0 && <ul className="sharing-tag-list">{tags.map(tag => <li key={tag.id}>
      <span><strong>#{tag.text}</strong> · {tag.approved ? "Đã duyệt" : "Chờ duyệt"}</span>
      <div className="sharing-actions">
        {!tag.approved && tag.memberId === me.id && <Button disabled={busy}
          onClick={() => void onAction("approveCupidTag", { groupId: group.id, tagId: tag.id }, "Đã duyệt hashtag")}>Duyệt hashtag</Button>}
        <Button variant="secondary" disabled={busy}
          onClick={() => void onAction("removeCupidTag", { groupId: group.id, tagId: tag.id }, "Đã gỡ hashtag")}>Gỡ hashtag</Button>
      </div>
    </li>)}</ul>}
  </div>;
}

function GroupActions({ group, me, candidates, busy, onAction }: {
  group: PublicSharingGroup; me: Member; candidates: Member[]; busy: boolean; onAction: SharingAction;
}) {
  const identity = useMemberIdentity();
  const [editor, setEditor] = useState<"invite" | "edit" | "transfer">();
  const [confirm, setConfirm] = useState<{ memberId?: string }>();
  const leader = group.leaderId === me.id;
  const others = group.memberIds.flatMap(id => {
    const member = identity?.members.get(id);
    return member && id !== me.id ? [member] : [];
  });
  const leaveLabel = group.kind === "cupid" ? "Kết thúc Cupid" : "Rời Bang hội";
  const closeEditor = () => setEditor(undefined);
  return <>
    <div className="sharing-actions">
      {leader && <>
        <Button variant="secondary" disabled={busy} onClick={() => setEditor("invite")}>Mời người vào bang</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setEditor("edit")}>Sửa tên và ký hiệu</Button>
        {others.length > 0 && <Button variant="secondary" disabled={busy} onClick={() => setEditor("transfer")}>Chuyển quyền thủ lĩnh</Button>}
      </>}
      <Button variant="danger" disabled={busy || (leader && others.length > 0)} onClick={() => setConfirm({})}>{leaveLabel}</Button>
    </div>
    {leader && others.length > 0 && <p className="hint">Chuyển quyền thủ lĩnh trước khi rời bang</p>}
    {editor === "invite" && <PeopleForm people={candidates} label="Người được mời vào bang" verb="Gửi lời mời vào bang"
      busy={busy} onCancel={closeEditor} onSelect={memberId => onAction("inviteGuild", { groupId: group.id, memberId }, "Đã gửi lời mời vào bang")} />}
    {editor === "edit" && <GuildForm group={group} busy={busy} onAction={onAction} onCancel={closeEditor} />}
    {editor === "transfer" && <PeopleForm people={others} label="Thủ lĩnh mới" verb="Xác nhận chuyển quyền"
      busy={busy} onCancel={closeEditor}
      onSelect={memberId => onAction("transferGuildLeader", { groupId: group.id, memberId }, "Đã chuyển quyền thủ lĩnh")} />}
    {leader && others.length > 0 && <details className="sharing-members-admin">
      <summary>Quản lý thành viên bang</summary>
      <ul>{others.map(member => <li key={member.id}>
        <MemberName memberId={member.id} showSharing={false} />
        <Button variant="danger" disabled={busy} onClick={() => setConfirm({ memberId: member.id })}>Mời rời bang</Button>
      </li>)}</ul>
    </details>}
    {confirm && createPortal(<Dialog title={confirm.memberId ? "Mời thành viên rời bang" : leaveLabel}
      description={confirm.memberId ? <MemberName memberId={confirm.memberId} showSharing={false} /> : groupLabel(group)}
      busy={busy} onClose={() => setConfirm(undefined)}>
      <div className="sharing-dialog">
        <p>Điểm đã chia sẽ được chốt theo danh sách hiện tại.</p>
        <div className="sharing-actions">
          <Button variant="secondary" disabled={busy} onClick={() => setConfirm(undefined)}>Quay lại</Button>
          <Button variant="danger" disabled={busy} onClick={async () => {
            const memberId = confirm.memberId;
            if (await onAction(memberId ? "removeGuildMember" : "leaveSharingGroup",
              { groupId: group.id, memberId, confirm: memberId ?? group.id },
              memberId ? "Đã mời thành viên rời bang" : group.kind === "cupid" ? "Đã kết thúc Cupid" : "Đã rời Bang hội")) setConfirm(undefined);
          }}>{confirm.memberId ? "Xác nhận mời rời bang" : "Xác nhận " + leaveLabel.toLocaleLowerCase("vi")}</Button>
        </div>
      </div>
    </Dialog>, document.body)}
  </>;
}

export default function SharingPanel({ me, view, target, busy, onAction }: {
  me: Member; view: SharingView; target?: { id: string }; busy: boolean; onAction: SharingAction;
}) {
  const identity = useMemberIdentity();
  const section = useRef<HTMLElement>(null);
  const [editor, setEditor] = useState<"cupid" | "guild">();
  const [consent, setConsent] = useState<SharingConsent>();
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

  if (!mine) return null;
  return <section className="panel sharing-panel" aria-labelledby="my-sharing-title" tabIndex={-1} ref={section}>
    <header className="sharing-panel-title">
      <span className="sharing-emblem"><Feather size={21} aria-hidden="true" /></span>
      <h2 id="my-sharing-title">Cupid và Bang hội</h2>
    </header>
    {mine.invited.map(invite => {
      const incoming = invite.toId === me.id;
      return <article className="sharing-invite" key={invite.id} tabIndex={-1} data-sharing-target={invite.id}>
        <h3>{invite.kind === "cupid" ? "Lời mời ghép Cupid" : "Lời mời vào Bang hội"}</h3>
        <p>{incoming ? "Từ " : "Gửi đến "}<MemberName memberId={incoming ? invite.fromId : invite.toId} />{invite.groupName && ` · ${invite.groupName} #${invite.groupCode}`}</p>
        {incoming && <p className="hint">{sharingRule}{invite.groupSize && `. Bang sẽ có ${invite.groupSize + 1} người khi bạn tham gia`}</p>}
        <div className="sharing-actions">
          {incoming ? <>
            <Button disabled={busy} onClick={() => setConsent({
              mode: invite.kind === "cupid" ? "joinCupid" : "joinGuild",
              label: invite.groupName ?? identity?.members.get(invite.fromId)?.name ?? "Cupid",
              count: invite.groupSize ? invite.groupSize + 1 : 2,
              data: { id: invite.id, accept: true, groupPeriodId: invite.groupPeriodId },
            })}>Đọc hướng dẫn và xác nhận</Button>
            <Button variant="secondary" disabled={busy}
              onClick={() => void onAction("answerSharingInvite", { id: invite.id, accept: false }, "Đã từ chối lời mời")}>Từ chối</Button>
          </> : <Button variant="secondary" disabled={busy}
            onClick={() => void onAction("recallSharingInvite", { id: invite.id }, "Đã rút lời mời")}>Rút lời mời</Button>}
        </div>
      </article>;
    })}
    {group ? <div className="sharing-current" tabIndex={-1} data-sharing-target={group.id}>
      <GroupCard group={group} profileMemberId={me.id} />
      <GroupActions key={group.id} group={group} me={me} candidates={candidates} busy={busy} onAction={onAction} />
      {group.kind === "cupid" && <CupidTags group={group} me={me} tags={mine.tags} busy={busy} onAction={onAction} />}
      {mine.current && <div className="sharing-score-card">
        <h3>Điểm đóng góp giai đoạn này</h3>
        <p className="hint">Từ {dateTime.format(mine.current.startedAt)}</p>
        {group.memberIds.length === 1 ? <p>Bạn đang tính điểm cá nhân. Mời thêm một thành viên để bắt đầu chia điểm.</p>
          : <Contributions summary={mine.current} />}
      </div>}
    </div> : mine.eligible && <div className="sharing-choices">
      <p>{sharingRule}</p>
      <div className="sharing-actions">
        <Button variant="secondary" disabled={busy} onClick={() => setEditor("cupid")}><Feather size={16} aria-hidden="true" /> Mời ghép Cupid</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setEditor("guild")}><Shield size={16} aria-hidden="true" /> Lập Bang hội</Button>
      </div>
      {editor === "cupid" && <PeopleForm people={candidates} label="Người được mời ghép Cupid" verb="Gửi lời mời Cupid"
        busy={busy} onCancel={() => setEditor(undefined)} onSelect={async memberId => {
          setConsent({ mode: "sendCupid", label: identity?.members.get(memberId)?.name ?? "Cupid", count: 2, data: { memberId } });
          return true;
        }} />}
      {editor === "guild" && <GuildForm busy={busy} onAction={onAction} onCancel={() => setEditor(undefined)}
        onCreate={data => { setConsent({ mode: "createGuild", label: String(data.name), count: 1, data }); setEditor(undefined); }} />}
    </div>}
    {mine.history.length > 0 && <div className="sharing-history">
      <h3>Lịch sử chia điểm</h3>
      {mine.history.map(summary => <details key={summary.id} tabIndex={-1} data-sharing-target={summary.groupId}>
        <summary>{summary.name} · {dateTime.format(summary.startedAt)} đến {dateTime.format(summary.endedAt!)}</summary>
        <Contributions summary={summary} />
      </details>)}
    </div>}
    {consent && <SharingConsentDialog consent={consent} busy={busy} onAction={onAction} onClose={() => setConsent(undefined)} />}
  </section>;
}
