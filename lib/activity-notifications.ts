import { allowsMultipleEventRounds, recordedEventQuantity } from "./activity";
import {
  dateLabel, dutyNames, isRosterMember, isShiftPublished, rosterAssignments, adminMemberIds, statusNames, today,
  weekId, type Club, type Member, type Schedule, type Shift,
} from "./club";
import { eventNoticeScore } from "./event-notice-score";
import type { ActivityNoticeDraft, ActivityNoticeTarget, ActivityUpdate, DutyHours, EventNoticeScore } from "./notification-types";
import { captureScoreItems, scoreItemNotices } from "./score-notice-details";
import { roundSharingScore } from "./sharing-scores";
import { appendActivityNotices } from "./workspace-notifications";

const meetingActions = new Set(["entry", "review", "meeting", "close", "reopen"]);
const eventActions = new Set(["saveEventRounds", "addEventParticipant", "editEvent", "cancelEvent", "restoreEvent"]);
const individualEventActions = new Set(["reviewActivity", "saveEventContribution", "saveEventRounds", "addEventParticipant"]);
const dutyActions = new Set(["publish", "withdrawDutyWeek", "addDutyMember", "removeDutyMember", "cancelShift", "restoreShift", "shift"]);

function dutyHours(shift: Shift): DutyHours {
  return { date: shift.date, period: shift.period, startTime: shift.startTime, endTime: shift.endTime };
}

function eventContext(club: Club, action: string, data: Record<string, unknown>) {
  if (!eventActions.has(action) && !individualEventActions.has(action)) return;
  const row = action === "reviewActivity" || action === "saveEventContribution"
    ? club.activityRegistrations?.find(item => item.id === data.id) : undefined;
  const id = row?.eventId ?? data.eventId ?? data.id;
  const event = club.events?.find(item => item.id === id);
  if (!event) return;
  const memberId = individualEventActions.has(action) ? row?.memberId ?? data.memberId : undefined;
  return { event, memberId };
}

type ActivitySnapshot = {
  key: string;
  fingerprint: string;
  notice: ActivityUpdate & { memberId: string };
  eventDecision?: { approved: boolean; score: EventNoticeScore };
};

function changedActivityNotice(item: ActivitySnapshot, previous?: ActivitySnapshot) {
  const { notice, eventDecision } = item;
  if (!eventDecision) return notice;
  const prior = previous?.eventDecision;
  const { approved, score } = eventDecision;
  if (!prior?.approved) {
    if (!approved) return notice;
    const title = notice.title === "Kết quả sự kiện đã cập nhật" ? "Sự kiện đã duyệt" : notice.title;
    return { ...notice, title, eventScore: score };
  }
  const change = roundSharingScore(score.points - prior.score.points);
  if (!change && score.rounds === prior.score.rounds && approved === prior.approved) return notice;
  return { ...notice, eventScore: { ...score, change } };
}

function eventSnapshot(club: Club, eventId: string, onlyMember: unknown, eligible: ReadonlySet<string>, action: string): ActivitySnapshot[] {
  const event = club.events?.find(item => item.id === eventId);
  if (!event) return [];
  const people = new Map<string, NonNullable<Club["activityRegistrations"]>>();
  for (const row of club.activityRegistrations ?? []) {
    if (row.kind !== "event" || row.eventId !== eventId || !eligible.has(row.memberId) ||
      (onlyMember !== undefined && row.memberId !== onlyMember)) continue;
    const entries = people.get(row.memberId);
    if (entries) entries.push(row);
    else people.set(row.memberId, [row]);
  }
  return [...people].flatMap(([memberId, allRows]) => {
    const rows = allRows.filter(row => !row.supersededBy && row.status !== "withdrawn").sort((a, b) => a.id.localeCompare(b.id));
    if (!rows.length && !individualEventActions.has(action)) return [];
    const approved = recordedEventQuantity(rows);
    const hasDecision = rows.some(row => row.status === "confirmed");
    const declined = rows.filter(row => row.status === "declined").length;
    const waiting = rows.filter(row => row.status === "pending").length;
    const title = event.cancelledAt ? "Sự kiện đã hủy" : action === "restoreEvent" ? "Sự kiện đã khôi phục"
      : action === "editEvent" ? "Thông tin sự kiện đã cập nhật" : "Kết quả sự kiện đã cập nhật";
    const details = event.cancelledAt ? [] : action === "editEvent" ? ["Ngày kết thúc " + dateLabel(event.endDate, true)]
      : [hasDecision ? approved + " lượt được duyệt" : "", declined ? declined + " lượt không được duyệt" : "",
        waiting ? waiting + " lượt đang chờ" : ""];
    const body = [event.name, ...details].filter(Boolean).join(" · ");
    const eventDecision = event.scoringMode !== "perRound" && !allowsMultipleEventRounds(event) ? {
      approved: !event.cancelledAt && hasDecision,
      score: eventNoticeScore(club, event, event.cancelledAt ? [] : rows, event.cancelledAt ? 0 : approved),
    } : undefined;
    return [{
      key: memberId, fingerprint: JSON.stringify([
        event.cancelledAt != null, event.name, event.startDate, event.endDate, event.startTime, event.endTime,
        event.location, event.description, event.requiresEvidence, event.scoringMode,
        rows.map(row => [row.id, row.status, row.quantity, row.evidence?.review?.status]), eventDecision?.score.points,
      ]),
      notice: { kind: "activity", memberId, title, body, target: { area: "event", eventId } },
      eventDecision,
    }];
  });
}

