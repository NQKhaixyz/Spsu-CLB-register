import { env } from "cloudflare:workers";
import { eraseEventFromHistory } from "./activity";
import { captureWorkspaceNotifications } from "./activity-notifications";
import type { Identity } from "./actions";
import { syncWeeks } from "./club";
import { eventPhotoId } from "./event-evidence";
import { eventPhotoKey } from "./event-photo-storage";
import { AuthError } from "./password";
import { deleteQueuedPhotos, queuePhotoDeletions } from "./photo-deletion";
import { readState } from "./store";

export async function deleteEvent(identity: Identity, data: Record<string, unknown>) {
  const { DB: db, BUCKET: bucket } = env;
  if (!db) throw new AuthError("Chưa kết nối được cơ sở dữ liệu.", 503);
  const id = data.id;
  if (typeof id !== "string" || !id || data.confirm !== id) {
    throw new AuthError("Hãy xác nhận xóa đúng sự kiện.");
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const { club, revision } = await readState(identity.userId, false);
    const admin = club.members.find(member => member.userId === identity.userId);
    if (!admin?.active || admin.role !== "admin") throw new AuthError("Chỉ BĐH được xóa sự kiện.", 403);
    const event = club.events?.find(item => item.id === id);
    if (!event) return { club, revision, photosDeleted: true };

    const notify = captureWorkspaceNotifications(club, admin, "deleteEvent", data);
    const photoIds = eraseEventFromHistory(club, id);
    club.logs.unshift({
      at: new Date().toISOString(),
      actor: admin.name,
      actorId: admin.id,
      text: `Xóa vĩnh viễn sự kiện ${event.name}`,
    });
    club.logs = club.logs.slice(0, 2000);
    syncWeeks(club);
    notify?.();
    const payload = JSON.stringify(club);
    const updated = revision + 1;
    const statements = [
      db.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=?").bind(payload, revision),
    ];
    const archives = await db.prepare("SELECT id,payload FROM club_week_trash").all<{ id: string; payload: string }>();
    for (const archived of archives.results) {
      const archive = JSON.parse(archived.payload);
      photoIds.push(...eraseEventFromHistory(archive, id));
      const clean = JSON.stringify(archive);
      if (clean === archived.payload) continue;
      statements.push(db.prepare(`UPDATE club_week_trash SET payload=? WHERE id=?
        AND EXISTS (SELECT 1 FROM club_state WHERE id='main' AND revision=? AND payload=?)`)
        .bind(clean, archived.id, updated, payload));
    }
    const keys = [...new Set(photoIds.filter(photo => eventPhotoId.test(photo)).map(eventPhotoKey))];
    if (keys.length) statements.push(queuePhotoDeletions(db, keys, updated, payload));
    if (!(await db.batch(statements))[0].meta.changes) continue;

    let photosDeleted = !keys.length;
    if (keys.length && bucket) {
      try {
        photosDeleted = await deleteQueuedPhotos(bucket, db);
      } catch (error) {
        console.error("delete-event:photos", error);
      }
    }
    return { club, revision: updated, photosDeleted };
  }
  throw new AuthError("Dữ liệu vừa thay đổi. Vui lòng thử lại.", 409);
}
