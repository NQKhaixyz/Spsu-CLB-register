import type { Club } from "./club";
import type { CreditItemReceipt, CreditItemResult } from "./games";

export type NewCreditItemReceipt = {
  operationId: string;
  memberId: string;
  targetMemberId?: string;
  commandHash: string;
  result: CreditItemResult;
};

type ReceiptRow = { id: string; targetId: string | null; result: string };
type SavedReceiptRow = ReceiptRow & { ownerId: string; commandHash: string; revision: number };
export type CreditItemHistoryPage = { entries: CreditItemReceipt[]; before?: number };

const prepared = new WeakSet<D1Database>();
const commitGate = "EXISTS(SELECT 1 FROM club_state WHERE id='main' AND revision=? AND payload=?)";

export async function ensureCreditItemReceipts(db: D1Database) {
  if (prepared.has(db)) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS credit_item_receipts (
      sequence INTEGER PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, member_id TEXT NOT NULL,
      target_member_id TEXT, command_hash TEXT NOT NULL, applied_at INTEGER NOT NULL,
      result_json TEXT NOT NULL, write_revision INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS credit_item_owner ON credit_item_receipts(member_id, sequence DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS credit_item_target ON credit_item_receipts(target_member_id)"),
  ]);
  prepared.add(db);
}

export function writeCreditItemReceipt(db: D1Database, receipt: NewCreditItemReceipt, revision: number, payload: string) {
  return db.prepare(`INSERT OR IGNORE INTO credit_item_receipts
    (operation_id,member_id,target_member_id,command_hash,applied_at,result_json,write_revision)
    SELECT ?,?,?,?,?,?,? WHERE ${commitGate}`)
    .bind(receipt.operationId, receipt.memberId, receipt.targetMemberId ?? null, receipt.commandHash,
      receipt.result.at, JSON.stringify(receipt.result), revision, revision, payload);
}

export function eraseCreditItemReceipts(db: D1Database, memberId: string, revision: number, payload: string) {
  return [
    db.prepare(`DELETE FROM credit_item_receipts WHERE member_id=? AND ${commitGate}`).bind(memberId, revision, payload),
    db.prepare(`UPDATE credit_item_receipts SET target_member_id=NULL WHERE target_member_id=? AND ${commitGate}`)
      .bind(memberId, revision, payload),
  ];
}

export function readCreditItemReceipt(db: D1Database, operationId: string) {
  return db.prepare(`SELECT operation_id AS id, member_id AS ownerId, target_member_id AS targetId,
    command_hash AS commandHash, result_json AS result, write_revision AS revision
    FROM credit_item_receipts WHERE operation_id=?`).bind(operationId).first<SavedReceiptRow>();
}

export function creditItemReceiptView(club: Club, id: string, result: CreditItemResult, targetId?: string | null): CreditItemReceipt {
  const targetName = targetId ? club.members.find(member => member.id === targetId)?.name : undefined;
  return { ...result, id, targetName };
}

export function savedCreditItemView(club: Club, row: ReceiptRow) {
  return creditItemReceiptView(club, row.id, JSON.parse(row.result) as CreditItemResult, row.targetId);
}

export async function creditItemHistoryPage(db: D1Database, club: Club, memberId: string, revision: number, before?: number):
  Promise<CreditItemHistoryPage> {
  const size = 20;
  const { results } = await db.prepare(`WITH own AS (
    SELECT ROW_NUMBER() OVER (ORDER BY sequence) AS position, operation_id AS id, target_member_id AS targetId,
      result_json AS result FROM credit_item_receipts WHERE member_id=? AND write_revision<=? AND applied_at>=?
    ) SELECT * FROM own WHERE (? IS NULL OR position<?) ORDER BY position DESC LIMIT ?`)
    .bind(memberId, revision, club.games?.creditHistorySince ?? 0, before ?? null, before ?? null, size + 1)
    .all<ReceiptRow & { position: number }>();
  const rows = results.slice(0, size);
  return { entries: rows.map(row => savedCreditItemView(club, row)), before: results.length > size ? rows.at(-1)?.position : undefined };
}
