import assert from "node:assert/strict";
import test from "node:test";
import { createClub, scoreFor, today, weekId, type Member } from "../lib/club";
import {
  CREDITS_TO_POINTS, CREDIT_EXCHANGE_RATE, CREDIT_EXCHANGE_START_AT, POINTS_TO_CREDITS,
  creditExchangeView, exchangeMonthlyCredits, parseCreditExchange,
} from "../lib/credit-exchange";
import { pendingCreditEntries } from "../lib/credit-history";
import {
  adjustGameCredits, applyCoinFlip, applyCreditLoanCommand, applyGameCommand, creditLoanView,
  creditWalletBalance, formatCredits, gamesView, parseCreditLoanCommand,
} from "../lib/games";
import { activateCreditSharing, applySharingAction } from "../lib/sharing";
import { sharingConsentVersion } from "../lib/sharing-types";

function fixture() {
  const [admin, a, b] = ["admin", "a", "b"].map((id, index): Member => ({
    id, name: id, userId: "loan-account-" + id, studentId: "LOAN-" + id, role: index ? "member" : "admin",
    joined: "2020-01-01", active: true, availability: [], extraDuties: false,
  }));
  const club = createClub(admin.userId!);
  club.members = [admin, a, b];
  const at = CREDIT_EXCHANGE_START_AT + 1000;
  const date = today(new Date(at));
  const month = date.slice(0, 7);
  const loan = (member: Member, kind: "borrow" | "repay", amountCents: number) => parseCreditLoanCommand({
    operationId: crypto.randomUUID(), kind, amountCents, walletVersion: gamesView(club, member.id, 0).wallet.version,
  });
  const submit = (member: Member, kind: "borrow" | "repay", amountCents: number) =>
    applyCreditLoanCommand(club, member.id, loan(member, kind, amountCents), at);
  const decision = (kind: "approve" | "decline" | "cancel", requestId: string) =>
    parseCreditLoanCommand({ operationId: crypto.randomUUID(), kind, requestId });
  const exchange = () => parseCreditExchange({
    month, direction: CREDITS_TO_POINTS, rate: CREDIT_EXCHANGE_RATE, operationId: crypto.randomUUID(),
  });
  const view = (member: Member) => creditLoanView(club, member.id, 0);
  const joinCupid = () => {
    activateCreditSharing(club, at);
    const consent = { consentVersion: sharingConsentVersion, acceptedGuide: true };
    applySharingAction(club, a, "inviteCupid", { ...consent, memberId: b.id, cupidTag: "ViChung" }, at);
    const id = club.sharing!.invites[0].id;
    applySharingAction(club, b, "answerSharingInvite", { ...consent, id, accept: true }, at);
    return id;
  };
  return { club, admin, a, b, at, date, month, loan, submit, decision, exchange, view, joinCupid };
}

test("Personal loans accept top-ups, retry once, and block the points purchase until all debt is repaid", () => {
  const { club, a, b, at, date, month, loan, submit, exchange, view } = fixture();
  const first = loan(a, "borrow", 4_300_050);
  applyCreditLoanCommand(club, a.id, first, at);
  applyCreditLoanCommand(club, a.id, first, at + 1);
  assert.throws(() => applyCreditLoanCommand(club, b.id, first, at), /đã được sử dụng/);
  assert.throws(() => applyCreditLoanCommand(club, a.id, { ...first, operationId: crypto.randomUUID() }, at), /Ví vừa thay đổi/);
  submit(a, "borrow", 610_000);
  assert.equal(view(a).balanceCents, "5910050");
  assert.equal(view(a).debtCents, "4910050");
  assert.equal(view(b).debtCents, "0");
  assert.equal(creditExchangeView(club, a, date).loan.exchangeBlocked, true);
  const command = exchange();
  assert.throws(() => exchangeMonthlyCredits(club, a, command, at), /Trả hết dư nợ/);
  assert.equal(scoreFor(club, a.id, month).points, 0);
  assert.throws(() => submit(a, "repay", 5_000_000), /lớn hơn dư nợ/);
  submit(a, "repay", 1_010_000);
  assert.equal(view(a).debtCents, "3900050");
  assert.throws(() => exchangeMonthlyCredits(club, a, command, at), /Trả hết dư nợ/);
  const repayment = loan(a, "repay", 3_900_050);
  applyCreditLoanCommand(club, a.id, repayment, at);
  applyCreditLoanCommand(club, a.id, repayment, at + 1);
  assert.equal(view(a).debtCents, "0");
  assert.equal(creditWalletBalance(club, a.id), 1_000_000);
  exchangeMonthlyCredits(club, a, command, at + 2);
  assert.equal(creditWalletBalance(club, a.id), 500_000);
  assert.equal(scoreFor(club, a.id, month).activityPoints.special, 0.225);
  assert.deepEqual(pendingCreditEntries(club.games)?.map(entry => entry.kind),
    ["loan", "loan", "loanRepayment", "loanRepayment", "exchange"]);
  assert.throws(() => loan(a, "borrow", 0), /lớn hơn 0/);
  assert.throws(() => loan(a, "borrow", -2000), /lớn hơn 0/);
  assert.throws(() => loan(a, "borrow", Number.MAX_SAFE_INTEGER + 1), /lớn hơn 0/);
  assert.throws(() => submit(a, "borrow", Number.MAX_SAFE_INTEGER), /vượt giới hạn tính toán/);
  a.active = false;
  assert.throws(() => submit(a, "borrow", 100), /đang hoạt động/);
});

