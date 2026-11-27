import {
  addDays, adminMemberIds, canReplanDutyShift, createDutyShiftSlots, fillDutyShifts, weekId,
  type Club, type Schedule,
} from "./club";
import { activeAvailabilityDatasetFor } from "./availability";

export function planDutyWeek(club: Club, week: string, capacity: number) {
  const months = new Set([week.slice(0, 7), addDays(week, 6).slice(0, 7)]);
  const adminIds = adminMemberIds(club);
  const dataset = activeAvailabilityDatasetFor(club);
  let planned = 0;
  for (const month of months) {
    const existing = club.schedules.find(schedule => schedule.month === month);
    const schedule: Schedule = existing ?? {
      month, published: false, shifts: [], peoplePerShift: capacity,
      availabilityVersion: club.availabilityVersion,
      ...(dataset?.settings ? { sourceFilename: dataset.filename } : {}),
    };
    let shifts = schedule.shifts.filter(shift => weekId(shift.date) === week);
    if (!shifts.length) {
      shifts = createDutyShiftSlots(club, month, capacity)
        .filter(shift => weekId(shift.date) === week)
        .map(shift => ({ ...shift, draft: true }));
      if (!shifts.length) continue;
      schedule.shifts = [...schedule.shifts, ...shifts].sort((a, b) => a.id.localeCompare(b.id));
      if (!existing) club.schedules.push(schedule);
    }
    const editable = shifts.filter(shift => canReplanDutyShift(schedule, shift, adminIds));
    if (!editable.length) continue;
    const previous = new Map(editable.map(shift => [shift.id, shift.assignments]));
    for (const shift of editable) {
      shift.capacity = capacity;
      shift.assignments = shift.assignments.filter(a => a.manual);
    }
    const changing = new Set(editable);
    fillDutyShifts(club, month, editable, schedule.shifts.filter(shift => !changing.has(shift)));
    for (const shift of editable) {
      for (const assignment of shift.assignments) {
        const prior = previous.get(shift.id)?.find(a => a.memberId === assignment.memberId);
        if (prior?.note) assignment.note = prior.note;
        if (prior?.originalId) assignment.originalId = prior.originalId;
      }
    }
    if (schedule.pendingDutyWeek === week) delete schedule.pendingDutyWeek;
    planned += editable.length;
  }
  return planned;
}
