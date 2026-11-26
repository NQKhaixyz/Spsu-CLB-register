import { env } from "cloudflare:workers";
import { addDays, createDutyShiftSlots, isUpcomingShift, type Club } from "./club";
import { AuthError } from "./password";
import { readState } from "./store";

export const DUTY_RESET_WEEK = "2026-11-09";
const resetEnd = addDays(DUTY_RESET_WEEK, 6);
const resetMonth = DUTY_RESET_WEEK.slice(0, 7);
export const DUTY_RESET_ID = "owner-reset-duty-week-2026-11-09";

type Receipt = { removed_shifts: number; removed_assignments: number };

function targetSchedule(club: Club) {
  const schedule = club.schedules.find((s) => s.month === resetMonth);
  if (!schedule?.published)
    throw new AuthError("Không tìm thấy lịch trực tháng 11 đã công bố.", 409);
  return schedule;
}

const inScope = (date: string) => date >= DUTY_RESET_WEEK && date <= resetEnd;

async function readReceipt() {
  if (!env.DB) throw new Error("Chưa kết nối cơ sở dữ liệu.");
  return env.DB.prepare("SELECT removed_shifts,removed_assignments FROM club_week_trash WHERE id=?")
    .bind(DUTY_RESET_ID).first<Receipt>();
}

export async function inspectDutyWeekReset() {
  const { club, revision } = await readState("", false);
  const schedule = targetSchedule(club);
  const shifts = schedule.shifts.filter((shift) => inScope(shift.date));
  return {
    week: DUTY_RESET_WEEK,
    end: resetEnd,
    month: resetMonth,
    revision,
    shifts: shifts.length,
    cancelled: shifts.filter((shift) => shift.cancelled).length,
    assignments: shifts.reduce((total, shift) => total + shift.assignments.length, 0),
    ready: schedule.pendingDutyWeek === DUTY_RESET_WEEK,
    upcomingSlots: createDutyShiftSlots(club, resetMonth, schedule.peoplePerShift ?? 2)
      .filter((shift) => inScope(shift.date) && isUpcomingShift(shift)).length,
    receipt: await readReceipt(),
  };
}

// Back up only the selected week's duty slots and change the live record in one
// transaction. The receipt prevents retries from deleting a newly generated plan.
export async function runDutyWeekReset(expectedRevision: number) {
  const db = env.DB;
  if (!db) throw new Error("Chưa kết nối cơ sở dữ liệu.");
  if (await readReceipt()) return inspectDutyWeekReset();
  const { club, revision } = await readState("", false);
  if (revision !== expectedRevision)
    throw new AuthError("Lịch đã được cập nhật. Hãy kiểm tra lại trước khi xóa.", 409);
  const schedule = targetSchedule(club);
  const removed = schedule.shifts.filter((shift) => inScope(shift.date));
  const assignments = removed.reduce((total, shift) => total + shift.assignments.length, 0);
  schedule.shifts = schedule.shifts.filter((shift) => !inScope(shift.date));
  schedule.pendingDutyWeek = DUTY_RESET_WEEK;
  const createdAt = new Date().toISOString();
  club.logs.unshift({
    at: createdAt,
    actor: "Chủ quản trị",
    text: `Dọn lịch trực tuần ${DUTY_RESET_WEEK}–${resetEnd}: ${removed.length} ca, ${assignments} phân công. Có bản sao khôi phục.`,
  });
  const results = await db.batch([
    db.prepare(
      "INSERT OR IGNORE INTO club_week_trash(id,week_start,week_end,created_at,source_revision,removed_weeks,removed_entries,removed_shifts,removed_assignments,payload) SELECT ?,?,?,?,?,0,0,?,?,? WHERE EXISTS(SELECT 1 FROM club_state WHERE id='main' AND revision=?)",
    ).bind(DUTY_RESET_ID, DUTY_RESET_WEEK, resetEnd, createdAt, revision, removed.length, assignments, JSON.stringify({ month: resetMonth, shifts: removed }), revision),
    db.prepare(
      "UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=? AND EXISTS(SELECT 1 FROM club_week_trash WHERE id=? AND source_revision=?)",
    ).bind(JSON.stringify(club), revision, DUTY_RESET_ID, revision),
  ]);
  if (!results[1].meta.changes && !await readReceipt())
    throw new AuthError("Lịch đã được cập nhật. Hãy kiểm tra lại trước khi xóa.", 409);
  return inspectDutyWeekReset();
}
