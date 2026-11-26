import { synchronize, readState } from "../../../lib/store";
import { isUpcomingShift, weekId } from "../../../lib/club";
import { runAuthorizedWeekCleanup } from "../../../lib/run-week-cleanup";
import { withdrawRequestedDutyWeek } from "../../../lib/withdraw-duty-week";
import { CLEANUP_START, CLEANUP_END, CLEANUP_WEEK } from "../../../lib/authorized-week-cleanup";
export const dynamic = "force-dynamic";
// Fixed owner-approved cleanup is applied once; no arbitrary deletion input.
export async function POST() {
  const cleanup = await runAuthorizedWeekCleanup();
  const dutyWithdrawal = await withdrawRequestedDutyWeek();
  const changed = await synchronize();
  const { club } = await readState("", false);
  const withdrawn = club.schedules.filter((s) => s.published).flatMap((s) => s.shifts)
    .filter((shift) => shift.draft && weekId(shift.date) === dutyWithdrawal.week);
  const inRange = (date: string) => date >= CLEANUP_START && date <= CLEANUP_END;
  const sources = [club, ...(club.demoArchive ? [club.demoArchive] : [])];
  const remainingWeeks = sources.reduce((n, s) => n + s.weeks.filter(w => w.id === CLEANUP_WEEK || inRange(w.meetingDate)).length, 0);
  const remainingShifts = sources.reduce((n, s) => n + s.schedules.flatMap(schedule => schedule.shifts).filter(shift => inRange(shift.date)).length, 0);
  const cleanupVerified = remainingWeeks === 0 && remainingShifts === 0 && !!club.deletedWeeks?.includes(CLEANUP_WEEK) && !!club.deletedDutyDates?.includes(CLEANUP_START);
  return Response.json(
    { ok: cleanupVerified, changed, currentWeek: weekId(), timezone: "Asia/Ho_Chi_Minh", dutyWithdrawal: { ...dutyWithdrawal, drafts: withdrawn.length, editable: withdrawn.filter((s) => !s.cancelled && isUpcomingShift(s)).length }, cleanup: { ...cleanup, verified: cleanupVerified, remainingWeeks, remainingShifts } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
