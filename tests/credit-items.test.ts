import assert from "node:assert/strict";
import test from "node:test";
import { createClub, type Member } from "../lib/club";
import { pendingCreditEntries } from "../lib/credit-history";
import { creditItemReceiptView, savedCreditItemView } from "../lib/credit-item-receipts";
import {
  adjustGameCredits, applyCreditItemCommand, applyCreditLoanCommand, creditItemsView, creditLoanInterestCents,
  creditLoanView, creditsRanking, drawHammerPercent, gamesView, HAMMER_PRICE_CENTS, parseCreditItemCommand, SHIELD_DURATION_MS,
} from "../lib/games";
import { activateCreditSharing, applySharingAction } from "../lib/sharing";
import { sharingConsentVersion } from "../lib/sharing-types";

const at = Date.UTC(2026, 10, 28, 8);

function fixture() {
  const club = createClub("items-owner");
  const [a, b, c, d] = ["a", "b", "c", "d"].map((id): Member => ({
    id, name: id.toUpperCase(), studentId: "ITEM-" + id, userId: "items-" + id, role: "member", active: true, joined: "2026-01-01",
    availability: [], extraDuties: false,
  }));
  club.members = [a, b, c, d];
  activateCreditSharing(club, at);
  const view = (member: Member, now = at) => creditItemsView(club, member.id, 0, now);
  const data = (member: Member) => ({ operationId: crypto.randomUUID(), walletVersion: view(member).walletVersion });
  const set = (member: Member, amountCents: number) =>
    adjustGameCredits(club, { ...data(member), memberId: member.id, mode: "set", amountCents }, "operator", at);
  const shield = (member: Member, now = at) => applyCreditItemCommand(club, member.id, {
    ...data(member), kind: "shield", quotedCostCents: view(member, now).shieldCostCents,
  }, now, 0);
  const hammer = (actor: Member, target: Member, percent: number, now = at) =>
    applyCreditItemCommand(club, actor.id, { ...data(actor), kind: "hammer", targetMemberId: target.id }, now, percent);
  const pair = (first: Member, second: Member, now = at) => {
    const consent = { consentVersion: sharingConsentVersion, acceptedGuide: true };
    applySharingAction(club, first, "inviteCupid", { ...consent, memberId: second.id, cupidTag: "ChungVi" }, now);
    const id = club.sharing!.invites.find(invite => invite.fromId === first.id)!.id;
    applySharingAction(club, second, "answerSharingInvite", { ...consent, id, accept: true }, now);
    return id;
  };
  return { club, a, b, c, d, view, data, set, shield, hammer, pair };
}

test("Shield rounds the price up, blocks multiple paid hammer attempts and expires at the exact boundary", () => {
  const { club, a, b, view, shield, hammer, set } = fixture();
  set(b, 1_000_001);
  const buy = shield(b);
  assert.deepEqual(buy, { kind: "shield", at, costCents: 200_001, expiresAt: at + SHIELD_DURATION_MS });
  assert.equal(view(b).balanceCents, "800000");
  assert.throws(() => shield(b, at + SHIELD_DURATION_MS - 1), /đang bảo vệ/);
  for (const strikeAt of [at, at + SHIELD_DURATION_MS - 1]) {
    assert.deepEqual(hammer(a, b, 50, strikeAt), {
      kind: "hammer", at: strikeAt, costCents: HAMMER_PRICE_CENTS, takenCents: 0, outcome: "blocked", repaidCents: 0,
    });
  }
  assert.equal(view(a).balanceCents, "700000");
  assert.equal(view(a).hammersPurchased, 2);
  assert.equal(view(b).hammersPurchased, 0);
  assert.equal(view(b).balanceCents, "800000");
  assert.equal(view(b, at + SHIELD_DURATION_MS).shieldExpiresAt, undefined);
  const hit = hammer(a, b, 50, at + SHIELD_DURATION_MS);
  assert.equal(hit.kind === "hammer" && hit.takenCents, 400_000);
  assert.equal(view(a).balanceCents, "950000");
  assert.equal(view(b).balanceCents, "400000");
  assert.equal(pendingCreditEntries(club.games)?.filter(entry => entry.kind === "shieldFee").length, 1);
  assert.equal(shield(b, at + SHIELD_DURATION_MS).costCents, 80_000);
});

test("A shielded strike and an ordinary 0% strike return the same receipt, including saved receipts", () => {
  const { club, a, b, shield, hammer } = fixture();
  const ordinary = hammer(a, b, 0);
  shield(b);
  const blocked = hammer(a, b, 50);
  const id = "hammer-receipt";
  const expected = {
    id, targetName: b.name, kind: "hammer", at, costCents: HAMMER_PRICE_CENTS,
    takenCents: 0, repaidCents: 0, outcome: "empty", percent: 0,
  };
  assert.deepEqual(creditItemReceiptView(club, id, ordinary, b.id), expected);
  assert.deepEqual(creditItemReceiptView(club, id, blocked, b.id), expected);
  assert.deepEqual(savedCreditItemView(club, { id, targetId: b.id, result: JSON.stringify(blocked) }), expected);
});

