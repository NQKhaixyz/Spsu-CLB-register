import { activityPointsFor, creditedActivities, eventForActivity } from "./activity";
import { dutyPointsFor, isChargeableLate, isDutyReportShift, isMemberOnDate, meetingAbsence, meetingPass, rulesFor, weekId, type Club } from "./club";
import { activeSharingPeriod, sharingSourceKey, type LockedShare, type SharingAdjustment, type SharingAmounts, type SharingGroup, type SharingKind, type SharingPeriod } from "./sharing-types";

type PointSource = {
  key: string;
  type: LockedShare["sourceType"];
  memberId: string;
  date: string;
  time?: string;
  month: string;
  week: string;
  points: number;
  eventId?: string;
  individual?: boolean;
};

export type SharingScoreIndex = Map<string, SharingAmounts>;
const indexKey = (memberId: string, month: string, week?: string) => JSON.stringify([memberId, month, week]);
export const roundSharingScore = (value: number) => Number(value.toFixed(10));

export function indexSharingAdjustments(rows: readonly SharingAdjustment[] = []): SharingScoreIndex {
  const index: SharingScoreIndex = new Map();
  for (const row of rows) {
    index.set(indexKey(row.memberId, row.month, row.week), row.amounts);
    const monthly = indexKey(row.memberId, row.month);
    const total = index.get(monthly) ?? { cupid: 0, guild: 0 };
    total.cupid += row.amounts.cupid;
    total.guild += row.amounts.guild;
    index.set(monthly, total);
  }
  return index;
}

export function sharingAdjustmentFor(index: SharingScoreIndex, memberId: string, month: string, week?: string): SharingAmounts {
  return index.get(indexKey(memberId, month, week)) ?? { cupid: 0, guild: 0 };
}

function pointSources(club: Club, relevant: ReadonlySet<string>): PointSource[] {
  const members = new Map(club.members.filter(member => relevant.has(member.id) && member.role === "member")
    .map(member => [member.id, member]));
  const sources: PointSource[] = [];
  const rates = new Map<string, ReturnType<typeof rulesFor>>();
  const rate = (month: string) => {
    let rule = rates.get(month);
    if (!rule) {
      rule = rulesFor(club, month);
      rates.set(month, rule);
    }
    return rule;
  };
  for (const schedule of club.schedules) {
    const rule = rate(schedule.month);
    for (const shift of schedule.shifts) {
      if (shift.cancelled || !isDutyReportShift(schedule, shift)) continue;
      for (const assignment of shift.assignments) {
        if (!members.has(assignment.memberId) ||
            (assignment.result !== "completed" && assignment.result !== "unexcused" && !isChargeableLate(assignment))) continue;
        sources.push({ key: sharingSourceKey("duty", shift.id, assignment.memberId), type: "duty",
          memberId: assignment.memberId, date: shift.date, time: shift.startTime, month: schedule.month,
          week: weekId(shift.date), points: dutyPointsFor(assignment, rule) });
      }
    }
  }
  for (const meeting of club.weeks) {
    if (meeting.cancelled) continue;
    const month = meeting.meetingDate.slice(0, 7);
    const rule = rate(month);
    const seen = new Set<string>();
    for (const entry of meeting.entries) {
      if (seen.has(entry.memberId)) continue;
      seen.add(entry.memberId);
      const member = members.get(entry.memberId);
      if (!member || !isMemberOnDate(member, meeting.meetingDate)) continue;
      const absent = meetingAbsence(meeting.closed, entry);
      const passed = meetingPass(entry);
      if (!absent && !passed) continue;
      sources.push({ key: sharingSourceKey("meeting", meeting.id, entry.memberId), type: "meeting",
        memberId: entry.memberId, date: meeting.meetingDate, time: meeting.time, month,
        week: weekId(meeting.meetingDate), points: (passed ? rule.E : 0) - (absent ? rule.C : 0) });
    }
  }
  for (const row of creditedActivities(club)) {
    if (!members.has(row.memberId)) continue;
    const event = row.kind === "event" ? eventForActivity(club, row) : undefined;
    const type = row.kind === "event" ? "event" : row.kind === "deduction" ? "deduction" : "manual";
    sources.push({ key: sharingSourceKey(type, row.id), type, memberId: row.memberId,
      week: row.week, date: row.date, month: row.date.slice(0, 7),
      time: event?.endTime ?? ("time" in row ? row.time : undefined),
      points: activityPointsFor(club, row), eventId: row.quantity > 0 ? event?.id : undefined,
      individual: "individual" in row ? row.individual : undefined });
  }
  return sources;
}

