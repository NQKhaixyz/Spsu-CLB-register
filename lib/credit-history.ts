import type { GamesState } from "./games";

export type CreditHistoryKind = "coinflip" | "wheel" | "xo" | "refund" | "adjustment" | "inactivity" | "exchange" | "cupid" | "loan" | "loanRepayment";
export type CreditMovement = { kind: CreditHistoryKind; changeCents: number; label: string };
export type PendingCreditEntry = CreditMovement & { memberId: string; at: number; balanceCents: number | null };
export type CreditHistoryEntry = Omit<PendingCreditEntry, "memberId"> & { sequence: number };
export type CreditDebtKind = "opening" | "loan" | "repayment" | "automatic" | "cupidSplit";
type CreditDebtSnapshot = { at: number; kind: CreditDebtKind; debtCents: string; repaidCents: number };
export type CreditDebtEntry = CreditDebtSnapshot & { sequence: number };
export type CreditDebtHistoryView = {
  debtCents: string;
  personalDebtCents: string;
  sharedDebtCents: string;
  entries: CreditDebtEntry[];
  before?: number;
};

const pending = new WeakMap<GamesState, PendingCreditEntry[]>();
const pendingDebt = new WeakMap<GamesState, (CreditDebtSnapshot & { memberId: string })[]>();
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

export function recordCreditDebt(games: GamesState, memberId: string, snapshot: CreditDebtSnapshot) {
  const entries = pendingDebt.get(games) ?? [];
  entries.push({ memberId, ...snapshot });
  pendingDebt.set(games, entries);
}

export function clearPendingCreditEntries(games?: GamesState) {
  if (games) {
    pending.delete(games);
    pendingDebt.delete(games);
  }
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
    db.prepare(`CREATE TABLE IF NOT EXISTS credit_debt_history (
      sequence INTEGER PRIMARY KEY, member_id TEXT NOT NULL, changed_at INTEGER NOT NULL,
      kind TEXT NOT NULL, debt_cents TEXT NOT NULL, repaid_cents INTEGER NOT NULL,
      write_revision INTEGER NOT NULL, write_offset INTEGER NOT NULL, UNIQUE(write_revision,write_offset)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS credit_debt_member_sequence ON credit_debt_history(member_id, sequence DESC)"),
  ]);
  prepared.add(db);
}

export async function creditHistoryWrites(db: D1Database, games: GamesState | undefined, revision: number, payload: string) {
  const entries = pendingCreditEntries(games);
  const debts = games && pendingDebt.get(games);
  if (!entries?.length && !debts?.length) return [];
  await ensureCreditHistory(db);
  const writes: D1PreparedStatement[] = [];
  const gate = "EXISTS(SELECT 1 FROM club_state WHERE id='main' AND revision=? AND payload=?)";
  if (entries?.length) writes.push(db.prepare(`INSERT OR IGNORE INTO credit_history
    (member_id,changed_at,kind,label,change_cents,balance_cents,write_revision,write_offset)
    SELECT value ->> '$.memberId', value ->> '$.at', value ->> '$.kind',
      value ->> '$.label', value ->> '$.changeCents', value ->> '$.balanceCents', ?, key
    FROM json_each(?)
    WHERE ${gate}`).bind(revision, JSON.stringify(entries), revision, payload));
  if (debts?.length) writes.push(db.prepare(`INSERT OR IGNORE INTO credit_debt_history
    (member_id,changed_at,kind,debt_cents,repaid_cents,write_revision,write_offset)
    SELECT value ->> '$.memberId', value ->> '$.at', value ->> '$.kind',
      value ->> '$.debtCents', value ->> '$.repaidCents', ?, key
    FROM json_each(?)
    WHERE ${gate}`).bind(revision, JSON.stringify(debts), revision, payload));
  return writes;
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

export async function creditDebtHistoryPage(db: D1Database, memberId: string, revision: number, since: number, before?: number) {
  await ensureCreditHistory(db);
  const batchSize = 40;
  const sql = `SELECT sequence, changed_at AS at, kind, debt_cents AS debtCents, repaid_cents AS repaidCents
    FROM credit_debt_history WHERE member_id=? AND write_revision<=? AND changed_at>=?`;
  const tail = " ORDER BY sequence DESC LIMIT ?";
  const query = before === undefined ? db.prepare(sql + tail).bind(memberId, revision, since, batchSize + 1)
    : db.prepare(sql + " AND sequence<?" + tail).bind(memberId, revision, since, before, batchSize + 1);
  const { results } = await query.all<CreditDebtEntry>();
  const entries = results.slice(0, batchSize);
  return { entries, before: results.length > batchSize ? entries.at(-1)?.sequence : undefined };
}
