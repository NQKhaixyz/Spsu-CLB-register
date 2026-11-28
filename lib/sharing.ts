import type { Club, Member } from "./club";
import { creditWalletBalance, mergeCupidCredits, separateCupidCredits } from "./games";
import { roundSharingScore, settleSharingPeriod, type sharingScoreBook } from "./sharing-scores";
import { activeSharingPeriod, canJoinSharing, sharingConsentVersion, sharingTagText, type SharingGroup, type SharingGroupSummary, type SharingInvite,
  type SharingKind, type SharingNoticeKind, type SharingPeriod, type SharingState, type SharingView } from "./sharing-types";

const actions = new Set(["inviteCupid", "createGuild", "inviteGuild", "answerSharingInvite", "recallSharingInvite",
  "editGuild", "transferGuildLeader", "leaveSharingGroup", "removeGuildMember", "proposeCupidTag", "approveCupidTag", "removeCupidTag"]);
const sevenDaysMs = 7 * 86_400_000;
const newId = () => crypto.randomUUID();

function need(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireSharingConsent(data: Record<string, unknown>) {
  need(data.consentVersion === sharingConsentVersion && data.acceptedGuide === true,
    "Đọc hướng dẫn và xác nhận đồng ý trước khi tham gia");
}

function currentGroup(state: SharingState, memberId: string) {
  return state.groups.find(group => activeSharingPeriod(group)?.memberIds.includes(memberId));
}

function notify(state: SharingState, targets: string[], actorId: string | undefined, kind: SharingNoticeKind, sharingId: string, now: number) {
  for (const memberId of new Set(targets)) {
    if (memberId !== actorId) state.notices.push({ id: newId(), memberId, actorId, kind, sharingId, createdAt: now });
  }
}

function pruneInvites(club: Club, state: SharingState) {
  const eligible = new Set(club.members.filter(canJoinSharing).map(member => member.id));
  const occupied = new Set(state.groups.flatMap(group => activeSharingPeriod(group)?.memberIds ?? []));
  state.invites = state.invites.filter(invite => {
    if (!eligible.has(invite.toId) || occupied.has(invite.toId)) return false;
    if (invite.kind === "cupid") return eligible.has(invite.fromId) && !occupied.has(invite.fromId);
    return state.groups.some(group => group.id === invite.groupId && activeSharingPeriod(group));
  });
}

function replaceRoster(club: Club, group: SharingGroup, period: SharingPeriod, memberIds: string[], now: number) {
  if (period.asset === "credits") separateCupidCredits(club, period, now);
  settleSharingPeriod(club, group, period, now);
  if (memberIds.length) group.periods.push({ id: newId(), memberIds, startedAt: now });
}

export function activateCreditSharing(club: Club, now: number) {
  if (club.creditSharingSince !== undefined) return false;
  const state = club.sharing;
  if (state) {
    for (const group of state.groups) {
      const period = activeSharingPeriod(group);
      if (!period) continue;
      settleSharingPeriod(club, group, period, now);
      if (group.kind !== "cupid" || period.memberIds.length !== 2 ||
        !period.memberIds.every(id => club.members.some(member => member.id === id && canJoinSharing(member)))) continue;
      const credits: SharingPeriod = { id: newId(), memberIds: [...period.memberIds], startedAt: now, asset: "credits" };
      mergeCupidCredits(club, credits, now);
      group.periods.push(credits);
    }
    state.invites = [];
    state.notices = state.notices.filter(notice => !notice.kind.startsWith("guild") && notice.kind !== "cupidInvite");
  }
  club.creditSharingSince = now;
  return true;
}

function guildName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  need(name.length >= 2 && name.length <= 60, "Tên bang cần từ 2 đến 60 ký tự");
  return name;
}

function guildFields(state: SharingState, data: Record<string, unknown>) {
  const name = guildName(data.name);
  const code = sharingTagText(data.code).toUpperCase();
  need(/^[\p{L}\p{N}_-]{1,12}$/u.test(code), "Ký hiệu bang cần từ 1 đến 12 chữ, số, gạch ngang hoặc gạch dưới");
  need(!state.groups.some(item => item.kind === "guild" && item.code === code && activeSharingPeriod(item)), "Ký hiệu này đang được một bang khác dùng");
  return { name, code };
}

function cupidHashtag(group: SharingGroup) {
  return group.hashtag ?? group.tags?.find(tag => tag.approved)?.text;
}

function validateCupidTag(value: unknown) {
  const text = sharingTagText(value);
  need(/^[\p{L}\p{N}_-]{1,30}$/u.test(text), "Hashtag Cupid cần từ 1 đến 30 chữ, số, gạch ngang hoặc gạch dưới");
  return text;
}

