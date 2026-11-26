import { addDays, isUpcomingShift, today, weekId } from "./club";
import { readState, writeState } from "./store";

const requestedWeek = "2026-11-09";

// Apply the owner's one-time request on this site. Keep the receipt even after
// republication so the existing weekly maintenance cannot withdraw it again.
export async function withdrawRequestedDutyWeek(now = new Date()) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { club, revision } = await readState("", false);
    if (club.dutyWithdrawal?.week === requestedWeek)
      return { ...club.dutyWithdrawal, alreadyDone: true };
    if (weekId(today(now)) !== requestedWeek)
      return { week: requestedWeek, count: 0, alreadyDone: false };
    const shifts = club.schedules.filter((s) => s.published).flatMap((s) => s.shifts)
      .filter((shift) =>
        shift.date >= requestedWeek && shift.date <= addDays(requestedWeek, 6) &&
        isUpcomingShift(shift, now) &&
        (shift.cancellationSnapshot ?? shift.assignments).every((a) => a.result === "unverified" && !a.late),
      );
    for (const shift of shifts) shift.draft = true;
    club.dutyWithdrawal = { week: requestedWeek, count: shifts.length };
    club.logs.unshift({
      at: now.toISOString(),
      actor: "Chủ quản trị",
      text: `Rút ${shifts.length} ca trực sắp tới tuần ${requestedWeek} về nháp`,
    });
    if (await writeState(club, revision))
      return { ...club.dutyWithdrawal, alreadyDone: false };
  }
  throw new Error("Lịch đang được cập nhật. Vui lòng thử lại.");
}
