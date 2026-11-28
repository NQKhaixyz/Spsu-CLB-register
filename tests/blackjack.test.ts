import assert from "node:assert/strict";
import test from "node:test";
import { blackjackValue, type BlackjackCard, type BlackjackCommand, type BlackjackMove } from "../lib/blackjack";
import { createClub, type Member } from "../lib/club";
import { pendingCreditEntries } from "../lib/credit-history";
import { adjustGameCredits, applyBlackjackCommand, applyCreditLoanCommand, creditLoanStatus, drawBlackjackDeck,
  dropMemberFromGames, gamesView, parseGameCommand } from "../lib/games";
import { applySharingAction } from "../lib/sharing";
import { sharingConsentVersion } from "../lib/sharing-types";

const startAt = 1_800_000_000_000;
const suits = ["spades", "hearts", "clubs", "diamonds"] as const;
function cards(...ranks: BlackjackCard["rank"][]) {
  const counts: Partial<Record<BlackjackCard["rank"], number>> = {};
  return ranks.map(rank => {
    const index = counts[rank] ?? 0;
    counts[rank] = index + 1;
    return { rank, suit: suits[index] };
  });
}

function fixture() {
  const club = createClub("local-blackjack-owner");
  const [one, other] = ["one", "other"].map((id): Member => ({
    id, name: id, userId: "account-" + id, studentId: "BJ-" + id, role: "member",
    active: true, joined: "2020-01-01", availability: [], extraDuties: false,
  }));
  club.members = [one, other];
  let at = startAt;
  const run = (member: Member, command: BlackjackCommand, deck?: BlackjackCard[]) =>
    applyBlackjackCommand(club, member.id, command, at++, deck);
  const view = (member = one) => gamesView(club, member.id, 1);
  const start = (stake: number, ranks: BlackjackCard["rank"][], member = one) => {
    const command = { kind: "blackjackStart", id: crypto.randomUUID(), stake, walletVersion: view(member).wallet.version } as const;
    run(member, command, cards(...ranks));
    return command;
  };
  const move = (choice: BlackjackMove, member = one) => {
    const active = view(member).blackjack.active;
    assert.ok(active);
    const command = { kind: "blackjackMove", id: active.id, turn: active.turn, move: choice, walletVersion: view(member).wallet.version } as const;
    run(member, command);
    return command;
  };
  return { club, one, other, run, view, start, move };
}

test("Blackjack deals a distinct 52-card deck and adjusts multiple aces without changing face-card values", () => {
  const deck = drawBlackjackDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(card => card.suit + card.rank)).size, 52);
  assert.deepEqual(blackjackValue(cards("A", "A", "9")), { total: 21, soft: true });
  assert.deepEqual(blackjackValue(cards("A", "A", "9", "2")), { total: 13, soft: false });
  assert.deepEqual(blackjackValue(cards("A", "K", "6")), { total: 17, soft: false });
});

test("Natural blackjack pays exactly 3:2, two naturals push, and the dealer checks for blackjack before player actions", () => {
  const { club, one, run, view, start } = fixture();
  const command = start(101, ["A", "9", "K", "8"]);
  assert.equal(view().blackjack.active, undefined);
  const first = view().blackjack.recent[0];
  assert.equal(first.hands[0].outcome, "blackjack");
  assert.equal(first.payoutCents, 25_250);
  assert.equal(first.netCents, 15_150);
  assert.equal(view().wallet.balanceCents, 1_015_150);
  const entries = pendingCreditEntries(club.games)?.length;
  run(one, command, cards("4", "5", "6", "7"));
  assert.equal(pendingCreditEntries(club.games)?.length, entries);
  assert.throws(() => run(one, { ...command, stake: 102 }), /đã dùng mức cược khác/);
  start(101, ["A", "A", "J", "K"]);
  assert.equal(view().blackjack.recent[0].hands[0].outcome, "push");
  assert.equal(view().wallet.balanceCents, 1_015_150);
  start(101, ["9", "A", "7", "Q"]);
  assert.equal(view().blackjack.recent[0].hands[0].outcome, "loss");
  assert.equal(view().wallet.balanceCents, 1_005_050);
});

