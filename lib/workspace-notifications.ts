import { bulletinAuthorId, isBulletinPublished } from "./bulletin";
import { isRosterMember, isShiftPublished, today, weekId, weeklyScoreFor, type Club, type Member, type Schedule, type Shift } from "./club";
import { roundSharingScore, sharingScoreBook } from "./sharing-scores";

type Notice = { id: string; createdAt: number; actorId?: string; read?: true };
type ScoreUpdate = { kind: "score"; week: string; change: number };
type DutyAssignment = { kind: "duty"; month: string; shiftId: string };
export type StoredActivityNotice = Notice & { memberId: string } & (ScoreUpdate | DutyAssignment);
export type WorkspaceNotification = Notice & (
  | { kind: "bulletin"; postId: string; postTitle: string }
  | ScoreUpdate
  | { kind: "duty"; week: string; date: string; period: Shift["period"]; startTime?: string; endTime?: string }
);

function dutyIsVisible(schedule: Schedule, shift: Shift) {
  return !shift.cancelled && isShiftPublished(schedule, shift);
}

export function workspaceNotificationsFor(club: Club, viewerId: string, now = Date.now()): WorkspaceNotification[] {
  const viewer = club.members.find(member => member.id === viewerId && member.active);
  if (!viewer) return [];
  const notifications: WorkspaceNotification[] = [];
  for (const post of club.bulletinPosts ?? []) {
    const notice = post.notice;
    if (!notice || notice.appearsAt > now || !isBulletinPublished(post, now) || viewer.joined > today(new Date(notice.appearsAt))) continue;
    const actorId = bulletinAuthorId(club, post);
    if (actorId === viewerId) continue;
    notifications.push({ id: notice.id, createdAt: notice.appearsAt, actorId,
      read: notice.readBy?.includes(viewerId) ? true : undefined, kind: "bulletin", postId: post.id, postTitle: post.title });
  }
  if (!isRosterMember(viewer)) return notifications;
  const weeks = new Set(club.weeks.map(week => week.id));
  for (const { memberId, ...notice } of club.activityNotices ?? []) {
    if (memberId !== viewerId) continue;
    if (notice.kind === "score") {
      if (weeks.has(notice.week)) notifications.push(notice);
    } else {
      const { month, shiftId, ...details } = notice;
      const schedule = club.schedules.find(item => item.month === month);
      const shift = schedule?.shifts.find(item => item.id === shiftId);
      if (!schedule || !shift || !dutyIsVisible(schedule, shift) ||
        !shift.assignments.some(item => item.memberId === viewerId && item.result !== "cancelled")) continue;
      const { date, period, startTime, endTime } = shift;
      notifications.push({ ...details, week: weekId(date), date, period, startTime, endTime });
    }
  }
  return notifications;
}

export function markWorkspaceNotificationRead(club: Club, viewerId: string, id: string, now = Date.now()) {
  const visible = workspaceNotificationsFor(club, viewerId, now).find(item => item.id === id);
  if (!visible) return false;
  if (visible.kind === "bulletin") {
    const notice = club.bulletinPosts?.find(post => post.id === visible.postId)?.notice;
    if (!notice) return false;
    const readBy = notice.readBy ??= [];
    if (!readBy.includes(viewerId)) readBy.push(viewerId);
  } else {
    const notice = club.activityNotices?.find(item => item.id === id && item.memberId === viewerId);
    if (!notice) return false;
    notice.read = true;
  }
  return true;
}

const meetingAndManualActions = new Set(["saveManualActivity", "deductPoints", "entry", "meeting", "close", "reopen", "review"]);
const eventScoreActions = new Set(["saveEventRounds", "addEventParticipant", "editEvent", "cancelEvent", "restoreEvent"]);
const shiftStatusActions = new Set(["shift", "cancelShift", "restoreShift"]);

function dateWeek(value: unknown) {
  const date = typeof value === "string" ? value.trim().slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) ? weekId(date) : undefined;
}