function meetingSnapshot(club: Club, weekId: unknown, onlyMember: unknown, eligible: ReadonlySet<string>, action: string): ActivitySnapshot[] {
  const week = club.weeks.find(item => item.id === weekId);
  if (!week) return [];
  return week.entries.flatMap(entry => {
    if (!eligible.has(entry.memberId) || (onlyMember !== undefined && entry.memberId !== onlyMember)) return [];
    const status = week.cancelled ? "Tuần này không tổ chức họp" :
      entry.attendanceVerified || week.closed ? (entry.absent ? entry.excused ? "Vắng có phép" : "Vắng không phép" : "Có mặt")
      : statusNames[entry.status];
    const result = entry.passed ? status + " · Đạt phiếu điểm danh" : status;
    const summary = action === "meeting" && !week.cancelled
      ? [dateLabel(week.meetingDate, true), week.time, week.location].filter(Boolean).join(" · ")
      : "Tuần " + dateLabel(week.id, true) + " · " + result;
    return [{
      key: entry.memberId,
      fingerprint: JSON.stringify([week.closed, week.cancelled, week.meetingDate, week.time, week.location,
        entry.status, entry.absent, entry.excused, entry.passed, entry.attendanceVerified]),
      notice: { kind: "activity", memberId: entry.memberId, title: action === "meeting" ? "Lịch họp đã cập nhật" : "Kết quả họp đã cập nhật",
        body: summary, target: { area: "meeting", week: week.id } },
    }];
  });
}

function dutyScope(action: string, data: Record<string, unknown>, now: number) {
  if (action === "publish" || action === "withdrawDutyWeek") {
    const week = typeof data.week === "string" ? data.week.trim() : weekId(today(new Date(now)));
    return (_schedule: Schedule, shift: Shift) => weekId(shift.date) === week;
  }
  return (schedule: Schedule, shift: Shift) => schedule.month === data.month && shift.id === data.shiftId;
}

function dutySnapshot(club: Club, eligible: ReadonlySet<string>, matches: (schedule: Schedule, shift: Shift) => boolean) {
  const entries = club.schedules.flatMap(schedule => schedule.shifts.flatMap(shift => {
    if (!matches(schedule, shift) || !isShiftPublished(schedule, shift) || shift.cancelled) return [];
    return shift.assignments.flatMap(({ memberId, result, late }) => eligible.has(memberId) ? [{
      month: schedule.month, shiftId: shift.id, hours: dutyHours(shift), memberId, result, late: !!late,
    }] : []);
  }));
  return new Map(entries.map(entry => [JSON.stringify([entry.memberId, entry.month, entry.shiftId]), entry]));
}

