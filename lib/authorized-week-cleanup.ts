import type { Club, Schedule, Week } from "./club";

// Fixed, owner-requested deletion on 10 November 2026. Never a moving date range.
export const CLEANUP_ID = "owner-delete-dates-2026-11-01-08";
export const CLEANUP_START = "2026-11-01";
export const CLEANUP_WEEK = "2026-11-02";
export const CLEANUP_END = "2026-11-08";

const octoberWeek = {
  start: "2026-10-26",
  end: "2026-11-01",
  week: "2026-10-26",
};
export const OCTOBER_WEEK_CLEANUP = {
  ...octoberWeek,
  id: "owner-delete-week-2026-10-26",
  label: "dữ liệu",
  plan: planOctoberWeekCleanup,
};

type WeekScope = { start: string; end: string; week: string };
const inScope = (date: string, scope: WeekScope) => date >= scope.start && date <= scope.end;

function planMeetingAndDutyCleanup(club: Club, scope: WeekScope) {
  const inRange = (date: string) => inScope(date, scope);
  const extract = (source: { weeks: Week[]; schedules: Schedule[] }) => {
    const weeks = source.weeks.filter(w => w.id === scope.week || inRange(w.meetingDate));
    const schedules = source.schedules
      .map(s => ({ ...s, shifts: s.shifts.filter(t => inRange(t.date)) }))
      .filter(s => s.shifts.length > 0 || s.pendingDutyWeek === scope.week);
    source.weeks = source.weeks.filter(w => !weeks.includes(w));
    // Keep month-level settings and publication status, even if now empty.
    source.schedules = source.schedules.map(s => {
      const remaining = { ...s, shifts: s.shifts.filter(t => !inRange(t.date)) };
      if (remaining.pendingDutyWeek === scope.week) delete remaining.pendingDutyWeek;
      return remaining;
    });
    return { weeks, schedules };
  };
  const backup = { active: extract(club), demoArchive: club.demoArchive ? extract(club.demoArchive) : null };
  club.deletedWeeks = [...new Set([...(club.deletedWeeks ?? []), scope.week])];
  club.deletedDutyDates = [...new Set([...(club.deletedDutyDates ?? []), scope.start])];
  club.deletedMeetingWeeks = [...new Set([...(club.deletedMeetingWeeks ?? []), ...backup.active.weeks.map(w => w.id)])];
  const counts = {
    removedWeeks: backup.active.weeks.length,
    removedEntries: backup.active.weeks.reduce((n, w) => n + w.entries.length, 0),
    removedShifts: backup.active.schedules.reduce((n, s) => n + s.shifts.length, 0),
    removedAssignments: backup.active.schedules.flatMap(s => s.shifts).reduce((n, t) => n + t.assignments.length, 0),
  };
  return { backup, counts };
}

export function planAuthorizedWeekCleanup(club: Club) {
  return planMeetingAndDutyCleanup(club, { start: CLEANUP_START, end: CLEANUP_END, week: CLEANUP_WEEK });
}

function partition<T>(rows: T[] | undefined, inWeek: (row: T) => boolean) {
  const removed: T[] = [];
  const retained: T[] = [];
  for (const row of rows ?? []) (inWeek(row) ? removed : retained).push(row);
  return { removed, retained };
}

function planOctoberWeekCleanup(club: Club) {
  const scope = octoberWeek;
  const base = planMeetingAndDutyCleanup(club, scope);
  const belongsToWeek = (row: { week: string; date: string }) => row.week === scope.week || inScope(row.date, scope);
  // Event points and registrations belong to the week of the event's end date.
  const events = partition(club.events, event => inScope(event.endDate, scope));
  const eventIds = new Set(events.removed.map(event => event.id));
  const registrations = partition(club.activityRegistrations, row =>
    belongsToWeek(row) || (row.kind === "event" && row.eventId !== undefined && eventIds.has(row.eventId)),
  );
  const manualActivities = partition(club.manualActivities, belongsToWeek);
  const deductions = partition(club.pointDeductions, belongsToWeek);
  const dutyWithdrawal = club.dutyWithdrawal?.week === scope.week ? club.dutyWithdrawal : undefined;
  if (club.events) club.events = events.retained;
  if (club.activityRegistrations) club.activityRegistrations = registrations.retained;
  if (club.manualActivities) club.manualActivities = manualActivities.retained;
  if (club.pointDeductions) club.pointDeductions = deductions.retained;
  if (dutyWithdrawal) delete club.dutyWithdrawal;
  return {
    backup: {
      ...base.backup,
      events: events.removed,
      registrations: registrations.removed,
      manualActivities: manualActivities.removed,
      deductions: deductions.removed,
      dutyWithdrawal,
    },
    counts: {
      ...base.counts,
      removedEvents: events.removed.length,
      removedRegistrations: registrations.removed.length,
      removedManualActivities: manualActivities.removed.length,
      removedDeductions: deductions.removed.length,
      removedDemoWeeks: base.backup.demoArchive?.weeks.length ?? 0,
      removedDemoShifts: base.backup.demoArchive?.schedules.reduce((n, s) => n + s.shifts.length, 0) ?? 0,
      removedPendingDutyPlans: [base.backup.active, base.backup.demoArchive]
        .flatMap(source => source?.schedules ?? []).filter(schedule => schedule.pendingDutyWeek === scope.week).length,
      removedDutyWithdrawal: Number(!!dutyWithdrawal),
    },
  };
}
