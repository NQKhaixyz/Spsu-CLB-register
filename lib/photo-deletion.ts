export async function deleteQueuedPhotos(bucket: R2Bucket, db: D1Database) {
  for (let batch = 0; batch < 10; batch++) {
    const queued = await db.prepare("SELECT key FROM pending_photo_deletion LIMIT 250").all<{ key: string }>();
    const keys = queued.results.map(row => row.key);
    if (!keys.length) return true;
    await bucket.delete(keys);
    await db.prepare("DELETE FROM pending_photo_deletion WHERE key IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(keys)).run();
  }
  return false;
}
// Put these keys on the queue only if the accompanying club state update wins.
export function queuePhotoDeletions(db: D1Database, keys: string[], revision: number, payload: string) {
  return db.prepare(`INSERT OR IGNORE INTO pending_photo_deletion(key)
    SELECT value FROM json_each(?)
    WHERE EXISTS (SELECT 1 FROM club_state WHERE id='main' AND revision=? AND payload=?)`)
    .bind(JSON.stringify(keys), revision, payload);
}