test("Credit receipts and game profits repay half the net gain, up to the remaining principal", () => {
  const { club, a, b, admin, at, date, month, submit, view } = fixture();
  submit(a, "borrow", 100_000);
  const flip = applyCoinFlip(club, a.id, {
    kind: "flip", id: crypto.randomUUID(), stake: 100, pick: "one", walletVersion: view(a).walletVersion,
  }, "one", at);
  assert.equal(flip.netCents, 9_000);
  assert.equal(flip.loanRepaymentCents, 4_500);
  assert.equal(flip.walletChangeCents, 4_500);
  const wheel = applyGameCommand(club, a.id, {
    kind: "spin", id: crypto.randomUUID(), stake: 10, walletVersion: view(a).walletVersion,
  }, at, 3);
  assert.equal(wheel?.loanRepaymentCents, 1_000);
  const refunded = crypto.randomUUID();
  applyGameCommand(club, a.id, { kind: "create", id: refunded, stake: 10, walletVersion: view(a).walletVersion }, at);
  applyGameCommand(club, a.id, { kind: "cancel", id: refunded }, at);
  assert.equal(view(a).debtCents, "94500");
  const won = crypto.randomUUID();
  applyGameCommand(club, a.id, { kind: "create", id: won, stake: 20, walletVersion: view(a).walletVersion }, at);
  applyGameCommand(club, b.id, { kind: "join", id: won, stake: 20, walletVersion: view(b).walletVersion }, at);
  applyGameCommand(club, b.id, { kind: "surrender", id: won }, at);
  assert.equal(club.games?.rooms.find(room => room.id === won)?.winnerLoanRepaymentCents, 950);
  assert.equal(view(a).debtCents, "93550");
  adjustGameCredits(club, { operationId: crypto.randomUUID(), memberId: a.id, mode: "add",
    amountCents: 5000, walletVersion: view(a).walletVersion }, admin.id, at);
  assert.equal(view(a).debtCents, "91050");
  adjustGameCredits(club, { operationId: crypto.randomUUID(), memberId: a.id, mode: "set",
    amountCents: 1_200_000, walletVersion: view(a).walletVersion }, admin.id, at);
  assert.equal(view(a).debtCents, "91050");
  assert.equal(view(a).balanceCents, "1200000");
  club.manualActivities = [{ id: crypto.randomUUID(), memberId: a.id, week: weekId(date), date,
    kind: "special", quantity: 1, points: .25, note: "", updatedAt: "", updatedBy: admin.id }];
  const receipt = exchangeMonthlyCredits(club, a, parseCreditExchange({
    month, direction: POINTS_TO_CREDITS, rate: CREDIT_EXCHANGE_RATE, units: 5, operationId: crypto.randomUUID(),
  }), at);
  assert.equal(receipt.balanceChangeCents, 358_950);
  assert.equal(view(a).debtCents, "0");
  assert.equal(scoreFor(club, a.id, month).points, 0);
  assert.equal(formatCredits(BigInt("90071992547409931")), "900.719.925.474.099,31");
});

test("Cupid loans require the partner's consent, block both point purchases, and split all unpaid cents", () => {
  const { club, admin, a, b, at, date, submit, decision, exchange, view, joinCupid } = fixture();
  const groupId = joinCupid();
  submit(a, "borrow", 900_003);
  assert.equal(view(a).balanceCents, "2000000");
  assert.equal(view(a).debtCents, "0");
  const { id } = view(a).request!;
  assert.deepEqual(view(b).request, view(a).request);
  assert.equal(view(admin).request, undefined);
  const approve = decision("approve", id);
  assert.throws(() => applyCreditLoanCommand(club, a.id, approve, at), /không thể xử lý/);
  assert.throws(() => applyCreditLoanCommand(club, admin.id, approve, at), /đã được xử lý/);
  applyCreditLoanCommand(club, b.id, approve, at);
  applyCreditLoanCommand(club, b.id, approve, at + 1);
  assert.equal(view(a).sharedDebtCents, "900003");
  assert.equal(view(b).balanceCents, "2900003");
  assert.equal(view(a).request, undefined);
  for (const member of [a, b]) {
    assert.equal(creditExchangeView(club, member, date).loan.exchangeBlocked, true);
    assert.throws(() => exchangeMonthlyCredits(club, member, exchange(), at), /Trả hết dư nợ/);
  }
  submit(b, "repay", 100_000);
  assert.equal(view(a).debtCents, "800003");
  assert.equal(view(b).debtCents, "800003");

  submit(a, "borrow", 100_000);
  const cancelled = decision("approve", view(a).request!.id);
  applySharingAction(club, a, "leaveSharingGroup", { groupId, confirm: groupId }, at + 2);
  assert.equal(view(a).debtCents, "400002");
  assert.equal(view(b).debtCents, "400001");
  assert.equal(creditWalletBalance(club, a.id) + creditWalletBalance(club, b.id), 2_800_003);
  assert.throws(() => applyCreditLoanCommand(club, b.id, cancelled, at + 3), /ví Cupid đã thay đổi/);
  assert.throws(() => exchangeMonthlyCredits(club, b, exchange(), at + 3), /Trả hết dư nợ/);
});

test("Joining Cupid keeps individual debt with the borrower and applies the exchange lock to the pooled wallet", () => {
  const { club, a, b, date, submit, view, joinCupid } = fixture();
  submit(a, "borrow", 700_000);
  joinCupid();
  assert.equal(view(a).personalDebtCents, "700000");
  assert.equal(view(b).personalDebtCents, "0");
  assert.equal(view(b).sharedDebtCents, "0");
  assert.equal(creditExchangeView(club, b, date).loan.exchangeBlocked, true);
  submit(a, "repay", 700_000);
  assert.equal(creditExchangeView(club, b, date).loan.exchangeBlocked, false);
});