function leaveGroup(club: Club, state: SharingState, group: SharingGroup, period: SharingPeriod, memberId: string,
  actorId: string | undefined, now: number, forced: boolean) {
  if (group.kind === "cupid") {
    replaceRoster(club, group, period, [], now);
    delete group.tags;
    delete group.hashtag;
    notify(state, period.memberIds, actorId, "cupidEnded", group.id, now);
  } else {
    const remaining = period.memberIds.filter(id => id !== memberId);
    need(forced || group.leaderId !== memberId || !remaining.length, "Chuyển quyền thủ lĩnh trước khi rời bang");
    replaceRoster(club, group, period, remaining, now);
    if (group.leaderId === memberId) {
      group.leaderId = remaining[0];
      if (group.leaderId) notify(state, remaining, actorId, "guildLeader", group.id, now);
    }
    notify(state, remaining, memberId, "guildLeft", group.id, now);
    if (actorId !== memberId) notify(state, [memberId], actorId, "guildRemoved", group.id, now);
  }
}

function sendInvite(club: Club, state: SharingState, me: Member, toId: unknown, now: number,
  { group, cupidTag }: { group?: SharingGroup; cupidTag?: string }) {
  const to = club.members.find(member => member.id === toId);
  need(to && to.id !== me.id && canJoinSharing(to), "Chọn một tài khoản thành viên đang hoạt động");
  need(!currentGroup(state, to.id), "Thành viên này đang có Cupid hoặc Bang hội");
  const duplicate = state.invites.some(invite => group
    ? invite.groupId === group.id && invite.toId === to.id
    : invite.kind === "cupid" && ((invite.fromId === me.id && invite.toId === to.id) ||
      (invite.toId === me.id && invite.fromId === to.id)));
  need(!duplicate, "Đã có lời mời đang chờ giữa các bên");
  const invite: SharingInvite = { id: newId(), kind: group ? "guild" : "cupid", groupId: group?.id, fromId: me.id, toId: to.id,
    consentVersion: group ? undefined : sharingConsentVersion, cupidTag };
  state.invites.push(invite);
  notify(state, [to.id], me.id, group ? "guildInvite" : "cupidInvite", invite.id, now);
}

function answerInvite(club: Club, state: SharingState, me: Member, data: Record<string, unknown>, now: number) {
  const invite = state.invites.find(item => item.id === data.id && item.toId === me.id);
  need(invite, "Lời mời đã hết hiệu lực");
  need(typeof data.accept === "boolean", "Chọn cách xử lý lời mời");
  if (data.accept) {
    requireSharingConsent(data);
    need(!currentGroup(state, me.id), "Rời vai trò hiện tại trước khi chấp nhận");
    if (invite.kind === "cupid") {
      need(invite.consentVersion === sharingConsentVersion, "Người mời cần đọc hướng dẫn mới và gửi lại lời mời");
      const inviter = club.members.find(member => member.id === invite.fromId);
      need(inviter && canJoinSharing(inviter) && !currentGroup(state, inviter.id), "Người mời đã có vai trò hoặc đã ngừng hoạt động");
      const memberIds = [inviter.id, me.id];
      const period: SharingPeriod = { id: newId(), memberIds, startedAt: now,
        ...(club.creditSharingSince !== undefined ? { asset: "credits" } : {}) };
      const group: SharingGroup = { id: invite.id, kind: "cupid", name: "Cupid", hashtag: invite.cupidTag, periods: [period] };
      if (period.asset === "credits") mergeCupidCredits(club, period, now);
      state.groups.push(group);
      notify(state, memberIds, me.id, "cupidAccepted", group.id, now);
    } else {
      const group = state.groups.find(item => item.id === invite.groupId && item.kind === "guild");
      const period = group && activeSharingPeriod(group);
      need(group && period, "Bang hội này đã đóng");
      need(data.groupPeriodId === period.id, "Danh sách bang vừa thay đổi. Cập nhật dữ liệu và đọc lại hướng dẫn trước khi tham gia");
      const next = [...period.memberIds, me.id];
      replaceRoster(club, group, period, next, now);
      notify(state, next, me.id, "guildJoined", group.id, now);
    }
  }
  state.invites = state.invites.filter(item => item.id !== invite.id);
}

