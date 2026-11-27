import { activityScoreFor, type ActivityRates, type ActivityRegistration, type ManualActivity, type ClubEvent, type PointDeduction, type CommitteeRates } from "./activity";
import type { SharedLink } from "./shared-links";
import type { BulletinPost, BulletinPostView } from "./bulletin";
import type { BulletinUpload } from "./bulletin-media";
import type { CommitteeMembership } from "./committees";
import type { FontId } from "./interface-fonts";
import type { SidebarTab } from "./workspace-navigation";
import type { MemberPosition } from "./member-positions";
import {
  academicWeekFor,
  activeAvailabilityDatasetFor,
  createDutyAvailability,
} from "./availability";
export type Registration = "unregistered" | "attending" | "absent" | "pending";
export type DutyResult =
  | "unverified"
  | "completed"
  | "unexcused"
  | "excused"
  | "cancelled";
export type Member = CommitteeMembership & {
  id: string;
  name: string;
  studentId: string;
  userId?: string;
  email?: string;
  role: "admin" | "member";
  position?: MemberPosition;
  avatarId?: string;
  fontPreference?: FontId;
  sidebarOrder?: (SidebarTab | "overview")[];
  active: boolean;
  joined: string;
  left?: string;
  pastPauses?: { pausedOn: string; resumedOn: string }[];
  availability: string[];
  availabilityOverrides?: Record<string, boolean>;
  extraDuties: boolean;
  needsStudentId?: boolean;
  loginName?: string;
};
export type Entry = {
  memberId: string;
  status: Registration;
  reason: string;
  request?: string;
  decision?: string;
  absent?: boolean;
  excused: boolean;
  passed: boolean;
  attendanceVerified?: boolean;
};
export type Week = {
  id: string;
  meetingDate: string;
  time: string;
  location: string;
  cancelled: boolean;
  closed: boolean;
  entries: Entry[];
  closingSnapshot?: { before: Entry[]; after: Entry[] };
  reopenedForCorrection?: boolean;
};
export type Assignment = {
  memberId: string;
  manual?: boolean;
  originalId?: string;
  result: DutyResult;
  late?: boolean;
  availabilityNote?: string;
  note?: string;
};
export type Shift = {
  id: string;
  date: string;
  period: "am" | "pm";
  assignments: Assignment[];
  capacity?: number;
  draft?: boolean;
  withdrawnOn?: string;
  wasPublished?: true;
  startTime?: string;
  endTime?: string;
  academicWeek?: number;
  cancelled?: boolean;
  cancelReason?: string;
  cancelledAt?: string;
  cancellationSnapshot?: Assignment[];
};
export type Schedule = {
  month: string;
  peoplePerShift?: number;
  published: boolean;
  shifts: Shift[];
  pendingDutyWeek?: string;
  availabilityVersion?: string;
  sourceFilename?: string;
};
export type Rule = {
  activities?: ActivityRates;
  committees?: CommitteeRates;
  month: string;
  A: number;
  B: number;
  C: number;
  D: number;
  E?: number;
};
export type AvailabilityDetail = {
  sourceRow: number;
  name: string;
  day: string;
  period: string;
  weeks: string;
  note: string;
};
export type AvailabilityDataset = {
  filename: string;
  importedAt: string;
  importedBy: string;
  rows: AvailabilityDetail[];
  settings?: AvailabilitySettings;
  memberLinks?: Record<string, string>;
};
export type AvailabilitySettings = {
  anchorDate: string;
  anchorWeek: number;
  startDate: string;
  amStart: string;
  amEnd: string;
  pmStart: string;
  pmEnd: string;
  allowedLateMinutes: number;
  ignoreSourceNotes: boolean;
};
export type Club = {
  ownerId: string;
  name: string;
  demo: boolean;
  members: Member[];
  weeks: Week[];
  schedules: Schedule[];
  links?: SharedLink[];
  bulletinPosts?: BulletinPost[];
  bulletinUploads?: BulletinUpload[];
  rules: Rule[];
  activityRegistrations?: ActivityRegistration[];
  events?: ClubEvent[];
  pointDeductions?: PointDeduction[];
  manualActivities?: ManualActivity[];
  days: number[];
  peoplePerShift?: number;
  availabilityVersion: string;
  deletedWeeks?: string[];
  deletedDutyDates?: string[];
  deletedMeetingWeeks?: string[];
  dutyWithdrawal?: { week: string; count: number };
  availabilityDataset?: AvailabilityDataset;
  activeAvailabilityDataset?: AvailabilityDataset;
  testAccountsDisabled?: boolean;
  testDataCleanedAt?: string;
  officialSince?: string;
  demoArchive?: {
    archivedAt: string;
    members: Member[];
    weeks: Week[];
    schedules: Schedule[];
  };
  logs: { at: string; actor: string; actorId?: string; text: string }[];
};
export type View = {
  club: Club;
  me: Member | null;
  isAdmin: boolean;
  identity: { name: string; email: string };
  setup: boolean;
  revision: number;
  weeklyScores?: WeeklyScore[];
  personalMonthlyScores?: Record<string, ReturnType<typeof scoreFor>>;
  directoryAvailability?: Record<string, Pick<AvailabilityDetail, "day" | "period" | "weeks" | "note">[]>;
  currentAcademicWeek?: number;
  bulletin?: { posts: BulletinPostView[]; nextChangeAt?: number };
};
export const statusNames: Record<Registration, string> = {
  unregistered: "Chưa đăng ký",
  attending: "Tham gia",
  absent: "Xin vắng",
  pending: "Chưa xử lý",
};
export const dutyNames: Record<DutyResult, string> = {
  unverified: "Chưa xác minh",
  completed: "Đã trực",
  unexcused: "Vắng không phép",
  excused: "Vắng có phép",
  cancelled: "Ca hủy",
};
export const uid = () => crypto.randomUUID();
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(date: string, amount: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
export function weekday(date: string) {
  return new Date(date + "T12:00:00Z").getUTCDay();
}
export function weekId(date = today()) {
  return addDays(date, -((weekday(date) + 6) % 7));
}
export function monthDays(month: string) {
  const result: string[] = [];
  for (let d = month + "-01"; d.slice(0, 7) === month; d = addDays(d, 1))
    result.push(d);
  return result;
}
export function dateLabel(date: string, year = false) {
  if (!date) return "Chưa đặt ngày";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
export function monthLabel(month: string) {
  return `Tháng ${Number(month.slice(5))}, ${month.slice(0, 4)}`;
}
export function rulesFor(club: Club, month: string) {
  const applicable = club.rules
    .filter((r) => r.month <= month)
    .sort((a, b) => b.month.localeCompare(a.month));
  const rule: Rule = applicable[0] ?? { month, A: 0, B: 0, C: 0, D: 0 };
  // Rule snapshots created before the attendance bonus may omit it.
  const E = rule.E ?? applicable.find(r => typeof r.E === "number")?.E ?? 0;
  return { ...rule, E };
}
export function createClub(ownerId: string): Club {
  return {
    ownerId,
    name: "Nhịp Đội",
    demo: false,
    members: [],
    weeks: [],
    schedules: [],
    rules: [{ month: "2000-01", A: 0, B: 0, C: 0, D: 0 }],
    days: [1, 2, 3, 4, 5],
    availabilityVersion: "",
    logs: [],
  };
}
export const isRosterMember = (member: Member) => member.role === "member";
export const adminMemberIds = (club: Pick<Club, "members">) =>
  new Set(club.members.filter(member => !isRosterMember(member)).map(member => member.id));
export const rosterAssignments = (rows: Assignment[], adminIds: ReadonlySet<string>) =>
  rows.filter(row => !adminIds.has(row.memberId));

export function syncWeeks(club: Club, date = today()) {
  const current = weekId(date);
  const members = club.members.filter(isRosterMember);
  const adminIds = adminMemberIds(club);
  let changed = false;
  const latest = [...club.weeks].sort((a, b) => b.id.localeCompare(a.id))[0]
    ?.id;
  // Catch up after downtime without losing unregistered members in skipped weeks.
  if (latest)
    for (let id = addDays(latest, 7); id <= current; id = addDays(id, 7)) {
      if (club.deletedWeeks?.includes(id) || club.deletedMeetingWeeks?.includes(id)) continue;
      club.weeks.push({
        id,
        meetingDate: "",
        time: "18:30",
        location: "Phòng sinh hoạt Đội",
        closed: false,
        cancelled: false,
        entries: members
          .filter(
            (m) => m.joined <= addDays(id, 6) && !pausedForScoreWeek(m, id),
          )
          .map((m) => newEntry(m.id)),
      });
      changed = true;
    }
  for (const w of club.weeks)
    if (!w.closed && !w.reopenedForCorrection && addDays(w.id, 7) <= date) {
      closeWeek(w, adminIds);
      club.logs.unshift({
        at: new Date().toISOString(),
        actor: "Hệ thống",
        text: `Tự chốt tuần ${w.id}`,
      });
      changed = true;
    }
  if (!club.weeks.some((w) => w.id === current)) {
    club.weeks.push({
      id: current,
      meetingDate: "",
      time: "18:30",
      location: "Phòng sinh hoạt Đội",
      closed: false,
      cancelled: false,
      entries: members
        .filter((m) => m.active && m.joined <= date)
        .map((m) => newEntry(m.id)),
    });
    changed = true;
  }
  const w = club.weeks.find((w) => w.id === current)!;
  if (!w.closed) {
    if (w.meetingDate) {
      const entries = w.entries.filter((e) => {
        const member = club.members.find((m) => m.id === e.memberId);
        return (
          e.status !== "unregistered" ||
          e.attendanceVerified ||
          !member ||
          isMemberOnDate(member, w.meetingDate)
        );
      });
      if (entries.length !== w.entries.length) {
        w.entries = entries;
        changed = true;
      }
    }
    for (const m of members.filter(
      (m) =>
        m.active &&
        m.joined <= date &&
        (!w.meetingDate || isMemberOnDate(m, w.meetingDate)),
    ))
      if (!w.entries.some((e) => e.memberId === m.id)) {
        w.entries.push(newEntry(m.id));
        changed = true;
      }
  }
  return changed;
}
export function isMemberOnDate(member: Member, date: string) {
  return member.joined <= date && (!member.left || member.left >= date) &&
    !member.pastPauses?.some(pause => pause.pausedOn < date && date < pause.resumedOn);
}
export function setMemberActive(member: Member, active: boolean, date = today()) {
  if (member.active === active) return;
  if (active && member.left && member.left < date)
    (member.pastPauses ??= []).push({ pausedOn: member.left, resumedOn: date });
  member.left = active ? undefined : date;
  member.active = active;
}
// Weeks are identified by their Monday. Include both the week of the pause and the week of return.
export function pausedForScoreWeek(member: Member, monday: string, through?: string) {
  return (!!member.left && member.left < monday) ||
    !!member.pastPauses?.some(pause => pause.pausedOn < monday && (through ?? addDays(monday, 6)) < pause.resumedOn);
}
export function monthlyReportRoster(club: Club, month: string, asOf = today()) {
  const end = monthDays(month).at(-1)!;
  const through = asOf.slice(0, 7) === month ? asOf : end;
  const monday = weekId(through);
  const hidden = new Set(club.members.filter(m => m.role === "admin" || pausedForScoreWeek(m, monday, through)).map(m => m.id));
  const assigned = new Set(club.schedules.filter(s => s.month === month).flatMap(s =>
    s.shifts.filter(shift => isDutyReportShift(s, shift) && !shift.cancelled)
      .flatMap(shift => shift.assignments.map(a => a.memberId)),
  ));
  return { hidden, members: club.members.filter(m => !hidden.has(m.id) && (assigned.has(m.id) || m.joined <= end)) };
}
export function reportMembers(club: Club, month: string, asOf = today()) {
  return monthlyReportRoster(club, month, asOf).members;
}
export function newEntry(memberId: string): Entry {
  return {
    memberId,
    status: "unregistered",
    reason: "",
    excused: false,
    passed: false,
  };
}
export function closeWeek(week: Week, adminIds?: ReadonlySet<string>) {
  if (week.closed) return;
  const before = structuredClone(week.entries);
  for (const e of week.entries) {
    if (adminIds?.has(e.memberId)) continue;
    if (e.status === "pending") {
      e.decision = "Chưa được duyệt khi chốt";
      e.status = "absent";
      e.absent = true;
    }
    if (e.status === "unregistered") {
      e.status = "absent";
      e.absent = true;
      e.excused = false;
    }
    if (e.status === "absent") e.absent = true;
    if (e.absent) e.passed = false;
  }
  week.closed = true;
  week.closingSnapshot = { before, after: structuredClone(week.entries) };
  delete week.reopenedForCorrection;
}
export function reopenWeek(week: Week) {
  // Undo only the automatic close changes; preserve any subsequent BĐH edits.
  const snapshot = week.closingSnapshot;
  if (snapshot) {
    week.entries = week.entries.map((entry) => {
      const before = snapshot.before.find((e) => e.memberId === entry.memberId);
      const after = snapshot.after.find((e) => e.memberId === entry.memberId);
      return before && after && !entry.attendanceVerified &&
        JSON.stringify(entry) === JSON.stringify(after)
        ? structuredClone(before) : entry;
    });
  }
  week.closed = false;
  // Past weeks need to stay open for admin correction until explicitly closed.
  if (week.id < weekId()) week.reopenedForCorrection = true;
  delete week.closingSnapshot;
}
export const shiftCapacity = (shift: Shift) => shift.capacity ?? 2;
export const isShiftPublished = (schedule: Schedule, shift: Shift) =>
  schedule.published && !shift.draft;
export const isDutyReportShift = (schedule: Schedule, shift: Shift) =>
  isShiftPublished(schedule, shift) || shift.wasPublished === true;
export function isUpcomingShift(shift: Shift, now = new Date()) {
  const date = today(now);
  return shift.date > date || (
    shift.date === date && !!shift.startTime &&
    Date.parse(shift.date + "T" + shift.startTime + ":00+07:00") > now.getTime()
  );
}
const isUnverifiedDutyShift = (shift: Shift, adminIds?: ReadonlySet<string>) =>
  !shift.cancelled && shift.assignments.every(assignment =>
    adminIds?.has(assignment.memberId) || (assignment.result === "unverified" && !assignment.late),
  );
export const canReplanDutyShift = (schedule: Schedule, shift: Shift, adminIds?: ReadonlySet<string>) =>
  !isShiftPublished(schedule, shift) && isUnverifiedDutyShift(shift, adminIds);

export function canWithdrawDutyShift(schedule: Schedule, shift: Shift, from: string, adminIds?: ReadonlySet<string>) {
  return isShiftPublished(schedule, shift) && isUnverifiedDutyShift(shift, adminIds) &&
    shift.date >= from && shift.date <= addDays(weekId(from), 6);
}

export function canEditDutyDraft(shift: Shift, now = new Date(), adminIds?: ReadonlySet<string>) {
  if (!shift.draft || !isUnverifiedDutyShift(shift, adminIds)) return false;
  if (!shift.withdrawnOn) return isUpcomingShift(shift, now);
  const end = addDays(weekId(shift.withdrawnOn), 6);
  return today(now) <= end && shift.date >= shift.withdrawnOn && shift.date <= end;
}
export const isChargeableLate = (a: Assignment) =>
  !!a.late && !["unexcused", "excused", "cancelled"].includes(a.result);
export const latePenaltyFor = (a: Assignment, rule: Rule) =>
  isChargeableLate(a) ? (rule.D ?? 0) : 0;
export const dutyPointsFor = (a: Assignment, rule: Rule) =>
  (a.result === "completed" ? rule.A : a.result === "unexcused" ? -rule.B : 0) -
  latePenaltyFor(a, rule);
export function scoreFor(club: Club, memberId: string, month: string, onlyWeek?: string) {
  const rule = rulesFor(club, month);
  const member = club.members.find((m) => m.id === memberId);
  const duties = member?.role === "admin" ? [] : club.schedules
    .filter((s) => s.month === month)
    .flatMap((s) =>
      s.shifts
        .filter((t) => isDutyReportShift(s, t) && !t.cancelled && (!onlyWeek || weekId(t.date) === onlyWeek))
        .flatMap((t) => t.assignments.filter((a) => a.memberId === memberId)),
    );
  const weeks = club.weeks.filter(
    (w) =>
      !w.cancelled &&
      w.meetingDate.slice(0, 7) === month &&
      (!onlyWeek || weekId(w.meetingDate) === onlyWeek) &&
      !!member &&
      member.role !== "admin" &&
      isMemberOnDate(member, w.meetingDate),
  );
  const entries = weeks
    .map((w) => ({
      closed: w.closed,
      e: w.entries.find((e) => e.memberId === memberId),
    }))
    .filter((x) => x.e);
  const completed = duties.filter((a) => a.result === "completed").length;
  const dutyMissed = duties.filter((a) => a.result === "unexcused").length;
  const lateCount = duties.filter(isChargeableLate).length;
  const lateDeduction = duties.reduce((n, a) => n + latePenaltyFor(a, rule), 0);
  const meetingMissed = entries.filter(
    ({ closed, e }) => closed && e?.absent && !e.excused,
  ).length;
  const attended = entries.filter(
    ({ closed, e }) => closed && e?.status === "attending" && !e.absent,
  ).length;
  const passed = entries.filter(({ e }) => e?.passed && !e.absent).length;
  const activities = activityScoreFor(club, memberId, month, false, onlyWeek);
  const points = completed * rule.A - dutyMissed * rule.B - meetingMissed * rule.C -
    lateDeduction + passed * rule.E + activities.activityTotal;
  return {
    ...activities,
    completed,
    dutyMissed,
    meetingMissed,
    attended,
    passed,
    lateCount,
    lateDeduction,
    points: Number(points.toFixed(10)),
  };
}
export function createDutyShiftSlots(club: Club, month: string, peoplePerShift: number): Shift[] {
  const detailSettings = activeAvailabilityDatasetFor(club)?.settings;
  return monthDays(month)
    .filter(
      (d) =>
        club.days.includes(weekday(d)) &&
        !club.deletedWeeks?.includes(weekId(d)) &&
        !club.deletedDutyDates?.includes(d) &&
        (!detailSettings || d >= detailSettings.startDate),
    )
    .flatMap((date) =>
      (["am", "pm"] as const).map((period) => ({
        id: `${date}-${period}`,
        date,
        period,
        assignments: [] as Assignment[],
        capacity: peoplePerShift,
        ...(detailSettings
          ? {
              startTime:
                period === "am"
                  ? detailSettings.amStart
                  : detailSettings.pmStart,
              endTime:
                period === "am" ? detailSettings.amEnd : detailSettings.pmEnd,
              academicWeek: academicWeekFor(date, detailSettings),
            }
          : {}),
      })),
    );
}

export function makeSchedule(club: Club, month: string, peoplePerShift = club.peoplePerShift ?? 2): Schedule {
  if (!Number.isInteger(peoplePerShift) || peoplePerShift < 1 || peoplePerShift > 50)
    throw new Error("Số người mỗi buổi trực phải là số nguyên từ 1–50.");
  const dataset = activeAvailabilityDatasetFor(club);
  const cancelled = new Map(
    (club.schedules.find((s) => s.month === month)?.shifts ?? [])
      .filter((t) => t.cancelled)
      .map((t) => [t.id, t]),
  );
  const previous = new Map(club.schedules.find(s => s.month === month)?.shifts.map(shift => [shift.id, shift]));
  const shifts = createDutyShiftSlots(club, month, peoplePerShift).map((shift) => {
    const cancelledShift = cancelled.get(shift.id);
    if (cancelledShift) return structuredClone(cancelledShift);
    shift.assignments = structuredClone(previous.get(shift.id)?.assignments.filter(a => a.manual) ?? []);
    return shift;
  });
  fillDutyShifts(club, month, shifts);
  return {
    month,
    peoplePerShift,
    published: false,
    shifts,
    availabilityVersion: club.availabilityVersion,
    ...(dataset?.settings ? { sourceFilename: dataset.filename } : {}),
  };
}

export function fillDutyShifts(club: Club, month: string, shifts: Shift[], fixedShifts: Shift[] = []) {
  const availableFor = createDutyAvailability(club);
  const adminIds = adminMemberIds(club);
  for (const shift of shifts) {
    if (!shift.cancelled) shift.assignments = rosterAssignments(shift.assignments, adminIds);
  }
  const members = club.members.filter(
    (m) => isRosterMember(m) && m.active && m.joined <= monthDays(month).at(-1)!,
  );
  const counts = new Map(members.map((m) => [m.id, 0]));
  const allShifts = [...shifts, ...fixedShifts];
  for (const shift of allShifts) {
    if (shift.cancelled) continue;
    for (const { memberId } of shift.assignments) {
      const count = counts.get(memberId);
      if (count !== undefined) counts.set(memberId, count + 1);
    }
  }
  const available = (s: Shift) =>
    members.filter(
      (m) => m.joined <= s.date && availableFor(m, s.date, s.period, s).available &&
        !s.assignments.some(a => a.memberId === m.id),
    );
  const sorted = [...shifts].sort(
    (a, b) =>
      available(a).length - available(b).length || a.id.localeCompare(b.id),
  );
  const assign = (shift: Shift, member: Member) => {
    shift.assignments.push({
      memberId: member.id,
      result: "unverified",
      late: false,
      availabilityNote: availableFor(member, shift.date, shift.period, shift).note,
    });
    counts.set(member.id, counts.get(member.id)! + 1);
  };
  // Give as many eligible members as possible a first shift before filling
  // second shifts. Reassigning an earlier match avoids stranding a member who
  // is only free in a slot already taken by someone with other options.
  const seats = sorted
    .filter((shift) => !shift.cancelled)
    .flatMap((shift) => Array.from({ length: Math.max(0, shiftCapacity(shift) - shift.assignments.length) }, (_, position) => ({ shift, position })));
  const seatsByMember = new Map(
    members.map((member) => [
      member.id,
      seats.filter(({ shift }) =>
        availableFor(member, shift.date, shift.period, shift).available,
      ),
    ]),
  );
  const firstAssignments = new Map<(typeof seats)[number], Member>();
  const placeFirst = (
    member: Member,
    visited: Set<(typeof seats)[number]>,
  ): boolean => {
    for (const seat of seatsByMember.get(member.id) ?? []) {
      if (visited.has(seat)) continue;
      visited.add(seat);
      const current = firstAssignments.get(seat);
      if (!current || placeFirst(current, visited)) {
        firstAssignments.set(seat, member);
        return true;
      }
    }
    return false;
  };
  const firstCandidates = members.filter((member) => counts.get(member.id) === 0).sort(
    (a, b) =>
      seatsByMember.get(a.id)!.length - seatsByMember.get(b.id)!.length ||
      a.id.localeCompare(b.id),
  );
  for (const member of firstCandidates) placeFirst(member, new Set());
  for (const seat of seats) {
    const member = firstAssignments.get(seat);
    if (member) assign(seat.shift, member);
  }
  for (const shift of sorted) {
    if (shift.cancelled) continue;
    for (let seat = shift.assignments.length; seat < shiftCapacity(shift); seat++) {
      const candidates = available(shift).filter(
        (m) => !shift.assignments.some((a) => a.memberId === m.id),
      );
      candidates.sort((a, b) => {
        const ac = counts.get(a.id)!,
          bc = counts.get(b.id)!;
        const bandA = ac < 2 ? ac : a.extraDuties ? 2 : 3;
        const bandB = bc < 2 ? bc : b.extraDuties ? 2 : 3;
        const sameDay = (id: string) =>
          allShifts.some(
            (s) =>
              s !== shift &&
              !s.cancelled &&
              s.date === shift.date &&
              s.assignments.some((a) => a.memberId === id),
          )
            ? 1
            : 0;
        return (
          bandA - bandB ||
          sameDay(a.id) - sameDay(b.id) ||
          ac - bc ||
          a.id.localeCompare(b.id)
        );
      });
      const m = candidates[0];
      if (m) assign(shift, m);
    }
  }
}
export function demoClub(ownerId: string, owner?: Member): Club {
  const club = createClub(ownerId);
  club.demo = true;
  const names = [
    "Nguyễn Minh Anh",
    "Trần Hoàng Nam",
    "Lê Phương Thảo",
    "Phạm Đức Huy",
    "Vũ Ngọc Linh",
    "Đặng Tuấn Kiệt",
    "Bùi Hà My",
    "Đỗ Quang Minh",
    "Ngô Khánh Vy",
    "Hoàng Gia Bảo",
    "Đinh Thu Hà",
    "Võ Nhật Long",
    "Nguyễn Hải Yến",
    "Trần Bảo Ngọc",
    "Lê Minh Khang",
    "Phan Anh Thư",
    "Dương Quốc Anh",
    "Mai Thùy Dương",
    "Hồ Đức Anh",
    "Vũ Thanh Tâm",
    "Lý Gia Hân",
    "Nguyễn Hữu Phúc",
    "Trịnh Bảo Châu",
    "Đoàn Thành Đạt",
  ];
  const current = weekId();
  const month = today().slice(0, 7);
  club.members = names.map((name, i) => ({
    id: `demo-${i}`,
    name,
    studentId: `2024${String(1001 + i)}`,
    role: "member",
    active: true,
    joined: `${month.slice(0, 4)}-01-01`,
    extraDuties: i % 4 === 0,
    availability: [1, 2, 3, 4, 5].flatMap((d) =>
      (["am", "pm"] as const)
        .filter((_, p) => (i + d + p) % 4 !== 0)
        .map((p) => `${d}-${p}`),
    ),
  }));
  if (owner)
    club.members.unshift({
      ...owner,
      joined: `${month.slice(0, 4)}-01-01`,
      availability: [1, 2, 3, 4, 5].flatMap((d) => [`${d}-am`, `${d}-pm`]),
    });
  syncWeeks(club);
  const w = club.weeks.find((w) => w.id === current)!;
  w.meetingDate = addDays(current, 5);
  w.location = "Phòng C1.203 · Cơ sở C1";
  w.entries.forEach((e, i) => {
    e.status =
      i < 17
        ? "attending"
        : i < 20
          ? "absent"
          : i < 22
            ? "pending"
            : "unregistered";
    e.reason = ["absent", "pending"].includes(e.status)
      ? i % 2
        ? "Em có lịch học bù vào thời gian họp."
        : "Em có việc gia đình, xin phép vắng buổi này."
      : "";
    e.excused = !!e.reason;
    e.request =
      e.status === "pending"
        ? "Em đã sắp xếp lại lịch, xin đăng ký tham gia ạ."
        : undefined;
    e.passed = i < 9;
  });
  club.availabilityVersion = today();
  club.rules = [{ month: "2000-01", A: 10, B: 15, C: 5, D: 0 }];
  const schedule = makeSchedule(club, month);
  schedule.published = true;
  schedule.shifts.forEach((s) =>
    s.assignments.forEach((a) => {
      if (s.date < today()) a.result = "completed";
    }),
  );
  club.schedules.push(schedule);
  return club;
}

export type WeeklyScore = {
  week: string;
  memberId: string;
  completed: number;
  dutyMissed: number;
  meetingMissed: number;
  passed: number;
  lateCount: number;
  activityCounts: Record<import("./activity").ActivityKind, number>;
  activityTotal: number;
  points: number;
};
export type ScoreboardRow = Omit<WeeklyScore, "week" | "activityTotal"> & {
  name: string;
  committeeNames?: string;
};

export function weeklyScoreFor(club: Club, memberId: string, week: string): WeeklyScore {
  const months = [...new Set([week.slice(0, 7), addDays(week, 6).slice(0, 7)])];
  const parts = months.map(month => scoreFor(club, memberId, month, week));
  const activities = activityScoreFor(club, memberId, week, true);
  return {
    week,
    memberId,
    ...activities,
    completed: parts.reduce((sum, score) => sum + score.completed, 0),
    dutyMissed: parts.reduce((sum, score) => sum + score.dutyMissed, 0),
    meetingMissed: parts.reduce((sum, score) => sum + score.meetingMissed, 0),
    passed: parts.reduce((sum, score) => sum + score.passed, 0),
    lateCount: parts.reduce((sum, score) => sum + score.lateCount, 0),
    points: Number(parts.reduce((sum, score) => sum + score.points, 0).toFixed(10)),
  };
}
