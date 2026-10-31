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
};
export type Shift = {
  id: string;
  date: string;
  period: "am" | "pm";
  assignments: Assignment[];
};
export type Schedule = {
  month: string;
  published: boolean;
  shifts: Shift[];
  availabilityVersion?: string;
};
export type Rule = {
  month: string;
  A: number;
  B: number;
  C: number;
  D: number;
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
  if (!w.closed)
    for (const m of club.members.filter((m) => m.active && m.joined <= date))
      if (!w.entries.some((e) => e.memberId === m.id)) {
        w.entries.push(newEntry(m.id));
        changed = true;
      }
  return changed;
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
export function scoreFor(club: Club, memberId: string, month: string) {
  const rule = rulesFor(club, month);
  const duties = club.schedules
    .filter((s) => s.month === month && s.published)
    .flatMap((s) =>
      s.shifts.flatMap((t) =>
        t.assignments.filter((a) => a.memberId === memberId),
      ),
    );
  const weeks = club.weeks.filter(
    (w) => !w.cancelled && w.meetingDate.slice(0, 7) === month,
  );
  const entries = weeks
    .map((w) => ({
      closed: w.closed,
      e: w.entries.find((e) => e.memberId === memberId),
    }))
    .filter((x) => x.e);
  const completed = duties.filter((a) => a.result === "completed").length;
  const dutyMissed = duties.filter((a) => a.result === "unexcused").length;
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
    points: completed * rule.A - dutyMissed * rule.B - meetingMissed * rule.C,
  };
}
export function makeSchedule(club: Club, month: string): Schedule {
  const members = club.members.filter(
    (m) => m.active && m.joined <= monthDays(month).at(-1)!,
  );
  const counts = new Map(members.map((m) => [m.id, 0]));
  const shifts: Shift[] = monthDays(month)
    .filter((d) => club.days.includes(weekday(d)))
    .flatMap((date) =>
      (["am", "pm"] as const).map((period) => ({
        id: `${date}-${period}`,
        date,
        period,
        assignments: [] as Assignment[],
      })),
    );
  const available = (s: Shift) =>
    members.filter(
      (m) =>
        m.joined <= s.date &&
        m.availability.includes(`${weekday(s.date)}-${s.period}`),
    );
  const sorted = [...shifts].sort(
    (a, b) =>
      available(a).length - available(b).length || a.id.localeCompare(b.id),
  );
  for (const shift of sorted) {
    for (let seat = 0; seat < 2; seat++) {
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
      if (m) {
        shift.assignments.push({ memberId: m.id, result: "unverified" });
        counts.set(m.id, counts.get(m.id)! + 1);
      }
    }
  }
  return {
    month,
    published: false,
    shifts,
    availabilityVersion: club.availabilityVersion,
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
