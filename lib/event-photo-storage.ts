import { today, type Club } from "./club";
import { detachExpiredEventPhotos, eventPhotoId } from "./event-evidence";

const prefix = "event-evidence/";
export const eventPhotoStagingMs = 5 * 60 * 1000;
export const eventPhotoKey = (id: string) => `${prefix}${id}.jpg`;

export async function removeEventPhoto(bucket: R2Bucket, id: string) {
  try {
    await bucket.delete(eventPhotoKey(id));
  } catch (error) {
    // The retention job also catches replaced photos whose immediate delete failed.
    console.error("event-evidence:delete", error);
  }
}

async function detachCurrentExpiredPhotos(db: D1Database, now: number) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db.prepare("SELECT payload,revision FROM club_state WHERE id='main'")
      .first<{ payload: string; revision: number }>();
    if (!row) return { retained: new Set<string>(), detached: new Set<string>() };
    const club = JSON.parse(row.payload) as Club;
    const photos = detachExpiredEventPhotos(club, now);
    if (!photos.detached.size) return photos;
    const result = await db.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=?")
      .bind(JSON.stringify(club), row.revision).run();
    if (result.meta.changes) return photos;
  }
  throw new Error("Could not update event photo retention.");
}

export async function purgeExpiredEventPhotos(bucket: R2Bucket, db: D1Database, now = Date.now()) {
  // Establish retention from the current event dates. Never restore a detached photo,
  // and leave recent uploads time to attach their unique key to a registration.
  const { retained, detached } = await detachCurrentExpiredPhotos(db, now);
  const expiredKeys = [...detached].filter(id => eventPhotoId.test(id) && !retained.has(id)).map(eventPhotoKey);
  for (let offset = 0; offset < expiredKeys.length; offset += 500) {
    await bucket.delete(expiredKeys.slice(offset, offset + 500));
  }
  let cursor: string | undefined;
  for (let page = 0; page < 25; page++) {
    const list = await bucket.list({ prefix, limit: 500, cursor });
    const staleKeys = list.objects.filter(object =>
      object.key.endsWith(".jpg") && eventPhotoId.test(object.key.slice(prefix.length, -4)) &&
      !retained.has(object.key.slice(prefix.length, -4)) && object.uploaded.getTime() <= now - eventPhotoStagingMs
    ).map(object => object.key);
    if (staleKeys.length) await bucket.delete(staleKeys);
    if (!list.truncated) return true;
    cursor = list.cursor;
  }
  return false;
}

export async function maintainEventPhotos(bucket: R2Bucket, db: D1Database, now: number) {
  const day = today(new Date(now));
  const marker = "maintenance/event-evidence";
  if ((await bucket.head(marker))?.customMetadata?.day === day) return true;
  if (!await purgeExpiredEventPhotos(bucket, db, now)) return false;
  return !!await bucket.put(marker, "", { customMetadata: { day } });
}
