import { addDays, today, weekId, weeklyScoreFor, isDutyReportShift, isShiftPublished, scoreFor, type Club } from "./club";
import { academicWeekFor, activeAvailabilityDatasetFor } from "./availability";

// Show current organization and role wording in the interface and reports,
// while keeping logins, IDs, and stored history as recorded.
const displayTextFields = new Set([
  "name", "description", "actor", "text", "reason", "request", "decision", "note",
  "availabilityNote", "cancelReason", "importedBy", "location", "filename", "sourceFilename",
]);
function currentTerminology<T>(value: T): T {
  if (Array.isArray(value)) return value.map(currentTerminology) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item === "string" && displayTextFields.has(key)
      ? item.replace(/\bCLB\b/g, "Đội")
          .replace(/\bBCS\b/g, "BĐH")
          .replace(/Ban cán sự/g, "Ban điều hành")
          .replace(/ban cán sự/g, "ban điều hành")
          .replace(/BAN CÁN SỰ/g, "BAN ĐIỀU HÀNH")
          .replace(/^Nhập Có sáng kiến:/, "Nhập Sáng kiến:")
          .replace(/^Nhập Tư vấn DDV:/, "Nhập Đồng đẳng viên:")
      : currentTerminology(item),
  ])) as T;
}

export function workspaceView(
  club: Club,
  user: { userId: string; displayName: string; email: string },
  revision: number,
) {
  const academicSettings = activeAvailabilityDatasetFor(club)?.settings;
  // The club's confirmed anchor is week 11, starting Monday 09/11/2026.
  // Compute before filtering private availability data so every member sees it.
  const currentAcademicWeek = academicSettings
    ? academicWeekFor(weekId(), academicSettings)
    : 11 + Math.floor((Date.parse(weekId()) - Date.parse("2026-11-09")) / 604800000);
  const assignedByWeek = new Map<string, Set<string>>();
  for (const schedule of club.schedules) {
    for (const shift of schedule.shifts) {
      if (shift.cancelled || !isDutyReportShift(schedule, shift) || !shift.assignments.length) continue;
      const week = weekId(shift.date);
      const ids = assignedByWeek.get(week) ?? new Set<string>();
      for (const assignment of shift.assignments) ids.add(assignment.memberId);
      assignedByWeek.set(week, ids);
    }
  }
  const weeklyScores = club.weeks.flatMap(w => club.members
    .filter(m => assignedByWeek.get(w.id)?.has(m.id) ||
      (m.joined <= addDays(w.id, 6) && (!m.left || m.left >= w.id)))
    .map(m => weeklyScoreFor(club, m.id, w.id)));
  const me = club.members.find((m) => m.userId === user.userId) ?? null;
  const isAdmin = me?.role === "admin" && me.active;
  const personalMonthlyScores = !isAdmin && me
    ? Object.fromEntries([...new Set([today().slice(0, 7), ...club.schedules.map(schedule => schedule.month)])]
        .map(month => [month, scoreFor(club, me.id, month)]))
    : undefined;
  if (!isAdmin) {
    club = structuredClone(club);
    club.members = club.members.map((m) =>
      m.id === me?.id
        ? m
        : { id: m.id, name: m.name, studentId: "", role: "member", active: m.active, joined: m.joined, availability: [], extraDuties: false },
    );
    club.weeks = club.weeks.map(({ closingSnapshot, ...w }) => ({ ...w, entries: w.entries.filter((e) => e.memberId === me?.id) }));
    club.schedules = club.schedules.filter((s) => s.shifts.some(shift => isShiftPublished(s, shift))).map(({ pendingDutyWeek, ...s }) => ({
      ...s,
      shifts: s.shifts.filter((t) => isShiftPublished(s, t)).map((t) => {
        const { cancellationSnapshot, ...safeShift } = t;
        return { ...safeShift, assignments: t.assignments.map((a) => a.memberId === me?.id ? a : { memberId: a.memberId, result: "unverified" }) };
      }),
    }));
    club.activityRegistrations = (club.activityRegistrations ?? []).filter((r) => r.memberId === me?.id);
    club.manualActivities = (club.manualActivities ?? []).filter((r) => r.memberId === me?.id);
    club.pointDeductions = (club.pointDeductions ?? []).filter((r) => r.memberId === me?.id);
    club.logs = [];
    club.ownerId = "";
    delete club.availabilityDataset;
    delete club.activeAvailabilityDataset;
    delete club.demoArchive;
    delete club.dutyWithdrawal;
  }
  const view = currentTerminology({ club, me, isAdmin: !!isAdmin, setup: !me, identity: { name: user.displayName, email: user.email }, revision, weeklyScores, personalMonthlyScores, currentAcademicWeek });
  for (const log of view.club.logs) {
    log.text = log.text.replace(/^(Nhập Điểm theo ban: .*), Ban (?:HC|hậu cần) · /i, "$1, ");
  }
  if (club.links) view.club.links = club.links;
  return view;
}
