import { today, weekId } from "./club";

const photoPrefix = "duty-evidence/";
const pageSize = 500;

export function dutyPhotoKey(shiftDate: string, id: string) {
  return `${photoPrefix}${weekId(shiftDate)}/${id}.jpg`;
}

export function queueDutyPhotoDeletions(
  db: D1Database,
  target: { memberId: string; shiftId?: string },
  revision: number,
  payload: string,
) {
  const scope = target.shiftId === undefined ? "" : " AND shift_id=?";
  const bindings = target.shiftId === undefined ? [target.memberId] : [target.memberId, target.shiftId];
  // The folder is the Monday of the shift, exactly one week before expiry.
  return db.prepare(`INSERT OR IGNORE INTO pending_photo_deletion(key)
    SELECT 'duty-evidence/' || strftime('%Y-%m-%d', expires_at/1000-604800, 'unixepoch', '+7 hours') || '/' || id || '.jpg'
    FROM duty_evidence WHERE member_id=?${scope}
    AND EXISTS (SELECT 1 FROM club_state WHERE id='main' AND revision=? AND payload=?)`)
    .bind(...bindings, revision, payload);
}

export async function purgeExpiredDutyPhotos(bucket: R2Bucket, db: D1Database, now = new Date()) {
  const boundary = `${photoPrefix}${weekId(today(now))}/`;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const list = await bucket.list({ prefix: photoPrefix, limit: pageSize, cursor });
    const { objects } = list;
    const expired = objects.filter(({ key }) => key < boundary && /^duty-evidence\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/.test(key));
    if (expired.length) await bucket.delete(expired.map(({ key }) => key));
    if (!list.truncated) {
      await db.prepare("DELETE FROM duty_evidence WHERE expires_at<=? AND status='pending'").bind(now.getTime()).run();
      return true;
    }
    cursor = list.cursor;
  }
  return false;
}
