import { env } from "cloudflare:workers";
import { createClub, syncWeeks, type Club } from "./club";
import { pruneBulletinState } from "./bulletin";
import { bulletinMediaIds, removedBulletinKeys } from "./bulletin-media";
import { queuePhotoDeletions } from "./photo-deletion";
import { initializeCreditHistory, settleWeeklyCreditInactivity } from "./games";
import { settleRoundEventNotices } from "./round-event-notifications";
import { clearPendingCreditEntries, creditHistoryWrite } from "./credit-history";

function updateTimedRules(club: Club) {
  const now = Date.now();
  const initializedHistory = initializeCreditHistory(club, now);
  const changedCredits = settleWeeklyCreditInactivity(club, now);
  const changedRounds = settleRoundEventNotices(club, now);
  return initializedHistory || changedCredits || changedRounds;
}

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
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db.prepare("SELECT payload,revision FROM club_state WHERE id='main'").first<Row>();
    if (!row) {
      if (!canInitialize) throw new ClubNotReadyError();
      await db.prepare("INSERT OR IGNORE INTO club_state (id,payload,revision) VALUES ('main',?,0)")
        .bind(JSON.stringify(createClub(ownerId))).run();
      continue;
    }
    const club = JSON.parse(row.payload) as Club;
    if (!updateTimedRules(club)) return { club, revision: row.revision };
    if (await writeState(club, row.revision)) return { club, revision: row.revision + 1 };
  }
  throw new Error("Dữ liệu Đội vừa thay đổi, vui lòng thử lại.");
}
export async function writeState(club: Club, revision: number, removedObjects: string[] = []) {
  const db = env.DB!;
  const payload = JSON.stringify(club);
  const update = db.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=?")
    .bind(payload, revision);
  const statements = [update];
  const history = await creditHistoryWrite(db, club.games, revision + 1, payload);
  if (history) statements.push(history);
  if (removedObjects.length) statements.push(queuePhotoDeletions(db, removedObjects, revision + 1, payload));
  const r = statements.length > 1 ? (await db.batch(statements))[0] : await update.run();
  if (r.meta.changes) clearPendingCreditEntries(club.games);
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
  const settled = updateTimedRules(club);
  if (syncWeeks(club) || expired || settled) return writeState(club, row.revision, removedBulletinKeys(mediaBefore, club));
  return false;
}