test("A saved Blackjack round resumes with only the dealer upcard public and rejects conflicting or foreign moves", () => {
  const { club, one, other, run, view, start, move } = fixture();
  const opened = start(100, ["2", "9", "4", "7", "5", "2"]);
  const active = view().blackjack.active!;
  assert.equal(active.dealerUpCard.rank, "9");
  assert.deepEqual(Object.keys(active).sort(), ["id", "turn", "dealerUpCard", "hands", "handIndex", "canDouble", "canSplit"].sort());
  assert.equal(view(other).blackjack.active, undefined);
  assert.equal(view().wallet.balanceCents, 990_000);
  assert.throws(() => start(1, ["2", "3", "4", "5"]), /hoàn tất ván/);
  assert.throws(() => run(other, { kind: "blackjackMove", id: opened.id, turn: 0, move: "stand", walletVersion: 0 }), /đổi lượt/);

  club.games = JSON.parse(JSON.stringify(club.games));
  const hit = move("hit");
  assert.equal(view().blackjack.active?.hands[0].cards.length, 3);
  run(one, hit);
  assert.equal(view().blackjack.active?.hands[0].cards.length, 3);
  assert.throws(() => run(one, { ...hit, move: "stand" }), /đổi lượt/);
  assert.equal(view().blackjack.active?.canDouble, false);
  assert.throws(() => move("double"), /chưa thể/);
  const stand = move("stand");
  const result = view().blackjack.recent[0];
  assert.equal(result.hands[0].outcome, "loss");
  assert.equal(blackjackValue(result.dealer).total, 18);
  assert.equal(view().wallet.balanceCents, 990_000);
  run(one, stand);
  assert.equal(view().blackjack.recent.length, 1);
});

test("Double takes one card, dealer stands on soft 17, and double and split require a fresh wallet and available credits", () => {
  const { club, one, run, view, start, move } = fixture();
  const opened = start(100, ["5", "A", "6", "6", "K"]);
  assert.throws(() => run(one, { kind: "blackjackMove", id: opened.id, turn: 0, move: "double", walletVersion: 0 }), /Số dư đã thay đổi/);
  move("double");
  const result = view().blackjack.recent[0];
  assert.equal(result.hands[0].stake, 200);
  assert.equal(result.hands[0].cards.length, 3);
  assert.equal(result.hands[0].outcome, "win");
  assert.equal(result.dealer.length, 2);
  assert.deepEqual(blackjackValue(result.dealer), { total: 17, soft: true });
  assert.equal(view().wallet.balanceCents, 1_020_000);
  start(view().blackjack.maxStake, ["8", "10", "8", "7"]);
  assert.equal(view().blackjack.active?.canDouble, false);
  assert.equal(view().blackjack.active?.canSplit, false);
  assert.throws(() => move("double"), /không đủ credits/);
  assert.throws(() => move("split"), /không đủ credits/);
  assert.equal(view().wallet.balanceCents, 0);
  assert.deepEqual(pendingCreditEntries(club.games)?.map(entry => [entry.label, entry.changeCents]), [
    ["Blackjack · Đặt cược", -10_000], ["Blackjack · Gấp đôi", -10_000],
    ["Blackjack · Trả thưởng", 40_000], ["Blackjack · Đặt cược", -1_020_000],
  ]);
});

test("Split hands act in order and settle their own stakes, including one-card split aces and mixed results", () => {
  const { view, start, move } = fixture();
  start(200, ["8", "10", "8", "8", "A", "7", "7"]);
  assert.equal(view().blackjack.active?.canSplit, true);
  move("split");
  assert.equal(view().blackjack.active?.handIndex, 0);
  assert.equal(view().blackjack.active?.canSplit, false);
  assert.equal(view().wallet.balanceCents, 960_000);
  move("stand");
  assert.equal(view().blackjack.active?.handIndex, 1);
  move("hit");
  const mixed = view().blackjack.recent[0];
  assert.deepEqual(mixed.hands.map(hand => [hand.outcome, hand.payoutCents]), [["win", 40_000], ["bust", 0]]);
  assert.equal(mixed.netCents, 0);
  assert.equal(view().wallet.balanceCents, 1_000_000);

  start(200, ["A", "10", "A", "7", "Q", "8"]);
  move("split");
  const aces = view().blackjack.recent[0];
  assert.deepEqual(aces.hands.map(hand => [hand.cards.length, hand.outcome, hand.payoutCents]), [[2, "win", 40_000], [2, "win", 40_000]]);
  assert.equal(view().wallet.balanceCents, 1_040_000);
});

