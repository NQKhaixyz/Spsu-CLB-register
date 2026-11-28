import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { createClub, scoreFor, today, weekId, weeklyScoreFor, type Member } from "../lib/club";
import { creditExchangeView, exchangeMonthlyCredits, parseCreditExchange } from "../lib/credit-exchange";
import { pendingCreditEntries } from "../lib/credit-history";
import { makeReport } from "../lib/excel";
import { adjustGameCredits, applyCoinFlip, creditWalletBalance, gamesView } from "../lib/games";
import { semesterScores } from "../lib/semester-scores";
import { activateCreditSharing, applySharingAction } from "../lib/sharing";
import { activeSharingPeriod, sharingConsentVersion } from "../lib/sharing-types";

function fixture() {
  const [admin, a, b] = ["admin", "a", "b"].map((id, index): Member => ({
    id, name: id, userId: "account-" + id, studentId: "EXCHANGE-" + id, role: index ? "member" : "admin",
    joined: "2020-01-01", active: true, availability: [], extraDuties: false,
  }));
  const club = createClub(admin.userId!);
  club.members = [admin, a, b];
  const date = today();
  const week = weekId(date);
  const month = date.slice(0, 7);
  const at = Date.now();
  const addPoint = (kind: "special" | "committee", points: number, memberId = a.id) => {
    (club.manualActivities ??= []).push({ id: crypto.randomUUID(), kind, memberId, week, date, time: "00:00",
      quantity: 1, points, note: "", updatedAt: "", updatedBy: admin.id });
  };
  return { admin, a, b, club, date, week, month, at, addPoint };
}

test("Existing Cupid score allocations are frozen and Bang hội closes during the credits migration", () => {
  const { club, a, b, at, month, addPoint } = fixture();
  addPoint("special", 4);
  club.sharing = { groups: [
    { id: "old-cupid", kind: "cupid", name: "Cupid", hashtag: "CuCai",
      periods: [{ id: "old-period", memberIds: [a.id, b.id], startedAt: at - 172_800_000 }] },
    { id: "retired", kind: "guild", name: "Bang cũ", leaderId: a.id, code: "QA",
      periods: [{ id: "old-guild-period", memberIds: [a.id], startedAt: at - 172_800_000 }] },
  ], invites: [], locked: [], notices: [] };
  assert.equal(activateCreditSharing(club, at), true);
  assert.equal(activateCreditSharing(club, at + 1), false);
  assert.equal(activeSharingPeriod(club.sharing.groups[0])?.asset, "credits");
  assert.equal(activeSharingPeriod(club.sharing.groups[1]), undefined);
  assert.equal(club.sharing.groups[0].hashtag, "CuCai");
  assert.equal(scoreFor(club, a.id, month).points, 2);
  assert.equal(scoreFor(club, b.id, month).points, 2);
  addPoint("committee", 1.25);
  assert.equal(scoreFor(club, a.id, month).points, 3.25);
  assert.equal(scoreFor(club, b.id, month).points, 2);
  assert.throws(() => applySharingAction(club, a, "createGuild", {}, at + 2), /đã ngừng/);
});

test("Cupid consent shares all credits, keeps both views equal and conserves the odd cent on separation", () => {
  const { club, a, b, at } = fixture();
  activateCreditSharing(club, at);
  const consent = { consentVersion: sharingConsentVersion, acceptedGuide: true };
  adjustGameCredits(club, { memberId: a.id, operationId: crypto.randomUUID(), mode: "set", amountCents: 700_001, walletVersion: 0 }, "issuer", at);
  assert.throws(() => applySharingAction(club, a, "inviteCupid", { memberId: b.id, cupidTag: "CungChoi" }, at), /Đọc hướng dẫn/);
  applySharingAction(club, a, "inviteCupid", { ...consent, memberId: b.id, cupidTag: "CungChoi" }, at);
  const id = club.sharing!.invites[0].id;
  applySharingAction(club, b, "answerSharingInvite", { ...consent, id, accept: true }, at + 1);
  assert.equal(creditWalletBalance(club, a.id), 850_000);
  assert.equal(creditWalletBalance(club, b.id), 850_000);
  const aWallet = gamesView(club, a.id, 0).wallet;
  const bWallet = gamesView(club, b.id, 0).wallet;
  const flip = applyCoinFlip(club, a.id, { kind: "flip", id: crypto.randomUUID(), pick: "one", stake: 1, walletVersion: aWallet.version }, "one", at + 2);
  assert.equal(flip.walletChangeCents, 45);
  assert.throws(() => applyCoinFlip(club, b.id, { kind: "flip", id: crypto.randomUUID(), pick: "one", stake: 1, walletVersion: bWallet.version }, "one", at + 3), /đã thay đổi/);
  assert.equal(creditWalletBalance(club, a.id), 850_045);
  assert.equal(creditWalletBalance(club, b.id), 850_045);
  assert.deepEqual(pendingCreditEntries(club.games)?.filter(row => row.kind === "coinflip").map(row => row.changeCents), [45, 45]);
  applySharingAction(club, b, "leaveSharingGroup", { groupId: id, confirm: id }, at + 4);
  assert.equal(creditWalletBalance(club, a.id), 850_046);
  assert.equal(creditWalletBalance(club, b.id), 850_045);
  assert.equal(gamesView(club, a.id, 0).cupidPartnerId, undefined);
});

test("A monthly exchange debits once and reconciles the monthly, semester and Excel official totals", async () => {
  const { club, admin, a, b, week, month, at, addPoint } = fixture();
  addPoint("special", 0.11);
  const command = parseCreditExchange({ month, units: 2, operationId: crypto.randomUUID() });
  assert.equal(creditExchangeView(club, a).months.find(row => row.month === month)?.units, 2);
  assert.throws(() => exchangeMonthlyCredits(club, admin, command, at), /thành viên/);
  const receipt = exchangeMonthlyCredits(club, a, command, at);
  assert.equal(receipt.earnedCents, 400_000);
  assert.equal(creditWalletBalance(club, a.id), 1_400_000);
  assert.deepEqual(exchangeMonthlyCredits(club, a, command, at + 1), receipt);
  assert.throws(() => exchangeMonthlyCredits(club, b, command, at), /đã được sử dụng/);
  assert.throws(() => exchangeMonthlyCredits(club, a, { ...command, operationId: crypto.randomUUID() }, at), /không đủ/);
  assert.equal(scoreFor(club, a.id, month).points, 0.01);
  assert.equal(weeklyScoreFor(club, a.id, week).points, 0.11);
  assert.equal(semesterScores(club, month, month).rows.find(row => row.memberId === a.id)?.points, 0.01);
  const { buffer } = await makeReport(club, month);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as any);
  const sheet = book.worksheets[0];
  const headers = sheet.getRow(3).values as (string | undefined)[];
  assert.equal(sheet.getRow(4).getCell(headers.indexOf("Tổng điểm")).value, 0.01);
  assert.equal(sheet.getRow(4).getCell(headers.indexOf("Điểm đã đổi credits")).value, -0.1);
});
