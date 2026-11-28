import assert from "node:assert/strict";
import test from "node:test";
import { createClub, scoreFor, today, weekId, type Member } from "../lib/club";
import { recoverPersonalDebt } from "../lib/credit-debt-history";
import {
  CREDITS_TO_POINTS, CREDIT_EXCHANGE_RATE, CREDIT_EXCHANGE_START_AT, POINTS_TO_CREDITS,
  creditExchangeView, exchangeMonthlyCredits, parseCreditExchange,
} from "../lib/credit-exchange";
import { pendingCreditEntries } from "../lib/credit-history";
import {
  adjustGameCredits, applyCoinFlip, applyCreditLoanCommand, applyGameCommand, CREDIT_LOAN_LIMIT_CENTS, creditLoanView,
  creditLoanInterestCents, creditWalletBalance, formatCredits, gamesView, parseCreditLoanCommand,
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
    interestCents: kind === "borrow" && Number.isSafeInteger(amountCents) && amountCents > 0 ? creditLoanInterestCents(amountCents) : undefined,
  });
  const submit = (member: Member, kind: "borrow" | "repay", amountCents: number) =>
    applyCreditLoanCommand(club, member.id, loan(member, kind, amountCents), at);
  const decision = (kind: "approve" | "decline" | "cancel", requestId: string, interestCents?: number) =>
    parseCreditLoanCommand({ operationId: crypto.randomUUID(), kind, requestId, interestCents });
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
  const first = loan(a, "borrow", 1_300_050);
  assert.throws(() => applyCreditLoanCommand(club, a.id, { ...first, interestCents: undefined }, at), /Điều kiện vay vừa đổi/);
  applyCreditLoanCommand(club, a.id, first, at);
  applyCreditLoanCommand(club, a.id, first, at + 1);
  assert.throws(() => applyCreditLoanCommand(club, b.id, first, at), /đã được sử dụng/);
  assert.throws(() => applyCreditLoanCommand(club, a.id, { ...first, operationId: crypto.randomUUID() }, at), /Ví vừa thay đổi/);
  submit(a, "borrow", 610_000);
  assert.equal(view(a).balanceCents, "2910050");
  assert.equal(view(a).debtCents, "2292060");
  assert.equal(view(b).debtCents, "0");
  assert.equal(creditExchangeView(club, a, date).loan.exchangeBlocked, true);
  const command = exchange();
  assert.throws(() => exchangeMonthlyCredits(club, a, command, at), /Trả hết dư nợ/);
  assert.equal(scoreFor(club, a.id, month).points, 0);
  assert.throws(() => submit(a, "repay", 5_000_000), /lớn hơn dư nợ/);
  submit(a, "repay", 1_010_000);
  assert.equal(view(a).debtCents, "1282060");
  assert.throws(() => exchangeMonthlyCredits(club, a, command, at), /Trả hết dư nợ/);
  const repayment = loan(a, "repay", 1_282_060);
  applyCreditLoanCommand(club, a.id, repayment, at);
  applyCreditLoanCommand(club, a.id, repayment, at + 1);
  assert.equal(view(a).debtCents, "0");
  assert.equal(creditWalletBalance(club, a.id), 617_990);
  exchangeMonthlyCredits(club, a, command, at + 2);
  assert.equal(creditWalletBalance(club, a.id), 117_990);
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
  assert.equal(view(a).debtCents, "114500");
  const won = crypto.randomUUID();
  applyGameCommand(club, a.id, { kind: "create", id: won, stake: 20, walletVersion: view(a).walletVersion }, at);
  applyGameCommand(club, b.id, { kind: "join", id: won, stake: 20, walletVersion: view(b).walletVersion }, at);
  applyGameCommand(club, b.id, { kind: "surrender", id: won }, at);
  assert.equal(club.games?.rooms.find(room => room.id === won)?.winnerLoanRepaymentCents, 950);
  assert.equal(view(a).debtCents, "113550");
  adjustGameCredits(club, { operationId: crypto.randomUUID(), memberId: a.id, mode: "add",
    amountCents: 5000, walletVersion: view(a).walletVersion }, admin.id, at);
  assert.equal(view(a).debtCents, "111050");
  adjustGameCredits(club, { operationId: crypto.randomUUID(), memberId: a.id, mode: "set",
    amountCents: 1_200_000, walletVersion: view(a).walletVersion }, admin.id, at);
  assert.equal(view(a).debtCents, "111050");
  assert.equal(view(a).balanceCents, "1200000");
  club.manualActivities = [{ id: crypto.randomUUID(), memberId: a.id, week: weekId(date), date,
    kind: "special", quantity: 1, points: .25, note: "", updatedAt: "", updatedBy: admin.id }];
  const receipt = exchangeMonthlyCredits(club, a, parseCreditExchange({
    month, direction: POINTS_TO_CREDITS, rate: CREDIT_EXCHANGE_RATE, units: 5, operationId: crypto.randomUUID(),
  }), at);
  assert.equal(receipt.balanceChangeCents, 338_950);
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
  const { id, interestCents } = view(a).request!;
  assert.equal(interestCents, 180_001);
  assert.deepEqual(view(b).request, view(a).request);
  assert.equal(view(admin).request, undefined);
  const approve = decision("approve", id, interestCents);
  assert.throws(() => applyCreditLoanCommand(club, a.id, approve, at), /không thể xử lý/);
  assert.throws(() => applyCreditLoanCommand(club, admin.id, approve, at), /đã được xử lý/);
  applyCreditLoanCommand(club, b.id, approve, at);
  applyCreditLoanCommand(club, b.id, approve, at + 1);
  assert.equal(view(a).sharedDebtCents, "1080004");
  assert.equal(view(b).balanceCents, "2900003");
  assert.equal(view(a).request, undefined);
  for (const member of [a, b]) {
    assert.equal(creditExchangeView(club, member, date).loan.exchangeBlocked, true);
    assert.throws(() => exchangeMonthlyCredits(club, member, exchange(), at), /Trả hết dư nợ/);
  }
  submit(b, "repay", 100_000);
  assert.equal(view(a).debtCents, "980004");
  assert.equal(view(b).debtCents, "980004");

  submit(a, "borrow", 100_000);
  const cancelled = decision("approve", view(a).request!.id, view(a).request!.interestCents);
  applySharingAction(club, a, "leaveSharingGroup", { groupId, confirm: groupId }, at + 2);
  assert.equal(view(a).debtCents, "490002");
  assert.equal(view(b).debtCents, "490002");
  assert.equal(creditWalletBalance(club, a.id) + creditWalletBalance(club, b.id), 2_800_003);
  assert.throws(() => applyCreditLoanCommand(club, b.id, cancelled, at + 3), /ví Cupid đã thay đổi/);
  assert.throws(() => exchangeMonthlyCredits(club, b, exchange(), at + 3), /Trả hết dư nợ/);
});

