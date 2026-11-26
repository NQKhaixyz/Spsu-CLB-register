import { env } from "cloudflare:workers";
import { readState } from "./store";
import { today, type Club } from "./club";
import { CLEANUP_ID, CLEANUP_START, CLEANUP_END, planAuthorizedWeekCleanup } from "./authorized-week-cleanup";

type Receipt = { removed_weeks: number; removed_entries: number; removed_shifts: number; removed_assignments: number };
type CleanupRequest = {
  id: string;
  start: string;
  end: string;
  label: string;
  plan: (club: Club) => ReturnType<typeof planAuthorizedWeekCleanup>;
};
const previousCleanup = {
  id: CLEANUP_ID,
  start: CLEANUP_START,
  end: CLEANUP_END,
  label: "dữ liệu họp và trực",
  plan: planAuthorizedWeekCleanup,
};
// No caller-supplied IDs/ranges: this is one fixed deletion explicitly requested
// by the Site owner. The durable receipt makes maintenance replays a no-op.
export async function runAuthorizedWeekCleanup({ id, start, end, label, plan }: CleanupRequest = previousCleanup) {
  if (today() <= end) throw new Error("Chỉ dọn tuần đã kết thúc.");
  const db = env.DB;
  if (!db) throw new Error("Chưa kết nối cơ sở dữ liệu.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const receipt = await db.prepare("SELECT removed_weeks,removed_entries,removed_shifts,removed_assignments FROM club_week_trash WHERE id=?").bind(id).first<Receipt>();
    if (receipt) return { id, start, end, alreadyDone: true, ...receipt };
    const { club, revision } = await readState("", false);
    const { backup, counts } = plan(club);
    const createdAt = new Date().toISOString();
    club.logs.unshift({ at: createdAt, actor: "Chủ quản trị", text: `Xóa ${label} tuần ${start}–${end} theo yêu cầu: ${counts.removedWeeks} tuần họp, ${counts.removedEntries} đăng ký họp, ${counts.removedShifts} ca trực, ${counts.removedAssignments} phân công. Có bản khôi phục riêng.` });
    const payload = JSON.stringify(club);
    const result = await db.batch([
      db.prepare("INSERT OR IGNORE INTO club_week_trash(id,week_start,week_end,created_at,source_revision,removed_weeks,removed_entries,removed_shifts,removed_assignments,payload) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM club_state WHERE id='main' AND revision=?)")
        .bind(id, start, end, createdAt, revision, counts.removedWeeks, counts.removedEntries, counts.removedShifts, counts.removedAssignments, JSON.stringify({ ...backup, counts }), revision),
      db.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=? AND EXISTS(SELECT 1 FROM club_week_trash WHERE id=? AND source_revision=?)")
        .bind(payload, revision, id, revision),
    ]);
    if (result[1].meta.changes) return { id, start, end, alreadyDone: false, removed_weeks: counts.removedWeeks, removed_entries: counts.removedEntries, removed_shifts: counts.removedShifts, removed_assignments: counts.removedAssignments };
  }
  throw new Error("Dữ liệu đang được cập nhật; chưa xóa tuần. Vui lòng thử lại.");
}
