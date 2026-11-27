import { env } from "cloudflare:workers";
import { createClub, syncWeeks, type Club } from "./club";
import { pruneBulletinState } from "./bulletin";
import { bulletinMediaIds, removedBulletinKeys } from "./bulletin-media";
import { queuePhotoDeletions } from "./photo-deletion";

type Row = { payload: string; revision: number };
export class ClubNotReadyError extends Error {
  constructor() {
    super(
      "BĐH chưa thiết lập không gian Đội. Vui lòng quay lại sau khi chủ quản trị hoàn tất hồ sơ.",
    );
  }
}
export async function readState(ownerId: string, canInitialize: boolean) {
  const db = env.DB;
  if (!db) throw new Error("Cơ sở dữ liệu chưa được kết nối.");
  const existing = await db
    .prepare("SELECT payload,revision FROM club_state WHERE id='main'")
    .first<Row>();
  if (existing)
    return {
      club: JSON.parse(existing.payload) as Club,
      revision: existing.revision,
    };
  if (!canInitialize) throw new ClubNotReadyError();
  await db
    .prepare(
      "INSERT OR IGNORE INTO club_state (id,payload,revision) VALUES ('main',?,0)",
    )
    .bind(JSON.stringify(createClub(ownerId)))
    .run();
  const row = await db
    .prepare("SELECT payload,revision FROM club_state WHERE id='main'")
    .first<Row>();
  if (!row) throw new Error("Không đọc được dữ liệu Đội.");
  return { club: JSON.parse(row.payload) as Club, revision: row.revision };
}
export async function writeState(club: Club, revision: number, removedObjects: string[] = []) {
  const db = env.DB!;
  const payload = JSON.stringify(club);
  const update = db.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=?")
    .bind(payload, revision);
  const r = removedObjects.length
    ? (await db.batch([update, queuePhotoDeletions(db, removedObjects, revision + 1, payload)]))[0]
    : await update.run();
  return r.meta.changes > 0;
}
export async function mutate<T>(
  ownerId: string,
  operation: (club: Club) => T,
  canInitialize = false,
) {
  for (let i = 0; i < 5; i++) {
    const { club, revision } = await readState(ownerId, canInitialize);
    const mediaBefore = bulletinMediaIds(club);
    syncWeeks(club);
    pruneBulletinState(club);
    const result = operation(club);
    const removedObjects = removedBulletinKeys(mediaBefore, club);
    if (await writeState(club, revision, removedObjects))
      return { club, revision: revision + 1, result, removedObjects };
  }
  throw new Error("Có người đang cập nhật cùng lúc. Vui lòng thử lại.");
}
export async function synchronize() {
  const row = await env.DB?.prepare(
    "SELECT payload,revision FROM club_state WHERE id='main'",
  ).first<Row>();
  if (!row) return false;
  const club = JSON.parse(row.payload) as Club;
  const mediaBefore = bulletinMediaIds(club);
  const expired = pruneBulletinState(club);
  if (syncWeeks(club) || expired) return writeState(club, row.revision, removedBulletinKeys(mediaBefore, club));
  return false;
}
