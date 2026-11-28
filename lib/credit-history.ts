import type { GamesState } from "./games";

export type CreditHistoryKind = "coinflip" | "wheel" | "xo" | "refund" | "adjustment" | "inactivity" | "exchange" | "cupid";
export type CreditMovement = { kind: CreditHistoryKind; changeCents: number; label: string };
export type PendingCreditEntry = CreditMovement & { memberId: string; at: number; balanceCents: number | null };
export type CreditHistoryEntry = Omit<PendingCreditEntry, "memberId"> & { sequence: number };

const pending = new WeakMap<GamesState, PendingCreditEntry[]>();
const prepared = new WeakSet<D1Database>();

export function recordCreditEntry(games: GamesState, entry: PendingCreditEntry) {
  if (!entry.changeCents) return;
  const entries = pending.get(games) ?? [];
  entries.push(entry);
  pending.set(games, entries);
}

export function pendingCreditEntries(games?: GamesState) {
  return games && pending.get(games);
}

export function clearPendingCreditEntries(games?: GamesState) {
  if (games) pending.delete(games);
}

export async function ensureCreditHistory(db: D1Database) {
  if (prepared.has(db)) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS credit_history (
      sequence INTEGER PRIMARY KEY, member_id TEXT NOT NULL, changed_at INTEGER NOT NULL,
      kind TEXT NOT NULL, label TEXT NOT NULL, change_cents INTEGER NOT NULL, balance_cents INTEGER,
      write_revision INTEGER NOT NULL, write_offset INTEGER NOT NULL, UNIQUE(write_revision,write_offset)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS credit_history_member_sequence ON credit_history(member_id, sequence DESC)"),
  ]);
  prepared.add(db);
}

export async function creditHistoryWrite(db: D1Database, games: GamesState | undefined, revision: number, payload: string) {
  const entries = pendingCreditEntries(games);
  if (!entries?.length) return;
  await ensureCreditHistory(db);
  return db.prepare(`INSERT OR IGNORE INTO credit_history
    (member_id,changed_at,kind,label,change_cents,balance_cents,write_revision,write_offset)
    SELECT value ->> '$.memberId', value ->> '$.at', value ->> '$.kind',
      value ->> '$.label', value ->> '$.changeCents', value ->> '$.balanceCents', ?, key
    FROM json_each(?)
    WHERE EXISTS(SELECT 1 FROM club_state WHERE id='main' AND revision=? AND payload=?)`)
    .bind(revision, JSON.stringify(entries), revision, payload);
}

export async function creditHistoryPage(db: D1Database, memberId: string, revision: number, before?: number) {
  await ensureCreditHistory(db);
  const sql = `SELECT sequence, changed_at AS at, kind, label, change_cents AS changeCents, balance_cents AS balanceCents
    FROM credit_history WHERE member_id=? AND write_revision<=?`;
  const batchSize = 40;
  const tail = " ORDER BY sequence DESC LIMIT ?";
  const query = before === undefined ? db.prepare(sql + tail).bind(memberId, revision, batchSize + 1)
    : db.prepare(sql + " AND sequence<?" + tail).bind(memberId, revision, before, batchSize + 1);
  const { results } = await query.all<CreditHistoryEntry>();
  const entries = results.slice(0, batchSize);
  return { entries, before: results.length > batchSize ? entries.at(-1)?.sequence : undefined };
}