function affectedScoreWeeks(club: Club, action: string, data: Record<string, unknown>) {
  if (meetingAndManualActions.has(action)) return [typeof data.week === "string" ? data.week.trim().slice(0, 10) : undefined];
  if (action === "cancelPointDeduction") return [club.pointDeductions?.find(row => row.id === data.id)?.week];
  if (action === "reviewActivity" || action === "saveEventContribution") return [club.activityRegistrations?.find(row => row.id === data.id)?.week];
  if (eventScoreActions.has(action)) {
    const event = club.events?.find(item => item.id === (data.eventId ?? data.id));
    if (!event) return [];
    return action === "editEvent" ? [dateWeek(event.endDate), dateWeek(data.endDate)] : [dateWeek(event.endDate)];
  }
  if (!shiftStatusActions.has(action) || (action === "shift" &&
    data.result === undefined && data.late === undefined && data.replacementId === undefined)) return [];
  const shift = club.schedules.find(item => item.month === data.month)?.shifts.find(item => item.id === data.shiftId);
  return [dateWeek(shift?.date)];
}

function assignedDuties(club: Club, eligible: ReadonlySet<string>, todayDate: string, matches: (schedule: Schedule, shift: Shift) => boolean) {
  return club.schedules.flatMap(schedule => schedule.shifts.flatMap(shift => {
    if (shift.date < todayDate || !matches(schedule, shift) || !dutyIsVisible(schedule, shift)) return [];
    return shift.assignments.flatMap(({ memberId, result }) => eligible.has(memberId) && result !== "cancelled"
      ? [{ kind: "duty" as const, month: schedule.month, shiftId: shift.id, memberId }] : []);
  }));
}

function dutyKey(item: DutyAssignment & { memberId: string }) {
  return JSON.stringify([item.memberId, item.month, item.shiftId]);
}

function storeActivityNotices(club: Club, notices: StoredActivityNotice[]) {
  if (!notices.length) return;
  const newDuties = new Set(notices.flatMap(item => item.kind === "duty" ? [dutyKey(item)] : []));
  const previous = (club.activityNotices ?? []).filter(item => item.kind !== "duty" || !newDuties.has(dutyKey(item)));
  const counts = new Map<string, number>();
  club.activityNotices = [...notices, ...previous].filter(item => {
    const count = counts.get(item.memberId) ?? 0;
    counts.set(item.memberId, count + 1);
    return count < 80;
  });
}

export function captureWorkspaceNotifications(
  club: Club, actor: Member | undefined, action: string, data: Record<string, unknown>, now = Date.now(),
) {
  if (!actor?.active || actor.role !== "admin") return;
  const knownWeeks = new Set(club.weeks.map(week => week.id));
  const weeks = [...new Set(affectedScoreWeeks(club, action, data))]
    .filter((week): week is string => week !== undefined && knownWeeks.has(week));
  const dutyChanged = action === "publish" || action === "addDutyMember" || action === "restoreShift" ||
    (action === "shift" && data.replacementId !== undefined);
  if (!weeks.length && !dutyChanged) return;

  const actorId = actor.id;
  const eligible = new Set(club.members.filter(member => member.active && isRosterMember(member)).map(member => member.id));
  const date = today(new Date(now));
  const matchesDuty = (schedule: Schedule, shift: Shift) => action === "publish"
    ? weekId(shift.date) === data.week : schedule.month === data.month && shift.id === data.shiftId;
  const previousDuties = dutyChanged ? new Set(assignedDuties(club, eligible, date, matchesDuty).map(dutyKey)) : undefined;
  const snapshots = weeks.length ? (() => {
    const { index } = sharingScoreBook(club, now);
    return weeks.flatMap(week => [...eligible].map(memberId => ({
      week, memberId, points: weeklyScoreFor(club, memberId, week, index).points,
    })));
  })() : [];

  return () => {
    const added: StoredActivityNotice[] = [];
    if (snapshots.length) {
      const { index } = sharingScoreBook(club, now);
      for (const { week, memberId, points } of snapshots) {
        const change = roundSharingScore(weeklyScoreFor(club, memberId, week, index).points - points);
        if (change) added.push({ id: crypto.randomUUID(), kind: "score", week, memberId, change, actorId, createdAt: now });
      }
    }
    if (previousDuties) {
      for (const assignment of assignedDuties(club, eligible, date, matchesDuty)) {
        if (!previousDuties.has(dutyKey(assignment))) added.push({ ...assignment, id: crypto.randomUUID(), actorId, createdAt: now });
      }
    }
    storeActivityNotices(club, added);
  };
}