function changeCupidTag(state: SharingState, group: SharingGroup, period: SharingPeriod, me: Member, action: string,
  data: Record<string, unknown>, now: number) {
  need(group.kind === "cupid", "Hashtag này thuộc cặp Cupid");
  need(!cupidHashtag(group), "Hashtag Cupid đã được chốt cho cặp này");
  const pending = group.tags?.[0];
  if (action === "proposeCupidTag") {
    need(!pending, "Cặp này đã có một đề xuất hashtag đang chờ duyệt");
    const memberId = period.memberIds.find(id => id !== me.id);
    need(memberId, "Chưa có người nhận hashtag");
    const text = validateCupidTag(data.text);
    group.tags = [{ id: newId(), authorId: me.id, memberId, text, approved: false }];
    notify(state, [memberId], me.id, "cupidTag", group.id, now);
    return;
  }
  need(pending && pending.id === data.tagId, "Đề xuất hashtag đã hết hiệu lực");
  if (action === "approveCupidTag") {
    need(pending.memberId === me.id, "Chỉ người nhận đề xuất mới được duyệt");
    group.hashtag = pending.text;
  }
  delete group.tags;
}

export function applySharingAction(club: Club, me: Member, action: string, data: Record<string, unknown>, now = Date.now()) {
  if (!actions.has(action)) return false;
  if (club.creditSharingSince !== undefined) need(!action.includes("Guild"), "Bang hội đã ngừng hoạt động");
  need(canJoinSharing(me), "Cupid dành cho tài khoản thành viên đang hoạt động");
  const state = club.sharing ??= { groups: [], invites: [], locked: [], notices: [] };
  pruneInvites(club, state);
  const group = currentGroup(state, me.id);
  if (action === "answerSharingInvite") {
    answerInvite(club, state, me, data, now);
  } else if (action === "recallSharingInvite") {
    const invite = state.invites.find(item => item.id === data.id &&
      (item.kind === "cupid" ? item.fromId === me.id : group?.id === item.groupId && group?.leaderId === me.id));
    need(invite, "Không tìm thấy lời mời của bạn");
    state.invites = state.invites.filter(item => item.id !== invite.id);
  } else if (action === "inviteCupid" || action === "createGuild") {
    need(!group, "Mỗi thành viên chỉ có thể có một Cupid hoặc Bang hội");
    requireSharingConsent(data);
    if (action === "inviteCupid") sendInvite(club, state, me, data.memberId, now, { cupidTag: validateCupidTag(data.cupidTag) });
    else {
      const fields = guildFields(state, data);
      state.groups.push({ id: newId(), kind: "guild", ...fields, leaderId: me.id,
        periods: [{ id: newId(), memberIds: [me.id], startedAt: now }] });
    }
  } else {
    const period = group && activeSharingPeriod(group);
    need(group && period && group.id === data.groupId, "Vai trò hiện tại đã thay đổi, hãy tải lại");
    if (action === "leaveSharingGroup") {
      need(data.confirm === group.id, "Xác nhận trước khi kết thúc hoặc rời nhóm");
      leaveGroup(club, state, group, period, me.id, me.id, now, false);
    } else if (action === "proposeCupidTag" || action === "approveCupidTag" || action === "removeCupidTag") {
      changeCupidTag(state, group, period, me, action, data, now);
    } else {
      need(group.kind === "guild" && group.leaderId === me.id, "Chỉ thủ lĩnh được quản lý Bang hội");
      if (action === "inviteGuild") sendInvite(club, state, me, data.memberId, now, { group });
      if (action === "editGuild") {
        need(data.code === undefined || sharingTagText(data.code).toUpperCase() === group.code, "Ký hiệu của Bang hội đã được chốt");
        group.name = guildName(data.name);
      }
      if (action === "transferGuildLeader" || action === "removeGuildMember") {
        const memberId = period.memberIds.find(id => id === data.memberId && id !== me.id);
        need(memberId, "Chọn một thành viên khác trong bang");
        if (action === "transferGuildLeader") {
          group.leaderId = memberId;
          notify(state, period.memberIds, me.id, "guildLeader", group.id, now);
        } else {
          need(data.confirm === memberId, "Xác nhận trước khi mời thành viên rời bang");
          leaveGroup(club, state, group, period, memberId, me.id, now, false);
        }
      }
    }
  }
  pruneInvites(club, state);
  return true;
}

export function endSharingForMember(club: Club, memberId: string, now = Date.now()) {
  const state = club.sharing;
  if (!state) return;
  const group = currentGroup(state, memberId);
  const period = group && activeSharingPeriod(group);
  if (group && period) leaveGroup(club, state, group, period, memberId, undefined, now, true);
  state.invites = state.invites.filter(item => item.toId !== memberId && (item.kind !== "cupid" || item.fromId !== memberId));
  pruneInvites(club, state);
}