test("A hammer charges for zero, floors a half-credit result and accepts only eligible wallets with sufficient funds", () => {
  const { a, b, c, club, data, hammer, view, set } = fixture();
  set(b, 1_000_001);
  assert.throws(() => hammer(a, a, 50), /ví khác/);
  c.active = false;
  assert.throws(() => hammer(a, c, 50), /ví khác/);
  assert.throws(() => applyCreditItemCommand(club, a.id, { ...data(a), kind: "shield", quotedCostCents: 1 }, at, 0), /Giá khiên/);
  assert.equal(view(a).hammersPurchased, 0);
  const empty = hammer(a, b, 0);
  assert.equal(empty.kind === "hammer" && empty.outcome, "empty");
  assert.equal(view(a).balanceCents, "850000");
  assert.equal(view(b).balanceCents, "1000001");
  const hit = hammer(a, b, 50);
  assert.equal(hit.kind === "hammer" && hit.takenCents, 500_000);
  assert.equal(view(a).balanceCents, "1200000");
  assert.equal(view(b).balanceCents, "500001");
  assert.equal(view(a).hammersPurchased, 2);
  set(a, HAMMER_PRICE_CENTS - 1);
  assert.throws(() => hammer(a, b, 50), /1\.500 credits/);
  assert.equal(view(b).balanceCents, "500001");
  assert.deepEqual(Object.keys(creditsRanking(club, 0).rows[0]).sort(), ["balanceCents", "memberId", "name", "rank"]);
  const command = { ...data(b), kind: "hammer", targetMemberId: a.id } as const;
  assert.deepEqual(parseCreditItemCommand({ ...command, percent: 50 }), command);
  assert.throws(() => parseCreditItemCommand({ ...command, targetMemberId: "" }), /không hợp lệ/);
  for (let i = 0; i < 64; i++) {
    const percent = drawHammerPercent();
    assert.ok(Number.isInteger(percent) && percent >= 0 && percent <= 50);
  }
});

test("Cupid protects the pooled wallet and retains the later expiry through merging and the same expiry through splitting", () => {
  const { a, b, c, club, view, shield, hammer, pair } = fixture();
  shield(a);
  const newer = shield(b, at + 5_000);
  assert.equal(newer.kind, "shield");
  const id = pair(a, b, at + 6_000);
  for (const member of [a, b]) {
    const current = view(member, at + 6_000);
    assert.equal(current.balanceCents, "1600000");
    assert.equal(current.shieldExpiresAt, newer.expiresAt);
    assert.equal(current.targets.some(target => target.memberId === a.id || target.memberId === b.id), false);
  }
  assert.throws(() => hammer(a, b, 50, at + 6_000), /ví khác/);
  const blocked = hammer(c, b, 50, at + 7_000);
  assert.equal(blocked.kind === "hammer" && blocked.outcome, "blocked");
  const next = shield(a, newer.expiresAt);
  assert.equal(next.kind, "shield");
  assert.equal(next.costCents, 320_000);
  assert.equal(view(b, newer.expiresAt).balanceCents, "1280000");
  applySharingAction(club, b, "leaveSharingGroup", { groupId: id, confirm: id }, newer.expiresAt + 1);
  for (const member of [a, b]) {
    assert.equal(view(member, newer.expiresAt + 1).shieldExpiresAt, next.expiresAt);
    assert.equal(view(member).balanceCents, "640000");
  }
});

test("Hammer charges pooled funds and transfers exact cents between Cupid wallets while counting the purchase for the actor", () => {
  const { a, b, c, d, club, view, hammer, pair, set } = fixture();
  set(b, 1_000_001);
  set(d, 1_000_003);
  pair(a, b);
  pair(c, d);
  const result = hammer(a, d, 50);
  assert.equal(result.kind === "hammer" && result.takenCents, 1_000_001);
  assert.equal(view(a).balanceCents, "2850002");
  assert.equal(view(b).balanceCents, "2850002");
  assert.equal(view(c).balanceCents, "1000002");
  assert.equal(view(d).balanceCents, "1000002");
  assert.equal(view(a).hammersPurchased, 1);
  assert.equal(view(b).hammersPurchased, 0);
  assert.equal(gamesView(club, a.id, 0).wallet.balanceCents, gamesView(club, b.id, 0).wallet.balanceCents);
});

test("Hammer income applies half the net profit to real debt and creates no new principal", () => {
  const { a, b, club, data, set, hammer, view } = fixture();
  set(b, 500_000);
  applyCreditLoanCommand(club, a.id, {
    ...data(a), kind: "borrow", amountCents: 200_000, interestCents: creditLoanInterestCents(200_000),
  }, at);
  assert.equal(creditLoanView(club, a.id, 0).debtCents, "240000");
  const hit = hammer(a, b, 50);
  assert.equal(hit.kind === "hammer" && hit.repaidCents, 50_000);
  assert.equal(creditLoanView(club, a.id, 0).debtCents, "190000");
  assert.equal(creditLoanView(club, b.id, 0).debtCents, "0");
  assert.equal(view(a).balanceCents, "1250000");
  assert.equal(view(b).balanceCents, "250000");
  assert.deepEqual(pendingCreditEntries(club.games)?.slice(-4).map(({ kind }) => kind),
    ["hammerFee", "hammerLoss", "hammerIncome", "hammerRepayment"]);
  const loss = hammer(a, b, 50);
  assert.equal(loss.kind === "hammer" && loss.repaidCents, 0);
  assert.equal(creditLoanView(club, a.id, 0).debtCents, "190000");
});
