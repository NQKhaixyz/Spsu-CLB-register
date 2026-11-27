import { addDays, isRosterMember, isShiftPublished, today, weekId, type Club, type Member, type Shift } from "./club";
import type { PhotoEvidence } from "./photo-evidence";
export { maxPhotoBytes as maxDutyPhotoBytes, type PhotoEvidence as DutyEvidence, type PhotoEvidenceView as DutyEvidenceView } from "./photo-evidence";

export type EvidenceAssignment = { month: string; shiftId: string; memberId: string };
export type DutyEvidenceSummary = {
  week: string;
  rows: (EvidenceAssignment & { status: PhotoEvidence["status"] })[];
};
export function evidenceExpiry(date: string) {
  return Date.parse(addDays(weekId(date), 7) + "T00:00:00+07:00");
}

export function evidenceSubmissionOpen(shift: Shift, now = new Date()) {
  const date = today(now);
  if (shift.cancelled || shift.date > date || now.getTime() >= evidenceExpiry(shift.date)) return false;
  const startsAt = shift.startTime && Date.parse(`${shift.date}T${shift.startTime}:00+07:00`);
  return !startsAt || now.getTime() >= startsAt;
}

export function findEvidenceAssignment(club: Club, viewer: Member, target: EvidenceAssignment) {
  if (!viewer.active || (viewer.role !== "admin" && viewer.id !== target.memberId)) return null;
  const member = club.members.find(item => item.id === target.memberId);
  if (!member || !isRosterMember(member)) return null;
  const schedule = club.schedules.find(item => item.month === target.month);
  const shift = schedule?.shifts.find(item => item.id === target.shiftId);
  if (!schedule || !shift || !isShiftPublished(schedule, shift) || shift.cancelled ||
      !shift.assignments.some(assignment => assignment.memberId === target.memberId && assignment.result !== "cancelled")) {
    return null;
  }
  return shift;
}