// With only a date, every instant on that day must fall within the same roster.
function belongsToPeriod(period: SharingPeriod, source: PointSource, cutoff: number) {
  if (source.individual) return false;
  if (source.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(source.time)) {
    const at = Date.parse(`${source.date}T${source.time}:00+07:00`);
    return at >= period.startedAt && at < cutoff;
  }
  const start = Date.parse(`${source.date}T00:00:00+07:00`);
  return start >= period.startedAt && start + 86_400_000 <= cutoff;
}

function makeShares(group: SharingGroup, period: SharingPeriod, sources: PointSource[]) {
  return sources.map((source): LockedShare => ({
    periodId: period.id, kind: group.kind, sourceKey: source.key, sourceType: source.type,
    sourceMemberId: source.memberId, originalPoints: source.points, share: source.points / period.memberIds.length,
    memberIds: [...period.memberIds], week: source.week, month: source.month,
  }));
}

function hasJointEvent(sources: PointSource[]) {
  const participants = new Map<string, string>();
  return sources.some(source => {
    if (!source.eventId) return false;
    const previous = participants.get(source.eventId);
    participants.set(source.eventId, source.memberId);
    return !!previous && previous !== source.memberId;
  });
}

export function settleSharingPeriod(club: Club, group: SharingGroup, period: SharingPeriod, cutoff: number) {
  if (period.asset === "credits") {
    period.endedAt = cutoff;
    return;
  }
  const locked = new Set(club.sharing?.locked.map(row => row.sourceKey));
  const sources = period.memberIds.length < 2 ? [] : pointSources(club, new Set(period.memberIds))
    .filter(source => !locked.has(source.key) && belongsToPeriod(period, source, cutoff));
  const rows = makeShares(group, period, sources);
  if (club.sharing) club.sharing.locked.push(...rows);
  if (group.kind === "cupid" && hasJointEvent(sources)) group.jointEvent = true;
  period.endedAt = cutoff;
}

export function sharingScoreBook(club: Club, now = Date.now()) {
  const state = club.sharing;
  const rows = new Map<string, SharingAdjustment>();
  const contributions = new Map<string, LockedShare[]>();
  const jointEvents = new Set<string>();
  const lockedBySource = new Map<string, LockedShare>();
  const relevant = new Set<string>();
  const activeByMember = new Map<string, { group: SharingGroup; period: SharingPeriod }>();
  const contributors = new Map<string, PointSource[]>();

  function adjust(memberId: string, month: string, week: string, kind: SharingKind, points: number) {
    const key = indexKey(memberId, month, week);
    const row = rows.get(key) ?? { memberId, month, week, amounts: { cupid: 0, guild: 0 } };
    row.amounts[kind] += points;
    rows.set(key, row);
  }
  function remember(row: LockedShare) {
    const history = contributions.get(row.periodId) ?? [];
    history.push(row);
    contributions.set(row.periodId, history);
    for (const memberId of row.memberIds) adjust(memberId, row.month, row.week, row.kind, row.share);
  }

  for (const row of state?.locked ?? []) {
    remember(row);
    if (row.sourceKey) lockedBySource.set(row.sourceKey, row);
    if (row.sourceMemberId) relevant.add(row.sourceMemberId);
  }
  for (const group of state?.groups ?? []) {
    const period = activeSharingPeriod(group);
    if (!period || period.memberIds.length < 2) continue;
    for (const id of period.memberIds) {
      activeByMember.set(id, { group, period });
      relevant.add(id);
    }
  }
  for (const source of relevant.size ? pointSources(club, relevant) : []) {
    const locked = lockedBySource.get(source.key);
    if (locked) {
      // Replace the current value of an already settled source with its original allocation.
      adjust(source.memberId, source.month, source.week, locked.kind, -source.points);
      continue;
    }
    const active = activeByMember.get(source.memberId);
    if (!active || !belongsToPeriod(active.period, source, now)) continue;
    if (active.group.kind === "cupid" && source.eventId) {
      const groupEvents = contributors.get(active.group.id) ?? [];
      groupEvents.push(source);
      contributors.set(active.group.id, groupEvents);
    }
    if (active.period.asset === "credits") continue;
    const [row] = makeShares(active.group, active.period, [source]);
    remember(row);
    adjust(source.memberId, source.month, source.week, row.kind, -source.points);
  }
  for (const [id, sources] of contributors) if (hasJointEvent(sources)) jointEvents.add(id);
  const adjustments = [...rows.values()].filter(row => row.amounts.cupid !== 0 || row.amounts.guild !== 0);
  return { adjustments, index: indexSharingAdjustments(adjustments), contributions, jointEvents };
}