test("Blackjack keeps payout headroom, applies automatic debt repayment only to profit and records the real wallet delta", () => {
  const { club, one, other, view, start, move } = fixture();
  applyCreditLoanCommand(club, one.id, { kind: "borrow", operationId: crypto.randomUUID(),
    amountCents: 100_000, interestCents: 20_000, walletVersion: 0 }, startAt);
  start(100, ["A", "9", "K", "8"]);
  const natural = view().blackjack.recent[0];
  assert.equal(natural.loanRepaymentCents, 7_500);
  assert.equal(natural.walletChangeCents, 7_500);
  assert.equal(creditLoanStatus(club, one.id).debtCents, "112500");
  start(100, ["10", "10", "8", "8"]);
  move("stand");
  assert.equal(view().blackjack.recent[0].loanRepaymentCents, undefined);
  assert.equal(creditLoanStatus(club, one.id).debtCents, "112500");

  club.games!.wallets[other.id] = { balanceCents: Number.MAX_SAFE_INTEGER - 15_000, version: 0, spins: [] };
  assert.equal(view(other).blackjack.maxStake, 100);
  start(100, ["10", "9", "10", "8"], other);
  assert.equal(view(other).blackjack.active?.canDouble, false);
  const grant = { memberId: other.id, mode: "add", operationId: crypto.randomUUID(), walletVersion: view(other).wallet.version } as const;
  assert.throws(() => adjustGameCredits(club, { ...grant, amountCents: 5_001 }, "operator", startAt + 1), /vượt giới hạn/);
  adjustGameCredits(club, { ...grant, amountCents: 5_000 }, "operator", startAt + 2);
  move("stand", other);
  assert.equal(view(other).wallet.balanceCents, Number.MAX_SAFE_INTEGER);
  assert.equal(view(other).blackjack.recent[0].walletChangeCents, 10_000);
});

test("Cupid settles personal games before merging wallets and shared games before splitting wallets", () => {
  const { club, one, other, view, start } = fixture();
  club.creditSharingSince = startAt - 1;
  const consent = { acceptedGuide: true, consentVersion: sharingConsentVersion };
  start(100, ["10", "9", "10", "8"]);
  applySharingAction(club, one, "inviteCupid", { ...consent, memberId: other.id, cupidTag: "BanChoi" }, startAt + 2);
  const invite = club.sharing!.invites[0];
  applySharingAction(club, other, "answerSharingInvite", { ...consent, id: invite.id, accept: true }, startAt + 3);
  assert.equal(view().blackjack.active, undefined);
  assert.equal(view().blackjack.recent[0].autoStood, true);
  assert.equal(view().blackjack.recent[0].walletChangeCents, 10_000);
  assert.equal(view(other).blackjack.recent.length, 0);
  assert.equal(view().wallet.balanceCents, 1_005_000);
  assert.equal(view(other).wallet.balanceCents, 1_005_000);

  start(100, ["10", "9", "10", "8"]);
  assert.equal(view().wallet.balanceCents, 1_000_000);
  assert.equal(view(other).wallet.balanceCents, 1_000_000);
  const groupId = club.sharing!.groups[0].id;
  applySharingAction(club, other, "leaveSharingGroup", { groupId, confirm: groupId }, startAt + 4);
  assert.equal(view().wallet.balanceCents, 1_010_000);
  assert.equal(view(other).wallet.balanceCents, 1_010_000);
  assert.equal(view().blackjack.recent[0].walletChangeCents, 5_000);
  assert.equal(view().blackjack.active, undefined);
  assert.ok(pendingCreditEntries(club.games)?.some(entry => entry.memberId === other.id && entry.label === "Cupid · Blackjack · Trả thưởng"));
});

test("Blackjack rejects malformed inputs and paused accounts and cleans up open games with the player wallet", () => {
  const { club, one, view, start } = fixture();
  const bet = start(100, ["10", "9", "10", "8"]);
  assert.deepEqual(parseGameCommand({ ...bet, deck: [] }), bet);
  assert.throws(() => parseGameCommand({ ...bet, stake: 10.5 }), /số nguyên/);
  assert.throws(() => parseGameCommand({ kind: "blackjackMove", id: bet.id, turn: 0, move: "win", walletVersion: 1 }), /không hợp lệ/);
  dropMemberFromGames(club, one.id, false, startAt + 1);
  assert.equal(view().blackjack.recent[0].autoStood, true);
  one.active = false;
  assert.throws(() => start(100, ["8", "5", "6", "7"]), /tạm nghỉ/);
  dropMemberFromGames(club, one.id, true);
  assert.equal(club.games!.wallets[one.id], undefined);
});
