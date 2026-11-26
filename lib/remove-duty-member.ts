import { env } from "cloudflare:workers";
import type { Identity } from "./actions";
import { syncWeeks } from "./club";
import { queueDutyPhotoDeletions } from "./duty-photo-storage";
import { AuthError } from "./password";
import { deleteQueuedPhotos } from "./photo-deletion";
import { readState } from "./store";

export async function removeDutyMember(identity: Identity, data: Record<string, unknown>) {
  const { DB: db, BUCKET: bucket } = env;
  if (!db) throw new AuthError("Chưa kết nối được cơ sở dữ liệu.", 503);
  const { month, shiftId, memberId } = data;
  if (typeof month !== "string" || typeof shiftId !== "string" || !shiftId ||
      typeof memberId !== "string" || !memberId || data.confirm !== memberId) {
    throw new AuthError("Hãy xác nhận đúng người cần gỡ khỏi ca.");
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const { club, revision } = await readState(identity.userId, false);
    const admin = club.members.find(member => member.userId === identity.userId);
    if (!admin?.active || admin.role !== "admin") throw new AuthError("Chỉ BĐH được gỡ người khỏi ca trực.", 403);
    const shift = club.schedules.find(schedule => schedule.month === month)?.shifts.find(item => item.id === shiftId);
    if (!shift) throw new AuthError("Không tìm thấy ca trực.", 404);
    if (!shift.assignments.some(assignment => assignment.memberId === memberId)) {
      return { club, revision, photoDeleted: true };
    }
    shift.assignments = shift.assignments.filter(assignment => assignment.memberId !== memberId);
    if (shift.cancellationSnapshot) {
      shift.cancellationSnapshot = shift.cancellationSnapshot.filter(assignment => assignment.memberId !== memberId);
    }
    const name = club.members.find(member => member.id === memberId)?.name ?? "Thành viên";
    club.logs.unshift({
      at: new Date().toISOString(),
      actor: admin.name,
      actorId: admin.id,
      text: `Gỡ ${name} khỏi ca ${shift.id}`,
    });
    club.logs = club.logs.slice(0, 2000);
    syncWeeks(club);

    const payload = JSON.stringify(club);
    const updated = revision + 1;
    const [changed, , removedEvidence] = await db.batch([
      db.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=?").bind(payload, revision),
      queueDutyPhotoDeletions(db, { memberId, shiftId }, updated, payload),
      db.prepare(`DELETE FROM duty_evidence WHERE shift_id=? AND member_id=?
        AND EXISTS (SELECT 1 FROM club_state WHERE id='main' AND revision=? AND payload=?)`)
        .bind(shiftId, memberId, updated, payload),
    ]);
    if (!changed.meta.changes) continue;
    let photoDeleted = !removedEvidence.meta.changes;
    if (!photoDeleted && bucket) {
      try {
        photoDeleted = await deleteQueuedPhotos(bucket, db);
      } catch (error) {
        console.error("remove-duty-member:photo", error);
      }
    }
    return { club, revision: updated, photoDeleted };
  }
  throw new AuthError("Dữ liệu vừa thay đổi. Vui lòng thử lại.", 409);
}
