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
export type Member = {
  id: string;
  name: string;
  studentId: string;
  userId?: string;
  email?: string;
  role: "admin" | "member";
  active: boolean;
  joined: string;
  left?: string;
  availability: string[];
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
};
export type Assignment = {
  memberId: string;
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
  published: boolean;
  shifts: Shift[];
  availabilityVersion?: string;
  sourceFilename?: string;
};
export type Rule = {
  month: string;
  A: number;
  B: number;
  C: number;
  D: number;
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
  rules: Rule[];
  days: number[];
  availabilityVersion: string;
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
  logs: { at: string; actor: string; text: string }[];
};
export type View = {
  club: Club;
  me: Member | null;
  isAdmin: boolean;
  identity: { name: string; email: string };
  setup: boolean;
  revision: number;
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
  return (
    [...club.rules]
      .filter((r) => r.month <= month)
      .sort((a, b) => b.month.localeCompare(a.month))[0] ?? {
      month,
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    }
  );
}
export function createClub(ownerId: string): Club {
  return {
    ownerId,
    name: "Nhịp CLB",
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
export function syncWeeks(club: Club, date = today()) {
  const current = weekId(date);
  let changed = false;
  const latest = [...club.weeks].sort((a, b) => b.id.localeCompare(a.id))[0]
    ?.id;
  // Catch up after downtime without losing unregistered members in skipped weeks.
  if (latest)
    for (let id = addDays(latest, 7); id <= current; id = addDays(id, 7)) {
      club.weeks.push({
        id,
        meetingDate: "",
        time: "18:30",
        location: "Phòng sinh hoạt CLB",
        closed: false,
        cancelled: false,
        entries: club.members
          .filter(
            (m) => m.joined <= addDays(id, 6) && (!m.left || m.left >= id),
          )
          .map((m) => newEntry(m.id)),
      });
      changed = true;
    }
  for (const w of club.weeks)
    if (!w.closed && addDays(w.id, 7) <= date) {
      closeWeek(w);
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
      location: "Phòng sinh hoạt CLB",
      closed: false,
      cancelled: false,
      entries: club.members
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
    for (const m of club.members.filter(
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
  return member.joined <= date && (!member.left || member.left >= date);
}
export function reportMembers(club: Club, month: string) {
  const end = monthDays(month).at(-1)!;
  return club.members.filter(
    (m) => m.joined <= end && (!m.left || m.left >= month + "-01"),
  );
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
export function closeWeek(week: Week) {
  if (week.closed) return;
  for (const e of week.entries) {
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
}
export const isChargeableLate = (a: Assignment) =>
  !!a.late && !["unexcused", "excused", "cancelled"].includes(a.result);
export const latePenaltyFor = (a: Assignment, rule: Rule) =>
  isChargeableLate(a) ? (rule.D ?? 0) : 0;
export const dutyPointsFor = (a: Assignment, rule: Rule) =>
  (a.result === "completed" ? rule.A : a.result === "unexcused" ? -rule.B : 0) -
  latePenaltyFor(a, rule);
export function scoreFor(club: Club, memberId: string, month: string) {
  const rule = rulesFor(club, month);
  const member = club.members.find((m) => m.id === memberId);
  const duties = club.schedules
    .filter((s) => s.month === month && s.published)
    .flatMap((s) =>
      s.shifts
        .filter((t) => !t.cancelled)
        .flatMap((t) => t.assignments.filter((a) => a.memberId === memberId)),
    );
  const weeks = club.weeks.filter(
    (w) =>
      !w.cancelled &&
      w.meetingDate.slice(0, 7) === month &&
      !!member &&
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
  const passed = entries.filter(({ e }) => e?.passed).length;
  return {
    completed,
    dutyMissed,
    meetingMissed,
    attended,
    passed,
    lateCount,
    lateDeduction,
    points:
      completed * rule.A -
      dutyMissed * rule.B -
      meetingMissed * rule.C -
      lateDeduction,
  };
}
export function makeSchedule(club: Club, month: string): Schedule {
  const dataset = activeAvailabilityDatasetFor(club);
  const availableFor = createDutyAvailability(club),
    detailSettings = dataset?.settings;
  const members = club.members.filter(
    (m) => m.active && m.joined <= monthDays(month).at(-1)!,
  );
  const counts = new Map(members.map((m) => [m.id, 0]));
  const cancelled = new Map(
    (club.schedules.find((s) => s.month === month)?.shifts ?? [])
      .filter((t) => t.cancelled)
      .map((t) => [t.id, t]),
  );
  const shifts: Shift[] = monthDays(month)
    .filter(
      (d) =>
        club.days.includes(weekday(d)) &&
        (!detailSettings || d >= detailSettings.startDate),
    )
    .flatMap((date) =>
      (["am", "pm"] as const).map((period) => ({
        id: `${date}-${period}`,
        date,
        period,
        assignments: [] as Assignment[],
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
    )
    .map((shift) =>
      cancelled.has(shift.id)
        ? structuredClone(cancelled.get(shift.id)!)
        : shift,
    );
  const available = (s: Shift) =>
    members.filter(
      (m) => m.joined <= s.date && availableFor(m, s.date, s.period).available,
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
      availabilityNote: availableFor(member, shift.date, shift.period).note,
    });
    counts.set(member.id, counts.get(member.id)! + 1);
  };
  // Give as many eligible members as possible a first shift before filling
  // second shifts. Reassigning an earlier match avoids stranding a member who
  // is only free in a slot already taken by someone with other options.
  const seats = sorted
    .filter((shift) => !shift.cancelled)
    .flatMap((shift) => [0, 1].map((position) => ({ shift, position })));
  const seatsByMember = new Map(
    members.map((member) => [
      member.id,
      seats.filter(({ shift }) =>
        availableFor(member, shift.date, shift.period).available,
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
  const firstCandidates = [...members].sort(
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
    for (let seat = shift.assignments.length; seat < 2; seat++) {
      const candidates = available(shift).filter(
        (m) => !shift.assignments.some((a) => a.memberId === m.id),
      );
      candidates.sort((a, b) => {
        const ac = counts.get(a.id)!,
          bc = counts.get(b.id)!;
        const bandA = ac < 2 ? ac : a.extraDuties ? 2 : 3;
        const bandB = bc < 2 ? bc : b.extraDuties ? 2 : 3;
        const sameDay = (id: string) =>
          shifts.some(
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
  return {
    month,
    published: false,
    shifts,
    availabilityVersion: club.availabilityVersion,
    ...(detailSettings
      ? { sourceFilename: dataset?.filename }
      : {}),
  };
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