test("Joining Cupid keeps individual debt with the borrower and applies the exchange lock to the pooled wallet", () => {
  const { club, a, b, date, submit, view, joinCupid } = fixture();
  submit(a, "borrow", 700_000);
  joinCupid();
  assert.equal(view(a).personalDebtCents, "840000");
  assert.equal(view(b).personalDebtCents, "0");
  assert.equal(view(b).sharedDebtCents, "0");
  assert.equal(creditExchangeView(club, b, date).loan.exchangeBlocked, true);
  submit(a, "repay", 840_000);
  assert.equal(creditExchangeView(club, b, date).loan.exchangeBlocked, false);
});

test("Personal loan top-ups enforce a one-million-credit cap on outstanding debt", () => {
  const { club, a, at, loan, submit, view } = fixture();
  const limit = CREDIT_LOAN_LIMIT_CENTS;
  assert.equal(limit, 100_000_000);
  const first = loan(a, "borrow", 83_333_332);
  applyCreditLoanCommand(club, a.id, first, at);
  submit(a, "borrow", 2);
  const full = view(a);
  assert.equal(full.debtCents, String(limit));
  assert.throws(() => submit(a, "borrow", 1), /1\.000\.000 credits/);
  applyCreditLoanCommand(club, a.id, first, at + 1);
  assert.deepEqual(view(a), full);

  submit(a, "repay", 12345);
  assert.throws(() => submit(a, "borrow", 10288), /hạn mức dư nợ/);
  submit(a, "borrow", 10287);
  submit(a, "borrow", 1);
  assert.equal(view(a).debtCents, String(limit));

  club.games!.wallets[a.id].loanDebtCents = String(limit + 1);
  assert.throws(() => submit(a, "borrow", 1), /hạn mức dư nợ/);
  submit(a, "repay", 2);
  submit(a, "borrow", 1);
  assert.equal(view(a).debtCents, String(limit));
});

test("Cupid applies one loan cap including both personal debts, and checks it again at consent", () => {
  const { club, a, b, at, submit, decision, view, joinCupid } = fixture();
  submit(a, "borrow", 30_000_000);
  submit(b, "borrow", 20_000_000);
  joinCupid();
  const room = CREDIT_LOAN_LIMIT_CENTS - 60_000_000;
  const principal = 33_333_333;
  assert.throws(() => submit(a, "borrow", principal + 1), /hạn mức dư nợ/);
  submit(a, "borrow", principal);

  const pending = view(a).request!;
  const approval = decision("approve", pending.id, pending.interestCents);
  assert.throws(() => applyCreditLoanCommand(club, b.id, decision("approve", pending.id), at), /xem tiền lãi/);
  const period = club.sharing!.groups[0].periods.at(-1)!;
  period.loanRequest = { ...pending, amountCents: principal + 1 };
  assert.throws(() => applyCreditLoanCommand(club, b.id, approval, at), /hạn mức dư nợ/);
  assert.equal(view(b).sharedDebtCents, "0");

  period.loanRequest = pending;
  applyCreditLoanCommand(club, b.id, approval, at);
  assert.equal(view(b).sharedDebtCents, String(room));
  assert.throws(() => submit(b, "borrow", 1), /hạn mức dư nợ/);
  applyCreditLoanCommand(club, b.id, approval, at + 1);
  assert.equal(view(a).sharedDebtCents, String(room));
});

test("Profile debt history recovers exact solo repayments and stored interest from the old credit ledger", () => {
  const movements = [
    { at: 1, kind: "loan", label: "Vay credits", changeCents: 1_000 },
    { at: 2, kind: "loan", label: "Vay credits · Lãi 4.000,05 credits", changeCents: 2_000_025 },
    { at: 3, kind: "loanRepayment", label: "Trả nợ credits", changeCents: -2_400_000 },
    { at: 4, kind: "loanRepayment", label: "Tự trả nợ credits", changeCents: -1_030 },
  ] as const;
  assert.deepEqual(recoverPersonalDebt(movements, "0"), [
    { at: 1, kind: "loan", debtCents: "1000", repaidCents: 0 },
    { at: 2, kind: "loan", debtCents: "2401030", repaidCents: 0 },
    { at: 3, kind: "repayment", debtCents: "1030", repaidCents: 2_400_000 },
    { at: 4, kind: "automatic", debtCents: "0", repaidCents: 1_030 },
  ]);
  assert.equal(recoverPersonalDebt(movements, "1"), undefined);
  assert.equal(recoverPersonalDebt([movements[3]], "0"), undefined);
});