export function eraseSharingMembers(club: Club, removed: ReadonlySet<string>, now = Date.now()) {
  const state = club.sharing;
  if (!state || !removed.size) return;
  for (const id of removed) endSharingForMember(club, id, now);
  for (const group of state.groups) {
    for (const period of group.periods) period.memberIds = period.memberIds.filter(id => !removed.has(id));
    group.periods = group.periods.filter(period => period.memberIds.length);
  }
  state.groups = state.groups.filter(group => group.periods.length);
  state.invites = state.invites.filter(item => !removed.has(item.fromId) && !removed.has(item.toId));
  state.notices = state.notices.filter(notice => !removed.has(notice.memberId)).map(notice =>
    notice.actorId && removed.has(notice.actorId) ? { ...notice, actorId: undefined } : notice);
  state.locked = state.locked.map(row => ({
    ...row, memberIds: row.memberIds.filter(id => !removed.has(id)),
    ...(row.sourceMemberId && removed.has(row.sourceMemberId) ? {
      sourceKey: undefined, sourceMemberId: undefined, originalPoints: undefined,
    } : {}),
  })).filter(row => row.memberIds.length);
}

type Book = ReturnType<typeof sharingScoreBook>;
function periodSummary(group: SharingGroup, period: SharingPeriod, book: Book): SharingGroupSummary {
  const rows = book.contributions.get(period.id) ?? [];
  return { id: period.id, groupId: group.id, kind: group.kind, name: group.name, startedAt: period.startedAt, endedAt: period.endedAt,
    ...(period.endingCreditBalance !== undefined ? { balanceCents: period.endingCreditBalance } : {}),
    contributions: period.memberIds.map(memberId => ({
      memberId,
      earned: roundSharingScore(rows.reduce((sum, row) => sum + (row.sourceMemberId === memberId ? row.originalPoints ?? 0 : 0), 0)),
      received: roundSharingScore(rows.reduce((sum, row) => sum + (row.memberIds.includes(memberId) ? row.share : 0), 0)),
    })),
  };
}

export function sharingViewFor(club: Club, me: Member, book: Book, now = Date.now()): SharingView {
  const state = club.sharing;
  const groups = state?.groups ?? [];
  const active = state && currentGroup(state, me.id);
  const current = active && activeSharingPeriod(active);
  const pendingTag = active?.kind === "cupid" && !cupidHashtag(active) ? active.tags?.[0] : undefined;
  const eligible = canJoinSharing(me);
  const occupied = new Set(groups.flatMap(group => activeSharingPeriod(group)?.memberIds ?? []));
  const historicGroups = club.creditSharingSince === undefined ? groups : groups.filter(group => group.kind === "cupid");
  const history = historicGroups.flatMap(group => group.periods.filter(period => period.endedAt !== undefined && period.memberIds.includes(me.id))
    .map(period => periodSummary(group, period, book))).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  const summary = active && current ? periodSummary(active, current, book) : undefined;
  if (summary && current?.asset === "credits") summary.balanceCents = creditWalletBalance(club, me.id);
  return {
    groups: groups.flatMap(group => {
      const period = activeSharingPeriod(group);
      if (!period) return [];
      const startedAt = group.periods[0].startedAt;
      const hashtag = group.kind === "cupid" ? cupidHashtag(group) : group.code;
      return [{ id: group.id, kind: group.kind, name: group.name, code: group.code, leaderId: group.leaderId,
        memberIds: period.memberIds, startedAt, sevenDays: group.kind === "cupid" && now - startedAt >= sevenDaysMs,
        jointEvent: !!group.jointEvent || book.jointEvents.has(group.id),
        hashtag,
        // Cached versions use this list to render the shared Cupid hashtag.
        hashtags: group.kind === "cupid" && hashtag ? period.memberIds.map(memberId => ({ memberId, text: hashtag })) : [],
      }];
    }),
    mine: eligible || history.length ? {
      eligible,
      availableMemberIds: eligible ? club.members.filter(member => member.id !== me.id && canJoinSharing(member) && !occupied.has(member.id))
        .map(member => member.id) : [],
      invited: (state?.invites ?? []).flatMap(invite => {
        const guild = groups.find(group => group.id === invite.groupId);
        if (invite.toId !== me.id && (invite.kind === "cupid" ? invite.fromId !== me.id : guild?.leaderId !== me.id)) return [];
        const roster = guild && activeSharingPeriod(guild);
        return [{ ...invite, groupName: guild?.name, groupCode: guild?.code,
          groupSize: roster?.memberIds.length, groupPeriodId: roster?.id }];
      }),
      tags: pendingTag ? [pendingTag] : [],
      current: summary,
      history,
    } : undefined,
  };
}
