import { addDays, adminMemberIds, rosterAssignments, today, weekId, weeklyScoreFor, isDutyReportShift, isShiftPublished, pausedForScoreWeek, reportMembers, scoreFor, type Assignment, type Club, type ScoreboardRow, type View } from "./club";
import { committeeLabels, memberCommitteeNames } from "./committees";
import { bulletinView } from "./bulletin";
import { rankScoreRows } from "./score-ranks";
import { memberFeedbackView } from "./feedback";
import { sharingViewFor } from "./sharing";
import { sharingScoreBook, type SharingScoreIndex } from "./sharing-scores";
import { academicWeekForClub, dutyAcademicWeek, profileAvailability, profileAvailabilityRows } from "./availability";

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

export function monthlyScoreboard(club: Club, month: string, asOf = today(),
  sharingIndex: SharingScoreIndex = sharingScoreBook(club).index): ScoreboardRow[] {
  return reportMembers(club, month, asOf).map(member => {
    const {
      points, completed, dutyMissed, meetingMissed, attended, passed, lateCount,
      activityCounts, activityPoints, attendancePoints, sharingAdjustment,
    } = scoreFor(club, member.id, month, undefined, sharingIndex);
    return {
      memberId: member.id, name: displayText(member.name), committeeNames: memberCommitteeNames(member),
      points, completed, dutyMissed, meetingMissed, attended, passed, lateCount,
      activityCounts, activityPoints, attendancePoints,
      ...(sharingAdjustment.cupid || sharingAdjustment.guild ? { sharingAdjustment } : {}),
    };
  });
}

export function workspaceView(
  club: Club,
  user: { userId: string; displayName: string; email: string },
  revision: number,
) {
  const adminIds = adminMemberIds(club);
  const now = Date.now();
  const book = sharingScoreBook(club, now);
  const currentDay = today();
  const currentAcademicWeek = academicWeekForClub(club, currentDay);
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
    .map(m => weeklyScoreFor(club, m.id, w.id, book.index)));
  const me = club.members.find((m) => m.userId === user.userId) ?? null;
  const currentMonth = currentDay.slice(0, 7);
  const monthStandings = me?.active ? rankScoreRows(monthlyScoreboard(club, currentMonth, currentDay, book.index)) : undefined;
  const monthlyAvatarRanks = monthStandings && {
    month: currentMonth,
    memberIds: monthStandings.slice(0, 10).map(row => row.memberId),
  };
  const currentMonthScores = monthStandings && {
    month: currentMonth,
    rows: monthStandings.map(({ memberId, points, rank }) => ({ memberId, points, rank })),
  };
  const feedback = me?.active ? memberFeedbackView(club, me.id) : undefined;
  const bulletin = me?.active ? bulletinView(club, me) : undefined;
  const isAdmin = me?.role === "admin" && me.active;
  const sharing = me?.active ? sharingViewFor(club, me, book, now) : undefined;
  const sharingReport = isAdmin && club.sharing ? {
    adjustments: book.adjustments,
    lockedManualKeys: club.sharing.locked.flatMap(row => row.sourceType === "manual" && row.sourceKey ? [row.sourceKey] : []),
  } : undefined;
  const personalMonthlyScores = !isAdmin && me
    ? Object.fromEntries([...new Set([currentMonth, ...club.schedules.map(schedule => schedule.month),
        ...club.weeks.map(week => week.meetingDate.slice(0, 7)),
        ...book.adjustments.filter(row => row.memberId === me.id).map(row => row.month)])]
        .map(month => [month, scoreFor(club, me.id, month, undefined, book.index)]))
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
    delete club.semesterScoreDraft;
  }
  const { memberFeedback: _privateFeedback, feedbackResetReceipt: _feedbackResetReceipt, sharing: _sharing,
    activityNotices: _activityNotices, directNotices: _directNotices, ...visibleClub } = club;
  const view = currentTerminology({ club: visibleClub, me, isAdmin: !!isAdmin, setup: !me,
    identity: { name: user.displayName, email: user.email }, revision, weeklyScores, monthlyAvatarRanks, currentMonthScores,
    personalMonthlyScores, directoryAvailability, currentAcademicWeek, bulletin, feedback, sharing, sharingReport });
  delete view.club.bulletinPosts;
  delete view.club.bulletinUploads;
  if (view.club.activityRegistrations) {
    view.club.activityRegistrations = view.club.activityRegistrations.filter(row => !adminIds.has(row.memberId));
  }
  for (const row of view.club.activityRegistrations ?? []) {
    if (row.evidence) delete row.evidence.linkUrl;
  }
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
        const academicWeek = dutyAcademicWeek(club, shift);
        if (academicWeek !== undefined) shift.academicWeek = academicWeek;
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
