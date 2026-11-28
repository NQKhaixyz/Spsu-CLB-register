import { monthLabel, reportMembers, scoreFor, today, type Club, type Member } from "./club";
import { awardGameCredits, creditWalletBalance, cupidCreditPartnerId, GameRuleError } from "./games";
import { isNoticeId } from "./notification-types";
import { sharingScoreBook } from "./sharing-scores";

export const CREDIT_EXCHANGE_CENTS_PER_UNIT = 200_000;
export const CREDIT_EXCHANGE_POINT_CENTS = 5;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const maxUnits = Math.floor(Number.MAX_SAFE_INTEGER / CREDIT_EXCHANGE_CENTS_PER_UNIT);

export type MonthlyCreditUse = { memberId: string; month: string; units: number };
export type CreditExchangeReceipt = MonthlyCreditUse & {
  operationId: string; at: number; earnedCents: number; balanceChangeCents: number;
};
type ExchangeCommand = Omit<MonthlyCreditUse, "memberId"> & { operationId: string };

export function parseCreditExchange(input: unknown): ExchangeCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new GameRuleError("Thông tin đổi điểm chưa hợp lệ");
  const { month, units, operationId } = input as Record<string, unknown>;
  if (!isNoticeId(operationId) || typeof month !== "string" || !monthPattern.test(month) ||
      typeof units !== "number" || !Number.isSafeInteger(units) || units < 1 || units > maxUnits)
    throw new GameRuleError("Nhập số điểm dương theo bước 0,05");
  return { month, units, operationId };
}

function creditableMember(member: Member) {
  return member.active && member.role === "member" && !!member.userId;
}

function exchangeUnits(points: number) {
  return Math.max(0, Math.min(maxUnits, Math.floor((points + 1e-12) * 20)));
}

export function creditExchangeView(club: Club, member: Member, date = today()) {
  const current = date.slice(0, 7);
  const dates = [...club.weeks.map(week => week.meetingDate), ...(club.manualActivities ?? []).map(row => row.date),
    ...(club.activityRegistrations ?? []).map(row => row.date), ...(club.pointDeductions ?? []).map(row => row.date)];
  const months = new Set([current, ...club.schedules.map(schedule => schedule.month), ...dates.map(day => day.slice(0, 7)),
    ...(club.monthlyCreditUses ?? []).map(use => use.month)]);
  const { index } = sharingScoreBook(club);
  return {
    balanceCents: creditWalletBalance(club, member.id),
    cupid: !!cupidCreditPartnerId(club, member.id),
    months: creditableMember(member) ? [...months].sort().reverse().flatMap(month => {
      if (!monthPattern.test(month) || month > current || !reportMembers(club, month, date).some(row => row.id === member.id)) return [];
      const { points, redeemedPoints } = scoreFor(club, member.id, month, undefined, index);
      return [{ month, points, redeemedPoints, units: exchangeUnits(points) }];
    }) : [],
  };
}

export function exchangeMonthlyCredits(club: Club, member: Member, command: ExchangeCommand, at: number) {
  if (!creditableMember(member)) throw new GameRuleError("Đổi điểm dành cho thành viên đang hoạt động", 403);
  const { operationId, month, units } = command;
  const existing = club.games?.exchangeReceipts?.find(receipt => receipt.operationId === operationId);
  if (existing) {
    if (existing.month !== month || existing.units !== units || existing.memberId !== member.id)
      throw new GameRuleError("Mã đổi điểm đã được sử dụng", 409);
    return existing;
  }
  const snapshot = creditExchangeView(club, member, today(new Date(at)));
  const available = snapshot.months.find(row => row.month === month);
  if (!available || units > available.units) throw new GameRuleError("Điểm tháng không đủ cho số điểm muốn đổi", 409);
  const earnedCents = units * CREDIT_EXCHANGE_CENTS_PER_UNIT;
  const wallet = awardGameCredits(club, member.id, earnedCents, "Đổi điểm " + monthLabel(month).toLocaleLowerCase("vi"), at);
  const uses = club.monthlyCreditUses ??= [];
  const usage = uses.find(row => row.memberId === member.id && row.month === month);
  if (usage) usage.units += units;
  else uses.push({ memberId: member.id, month, units });
  const receipt = { operationId, memberId: member.id, month, units, at, earnedCents,
    balanceChangeCents: wallet.balanceCents - snapshot.balanceCents };
  (club.games!.exchangeReceipts ??= []).push(receipt);
  return receipt;
}
