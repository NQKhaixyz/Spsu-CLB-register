import { env } from "cloudflare:workers";
import type { Identity } from "./actions";
import { avatarKey } from "./avatar";
import { bulletinMediaIds, removedBulletinKeys } from "./bulletin-media";
import { syncWeeks } from "./club";
import { queueDutyPhotoDeletions } from "./duty-photo-storage";
import { eventPhotoKey } from "./event-photo-storage";
import { canDeleteMember, eraseMemberData, scrubWeekArchive } from "./member-deletion";
import { AuthError } from "./password";
import { deleteQueuedPhotos, queuePhotoDeletions } from "./photo-deletion";
import { readState } from "./store";
import { creditHistoryWrites, ensureCreditHistory } from "./credit-history";

export async function deleteMember(identity: Identity, data: Record<string, unknown>) {
  const db = env.DB;
  if (!db || !env.BUCKET) throw new AuthError("Chưa kết nối được kho dữ liệu. Vui lòng thử lại.", 503);
  if (typeof data.memberId !== "string" || !data.memberId || data.confirm !== data.memberId) {
    throw new AuthError("Hãy xác nhận xóa đúng hồ sơ thành viên.");
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { club, revision } = await readState(identity.userId, false);
    const admin = club.members.find(member => member.userId === identity.userId);
    if (!admin?.active || admin.role !== "admin") throw new AuthError("Chỉ BĐH được xóa thành viên.", 403);
    const member = club.members.find(item => item.id === data.memberId);
    if (!member) return { club, revision, photosDeleted: true };
    if (!canDeleteMember(club, admin, member)) throw new AuthError("Bạn không có quyền xóa hồ sơ này.", 403);

    const mediaBefore = bulletinMediaIds(club);
    const eventPhotos = eraseMemberData(club, admin, member);
    syncWeeks(club);
    const payload = JSON.stringify(club);
    const updated = revision + 1;
    const archives = await db.prepare("SELECT id, payload FROM club_week_trash").all<{ id: string; payload: string }>();
    const gate = "EXISTS (SELECT 1 FROM club_state WHERE id='main' AND revision=? AND payload=?)";
    const statements = [
      db.prepare("UPDATE club_state SET payload=?, revision=revision+1 WHERE id='main' AND revision=?").bind(payload, revision),
    ];
    await ensureCreditHistory(db);
    statements.push(...await creditHistoryWrites(db, club.games, updated, payload),
      db.prepare(`DELETE FROM credit_history WHERE member_id=? AND ${gate}`).bind(member.id, updated, payload),
      db.prepare(`DELETE FROM credit_debt_history WHERE member_id=? AND ${gate}`).bind(member.id, updated, payload));
    for (const archived of archives.results) {
      const archive = JSON.parse(archived.payload);
      scrubWeekArchive(archive, member.id, eventPhotos);
      const clean = JSON.stringify(archive);
      if (clean !== archived.payload) {
        statements.push(db.prepare(`UPDATE club_week_trash SET payload=? WHERE id=? AND ${gate}`)
          .bind(clean, archived.id, updated, payload));
      }
    }
    const photos = [...eventPhotos].map(eventPhotoKey).concat(removedBulletinKeys(mediaBefore, club));
    if (member.avatarId) photos.push(avatarKey(member.avatarId));
    if (photos.length) {
      statements.push(queuePhotoDeletions(db, photos, updated, payload));
    }
    statements.push(
      queueDutyPhotoDeletions(db, { memberId: member.id }, updated, payload),
      db.prepare(`DELETE FROM duty_evidence WHERE member_id=? AND ${gate}`).bind(member.id, updated, payload),
      db.prepare(`UPDATE duty_evidence SET reviewed_by=NULL WHERE reviewed_by=? AND ${gate}`).bind(member.id, updated, payload),
    );
    if (member.userId) {
      statements.push(
        db.prepare(`DELETE FROM auth_sessions WHERE account_id IN (SELECT id FROM auth_accounts WHERE user_id=?) AND ${gate}`)
          .bind(member.userId, updated, payload),
        db.prepare(`DELETE FROM auth_accounts WHERE user_id=? AND ${gate}`).bind(member.userId, updated, payload),
      );
    }
    if (!(await db.batch(statements))[0].meta.changes) continue;
    let photosDeleted = false;
    try {
      photosDeleted = await deleteQueuedPhotos(env.BUCKET, db);
    } catch (error) {
      console.error("delete-member:photos", error);
    }
    return { club, revision: updated, photosDeleted };
  }
  throw new AuthError("Dữ liệu vừa thay đổi. Vui lòng thử lại.", 409);
}
