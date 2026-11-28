import type { Club } from "./club";
import { ensureCreditHistory, recordCreditDebt, type CreditDebtEntry } from "./credit-history";
import { creditLoanStatus } from "./games";

type LegacyMovement = { at: number; kind: "loan" | "loanRepayment"; label: string; changeCents: number };

export function recoverPersonalDebt(rows: readonly LegacyMovement[], currentDebtCents: string) {
  let debt = BigInt(0);
  const entries: Omit<CreditDebtEntry, "sequence">[] = [];
  for (const { at, kind, label, changeCents } of rows) {
    if (!Number.isSafeInteger(changeCents)) return;
    if (kind === "loan" && changeCents > 0) {
      const quoted = /^Vay credits · Lãi ((?:\d{1,3}(?:\.\d{3})+)|\d+)(?:,(\d{1,2}))? credits$/.exec(label);
      if (!quoted && label !== "Vay credits") return;
      const interest = quoted
        ? BigInt(quoted[1].replace(/\./g, "")) * BigInt(100) + BigInt((quoted[2] ?? "").padEnd(2, "0"))
        : BigInt(0);
      debt += BigInt(changeCents) + interest;
      entries.push({ at, kind: "loan", debtCents: debt.toString(), repaidCents: 0 });
    } else if (kind === "loanRepayment" && changeCents < 0) {
      if (label !== "Trả nợ credits" && label !== "Tự trả nợ credits") return;
      debt += BigInt(changeCents);
      if (debt < BigInt(0)) return;
      entries.push({ at, kind: label === "Tự trả nợ credits" ? "automatic" : "repayment",
        debtCents: debt.toString(), repaidCents: -changeCents });
    } else return;
  }
  if (debt.toString() === currentDebtCents) return entries;
}

export async function initializeCreditDebtHistory(db: D1Database, club: Club, revision: number, at: number) {
  const games = club.games;
  if (!games || games.creditDebtHistorySince !== undefined) return false;
  const since = games.creditHistorySince ?? 0;
  const sharedMembers = new Set((club.sharing?.groups ?? []).flatMap(group => group.periods
    .filter(period => period.asset === "credits" && (period.endedAt ?? at) >= since)
    .flatMap(period => period.memberIds)));
  const members = club.members.filter(member => member.userId);

  await ensureCreditHistory(db);
  const { results } = await db.prepare(`SELECT member_id AS memberId, changed_at AS at, kind, label, change_cents AS changeCents
    FROM credit_history WHERE kind IN ('loan', 'loanRepayment') AND write_revision<=? AND changed_at>=?
    ORDER BY sequence`).bind(revision, since).all<LegacyMovement & { memberId: string }>();
  const individualMovements = new Map<string, LegacyMovement[]>();
  for (const row of results) {
    if (sharedMembers.has(row.memberId)) continue;
    const movements = individualMovements.get(row.memberId) ?? [];
    movements.push(row);
    individualMovements.set(row.memberId, movements);
  }
  for (const member of members) {
    const { debtCents } = creditLoanStatus(club, member.id);
    const recovered = sharedMembers.has(member.id) ? undefined : recoverPersonalDebt(individualMovements.get(member.id) ?? [], debtCents);
    if (recovered) {
      for (const entry of recovered) recordCreditDebt(games, member.id, entry);
    } else if (debtCents !== "0") {
      recordCreditDebt(games, member.id, { at, kind: "opening", debtCents, repaidCents: 0 });
    }
  }
  games.creditDebtHistorySince = at;
  return true;
}
