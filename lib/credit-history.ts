import type { GamesState } from "./games";

export type CreditHistoryKind = "coinflip" | "wheel" | "xo" | "blackjack" | "refund" | "adjustment" | "inactivity" | "exchange" | "cupid" | "loan" | "loanRepayment";
type ItemMovementKind = "shieldFee" | "hammerFee" | "hammerIncome" | "hammerLoss" | "hammerRepayment";
export type CreditMovement = { kind: CreditHistoryKind | ItemMovementKind; changeCents: number; label: string };
export type PendingCreditEntry = CreditMovement & { memberId: string; at: number; balanceCents: number | null };
export type CreditHistoryEntry = Omit<PendingCreditEntry, "memberId" | "kind"> & {
  kind: CreditHistoryKind; sequence: number; dayOnly?: true;
};
export type CreditDebtKind = "opening" | "loan" | "repayment" | "automatic" | "cupidSplit";
export type StoredCreditDebtKind = CreditDebtKind | "hammerAutomatic";
type CreditDebtSnapshot = { at: number; kind: StoredCreditDebtKind; debtCents: string; repaidCents: number };
export type CreditDebtEntry = Omit<CreditDebtSnapshot, "kind"> & { kind: CreditDebtKind; sequence: number; dayOnly?: true };
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
const vietnamOffsetMs = 7 * 60 * 60 * 1_000;
const dayMs = 86_400_000;

function vietnamDayStart(at: number) {
  return Math.floor((at + vietnamOffsetMs) / dayMs) * dayMs - vietnamOffsetMs;
}

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
  const batchSize = 40;
  const { results } = await db.prepare(`WITH visible AS (
    SELECT ROW_NUMBER() OVER (ORDER BY entry.sequence) AS sequence, changed_at AS at,
      kind, label, change_cents AS changeCents, balance_cents AS balanceCents
    FROM credit_history AS entry WHERE member_id=? AND write_revision<=? AND kind NOT IN ('hammerFee','shieldFee')
    ) SELECT * FROM visible WHERE (? IS NULL OR sequence<?) ORDER BY sequence DESC LIMIT ?`)
    .bind(memberId, revision, before ?? null, before ?? null, batchSize + 1)
    .all<Omit<CreditHistoryEntry, "kind"> & { kind: CreditHistoryKind | "hammerIncome" | "hammerLoss" | "hammerRepayment" }>();
  const entries = results.slice(0, batchSize).map((entry): CreditHistoryEntry => {
    switch (entry.kind) {
      case "loan":
      case "hammerIncome":
        return { ...entry, kind: "loan", label: "Vay ngân hàng", at: vietnamDayStart(entry.at), dayOnly: true };
      case "hammerLoss":
        return { ...entry, kind: "adjustment", label: "Điều chỉnh credits", at: vietnamDayStart(entry.at), dayOnly: true };
      case "hammerRepayment":
        return { ...entry, kind: "loanRepayment", label: "Tự trả nợ credits", at: vietnamDayStart(entry.at), dayOnly: true };
      default:
        return { ...entry, kind: entry.kind };
    }
  });
  return { entries, before: results.length > batchSize ? entries.at(-1)?.sequence : undefined };
}

export async function creditDebtHistoryPage(db: D1Database, memberId: string, revision: number, since: number, before?: number) {
  await ensureCreditHistory(db);
  const batchSize = 40;
  const { results } = await db.prepare(`WITH visible AS (
    SELECT ROW_NUMBER() OVER (ORDER BY entry.sequence) AS sequence, changed_at AS at, kind,
      debt_cents AS debtCents, repaid_cents AS repaidCents
    FROM credit_debt_history AS entry WHERE member_id=? AND write_revision<=? AND changed_at>=?
    ) SELECT * FROM visible WHERE (? IS NULL OR sequence<?) ORDER BY sequence DESC LIMIT ?`)
    .bind(memberId, revision, since, before ?? null, before ?? null, batchSize + 1)
    .all<Omit<CreditDebtEntry, "kind"> & { kind: StoredCreditDebtKind }>();
  const entries = results.slice(0, batchSize).map((entry): CreditDebtEntry => {
    if (entry.kind === "hammerAutomatic" || entry.kind === "loan") {
      const kind = entry.kind === "hammerAutomatic" ? "automatic" : "loan";
      return { ...entry, kind, at: vietnamDayStart(entry.at), dayOnly: true };
    }
    return { ...entry, kind: entry.kind };
  });
  return { entries, before: results.length > batchSize ? entries.at(-1)?.sequence : undefined };
}