export function captureWorkspaceNotifications(
  club: Club, actor: Member | undefined, action: string, data: Record<string, unknown>, now = Date.now(),
) {
  if (!actor?.active || actor.role !== "admin") return;
  const event = eventContext(club, action, data);
  const writesScore = action === "deductPoints" || (action === "saveManualActivity" && (data.kind === "committee" || data.kind === "special"));
  const scoreRecipient = writesScore &&
    typeof data.memberId === "string" ? data.memberId : undefined;
  const scoreMember = action === "cancelPointDeduction"
    ? club.pointDeductions?.find(row => row.id === data.id)?.memberId : scoreRecipient;
  const tracksDuty = dutyActions.has(action) && !(action === "shift" &&
    data.result === undefined && data.late === undefined && data.replacementId === undefined);
  const roundDecision = event && (event.event.scoringMode === "perRound" || allowsMultipleEventRounds(event.event)) &&
    individualEventActions.has(action);
  const tracksStatus = (event && !roundDecision) || meetingActions.has(action);
  if (!scoreMember && !tracksDuty && !tracksStatus) return;

  const eligible = new Set(club.members.filter(member => member.active && isRosterMember(member)).map(member => member.id));
  const before = scoreMember && eligible.has(scoreMember) ? captureScoreItems(club, scoreMember) : undefined;

  const matchesDuty = dutyScope(action, data, now);
  const oldDuty = tracksDuty ? dutySnapshot(club, eligible, matchesDuty) : undefined;
  const getActivity = () => event ? eventSnapshot(club, event.event.id, event.memberId, eligible, action)
    : meetingSnapshot(club, data.week, data.memberId, eligible, action);
  const oldActivity = new Map(tracksStatus ? getActivity().map(row => [row.key, row]) : []);

  return () => {
    const notices: ActivityNoticeDraft[] = [];
    if (before && scoreMember) notices.push(...scoreItemNotices(before, captureScoreItems(club, scoreMember)));
    if (tracksStatus) {
    for (const item of tracksStatus ? getActivity() : []) {
        const previous = oldActivity.get(item.key);
        if (previous?.fingerprint !== item.fingerprint) notices.push(changedActivityNotice(item, previous));
      }
    }
    if (oldDuty) {
      const changed = dutySnapshot(club, eligible, matchesDuty);
      const keys = new Set([...oldDuty.keys(), ...changed.keys()]);
      for (const key of keys) {
        const before = oldDuty.get(key);
        const after = changed.get(key);
        const entry = after ?? before!;
        const { month, shiftId, memberId, hours } = entry;
        const wasAssigned = !!before && before.result !== "cancelled";
        const isAssigned = !!after && after.result !== "cancelled";
        if (wasAssigned && !isAssigned) {
          // Keep a receipt for a previous assignment even if its schedule is withdrawn.
          for (const notice of club.activityNotices ?? []) {
            if (notice.kind === "duty" && !notice.hours && notice.memberId === memberId && notice.month === month && notice.shiftId === shiftId)
              notice.hours = before.hours;
          }
          notices.push({ kind: "duty", memberId, month, shiftId, hours,
            dutyChange: action === "cancelShift" ? "cancelled" : action === "withdrawDutyWeek" ? "withdrawn" : "removed" });
        } else if (isAssigned && (!wasAssigned || JSON.stringify(before.hours) !== JSON.stringify(hours))) {
          notices.push({ kind: "duty", memberId, month, shiftId, hours, dutyChange: wasAssigned ? "updated" : "assigned" });
        } else if (before && after && (before.result !== after.result || before.late !== after.late)) {
          notices.push({
            kind: "activity", memberId, title: "Kết quả ca trực đã cập nhật",
            body: dateLabel(hours.date, true) + " · " + dutyNames[after.result] + (after.late ? " · Đến muộn" : ""),
            target: { area: "duty", week: weekId(hours.date), shiftId },
          });
        }
      }
    }
    appendActivityNotices(club, actor.id, notices, now);
  };
}

export function addDutyEvidenceNotice(club: Club, actor: Member, memberId: string, shift: Shift, approved: boolean, at: number) {
  const target: ActivityNoticeTarget = { area: "duty", week: weekId(shift.date), shiftId: shift.id };
  appendActivityNotices(club, actor.id, [{
    kind: "activity", memberId, title: approved ? "Minh chứng ca trực đã duyệt" : "Minh chứng ca trực cần gửi lại",
    body: (shift.period === "am" ? "Ca sáng" : "Ca chiều") + " · " + dateLabel(shift.date, true), target,
  }], at);
}
