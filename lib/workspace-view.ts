import { addDays, adminMemberIds, rosterAssignments, today, weekId, weeklyScoreFor, isDutyReportShift, isShiftPublished, pausedForScoreWeek, reportMembers, scoreFor, type Assignment, type Club, type ScoreboardRow, type View } from "./club";
import { committeeLabels, memberCommitteeNames } from "./committees";
import { bulletinView } from "./bulletin";
import { rankScoreRows } from "./score-ranks";
import { academicWeekFor, activeAvailabilityDatasetFor, profileAvailability, profileAvailabilityRows } from "./availability";

// Show current organization and role wording in the interface and reports,
// while keeping logins, IDs, and stored history as recorded.
const displayTextFields = new Set([
  "name", "description", "actor", "text", "reason", "request", "decision", "note",
  "availabilityNote", "cancelReason", "importedBy", "location", "filename", "sourceFilename",
]);
function displayText(text: string) {
  return text.replace(/\bCLB\b/g, "Đội")
    .replace(/\bBCS\b/g, "BĐH")
    .replace(/Ban cán sự/g, "Ban điều hành")
    .replace(/ban cán sự/g, "ban điều hành")
    .replace(/BAN CÁN SỰ/g, "BAN ĐIỀU HÀNH")
    .replace(/^Nhập Có sáng kiến:/, "Nhập Sáng kiến:")
    .replace(/^Nhập Tư vấn DDV:/, "Nhập Đồng đẳng viên:");
}
function currentTerminology<T>(value: T): T {
  if (Array.isArray(value)) return value.map(currentTerminology) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item === "string" && displayTextFields.has(key)
      ? displayText(item)
      : currentTerminology(item),
  ])) as T;
}

export function monthlyScoreboard(club: Club, month: string, asOf = today()): ScoreboardRow[] {
  return reportMembers(club, month, asOf).map(member => {
    const {
      points, completed, dutyMissed, meetingMissed, attended, passed, lateCount,
      activityCounts, activityPoints, attendancePoints,
    } = scoreFor(club, member.id, month);
    return {
      memberId: member.id, name: displayText(member.name), committeeNames: memberCommitteeNames(member),
      points, completed, dutyMissed, meetingMissed, attended, passed, lateCount,
      activityCounts, activityPoints, attendancePoints,
    };
  });
}

export function workspaceView(
  club: Club,
  user: { userId: string; displayName: string; email: string },
  revision: number,
) {
  const adminIds = adminMemberIds(club);
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
    .filter(m => m.role !== "admin" && !pausedForScoreWeek(m, w.id) &&
      (assignedByWeek.get(w.id)?.has(m.id) || m.joined <= addDays(w.id, 6)))
    .map(m => weeklyScoreFor(club, m.id, w.id)));
  const me = club.members.find((m) => m.userId === user.userId) ?? null;
  const currentDay = today();
  const currentMonth = currentDay.slice(0, 7);
  const monthlyAvatarRanks = me?.active ? {
    month: currentMonth,
    memberIds: rankScoreRows(monthlyScoreboard(club, currentMonth, currentDay)).slice(0, 10).map(row => row.memberId),
  } : undefined;
  const bulletin = me?.active ? bulletinView(club, me) : undefined;
  const isAdmin = me?.role === "admin" && me.active;
  const personalMonthlyScores = !isAdmin && me
    ? Object.fromEntries([...new Set([currentMonth, ...club.schedules.map(schedule => schedule.month)])]
        .map(month => [month, scoreFor(club, me.id, month)]))
    : undefined;
  const directoryAvailability: View["directoryAvailability"] = !isAdmin && me?.active ? {} : undefined;
  if (!isAdmin) {
    club = structuredClone(club);
    club.members = club.members.map(m => {
      if (!directoryAvailability)
        return m.id === me?.id ? m : { id: m.id, name: m.name, studentId: "", role: "member", active: m.active, joined: m.joined, availability: [], extraDuties: false };
      const rows = profileAvailabilityRows(club, m);
      if (rows.length) directoryAvailability[m.id] = rows.map(({ day, period, weeks, note }) => ({ day, period, weeks, note }));
      const availability = profileAvailability(club, m, rows);
      if (m.id === me?.id) return { ...m, availability };
      const { id, name, studentId, email, role, position, avatarId, active, joined, left, extraDuties, committee, committees, loginName, needsStudentId } = m;
      return { id, name, studentId, email, role, position, avatarId, active, joined, left, extraDuties, committee, committees, loginName, needsStudentId, availability };
    });
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
  const view = currentTerminology({ club, me, isAdmin: !!isAdmin, setup: !me, identity: { name: user.displayName, email: user.email }, revision, weeklyScores, monthlyAvatarRanks, personalMonthlyScores, directoryAvailability, currentAcademicWeek, bulletin });
  delete view.club.bulletinPosts;
  delete view.club.bulletinUploads;
  // Keep stored attendance history, while removal from the visible roster also
  // frees seats and excludes previous BĐH assignments from the displayed totals.
  const visibleAssignments = (rows: Assignment[]) =>
    rosterAssignments(rows, adminIds).map(row => row.originalId && adminIds.has(row.originalId)
      ? { ...row, originalId: undefined } : row);
  for (const group of [view.club, view.club.demoArchive]) {
    if (!group) continue;
    for (const week of group.weeks) {
      week.entries = week.entries.filter(entry => !adminIds.has(entry.memberId));
      if (week.closingSnapshot) {
        week.closingSnapshot.before = week.closingSnapshot.before.filter(entry => !adminIds.has(entry.memberId));
        week.closingSnapshot.after = week.closingSnapshot.after.filter(entry => !adminIds.has(entry.memberId));
      }
    }
    for (const schedule of group.schedules) {
      for (const shift of schedule.shifts) {
        shift.assignments = visibleAssignments(shift.assignments);
        if (shift.cancellationSnapshot) shift.cancellationSnapshot = visibleAssignments(shift.cancellationSnapshot);
      }
    }
  }
  // Return personal settings on the signed-in account only.
  for (const member of [...view.club.members, ...(view.club.demoArchive?.members ?? [])]) {
    delete member.fontPreference;
    delete member.sidebarOrder;
  }
  if (view.me) delete view.me.sidebarOrder;
  for (const log of view.club.logs) {
    log.text = log.text
      .replace(/^(Nhập Điểm theo ban: .*), Ban (?:HC|hậu cần) · /i, "$1, ")
      .replace(/^(Nhập Điểm theo ban: .*), (?:Cán sự|Ban điều hành|Ban ĐH) · /i, "$1, " + committeeLabels.cs + " · ");
  }
  if (club.links) view.club.links = club.links;
  return view;
}
