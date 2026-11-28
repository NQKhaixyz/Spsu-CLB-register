import { monthLabel, reportMembers, scoreFor, today, type Club, type Member } from "./club";
import { awardGameCredits, creditWalletBalance, cupidCreditPartnerId, GameRuleError, spendGameCredits } from "./games";
import { isNoticeId } from "./notification-types";
import { sharingScoreBook } from "./sharing-scores";

export const POINTS_TO_CREDITS = "points-to-credits";
export const CREDITS_TO_POINTS = "credits-to-points";
export const POINT_EXCHANGE_UNIT_CENTS = 5;
export const CREDIT_EXCHANGE_COST_CENTS = 700_000;
export const CREDIT_EXCHANGE_BASE_POINT_CENTS = 25;
export const CREDIT_EXCHANGE_FEE_PERCENT = 20;
export const CREDIT_EXCHANGE_RATE = [CREDIT_EXCHANGE_COST_CENTS, CREDIT_EXCHANGE_BASE_POINT_CENTS, CREDIT_EXCHANGE_FEE_PERCENT].join("-");
const exchangeNetRate = (100 - CREDIT_EXCHANGE_FEE_PERCENT) / 100;
export const CREDIT_EXCHANGE_AWARD_CENTS = CREDIT_EXCHANGE_BASE_POINT_CENTS * exchangeNetRate;
export const CREDITS_PER_POINT_UNIT_CENTS = CREDIT_EXCHANGE_COST_CENTS * POINT_EXCHANGE_UNIT_CENTS /
  CREDIT_EXCHANGE_BASE_POINT_CENTS * exchangeNetRate;
export const CREDIT_EXCHANGE_MONTHLY_LIMIT = 2;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const maxUnits = Math.floor(Number.MAX_SAFE_INTEGER / CREDITS_PER_POINT_UNIT_CENTS);

// Stored units have always meant 0.05 points, including historical exchanges.
export type MonthlyCreditUse = { memberId: string; month: string; units: number };
export type MonthlyCreditAward = { memberId: string; month: string; count: number; pointCents: number };
type ExchangeReceipt = { memberId: string; month: string; operationId: string; at: number; balanceChangeCents: number };
export type CreditExchangeReceipt = ExchangeReceipt & (
  | { units: number; earnedCents: number }
  | { spentCents: number; pointCents: number }
);
export type CreditExchangeCommand = { month: string; operationId: string; rate?: string } & (
  | { direction: typeof POINTS_TO_CREDITS; units: number }
  | { direction: typeof CREDITS_TO_POINTS }
);

export function parseCreditExchange(input: unknown): CreditExchangeCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new GameRuleError("Thông tin đổi điểm chưa hợp lệ");
  const { month, direction = POINTS_TO_CREDITS, operationId, units, rate } = input as Record<string, unknown>;
  if (!isNoticeId(operationId) || typeof month !== "string" || !monthPattern.test(month) ||
      (rate !== undefined && typeof rate !== "string"))
    throw new GameRuleError("Thông tin đổi điểm chưa hợp lệ");
  if (direction === CREDITS_TO_POINTS) return { month, operationId, direction, rate };
  if (direction !== POINTS_TO_CREDITS || typeof units !== "number" || !Number.isSafeInteger(units) || units < 1 || units > maxUnits)
    throw new GameRuleError("Nhập số điểm dương theo bước 0,05");
  return { month, operationId, direction, units, rate };
}

function creditableMember(member: Member) {
  return member.active && member.role === "member" && !!member.userId;
}

function exchangeUnits(points: number) {
  return Math.max(0, Math.min(maxUnits, Math.floor((points + 1e-12) * 20)));
}

export function creditExchangeView(club: Club, member: Member, date = today()) {
  const month = date.slice(0, 7);
  const count = club.monthlyCreditAwards?.find(row => row.memberId === member.id && row.month === month)?.count ?? 0;
  const dates = [...club.weeks.map(week => week.meetingDate), ...(club.manualActivities ?? []).map(row => row.date),
    ...(club.activityRegistrations ?? []).map(row => row.date), ...(club.pointDeductions ?? []).map(row => row.date)];
  const months = new Set([month, ...club.schedules.map(schedule => schedule.month), ...dates.map(day => day.slice(0, 7)),
    ...(club.monthlyCreditUses ?? []).map(use => use.month), ...(club.monthlyCreditAwards ?? []).map(award => award.month)]);
  const { index } = sharingScoreBook(club);
  const availableMonths = creditableMember(member) ? [...months].sort().reverse().flatMap(candidate => {
    if (!monthPattern.test(candidate) || candidate > month || !reportMembers(club, candidate, date).some(row => row.id === member.id)) return [];
    const { points } = scoreFor(club, member.id, candidate, undefined, index);
    return [{ month: candidate, points, units: exchangeUnits(points) }];
  }) : [];
  return {
    month, points: availableMonths.find(row => row.month === month)?.points ?? 0,
    remaining: Math.max(0, CREDIT_EXCHANGE_MONTHLY_LIMIT - count),
    balanceCents: creditWalletBalance(club, member.id),
    cupid: !!cupidCreditPartnerId(club, member.id),
    months: availableMonths,
  };
}

export function exchangeMonthlyCredits(club: Club, member: Member, command: CreditExchangeCommand, at: number): CreditExchangeReceipt {
  if (!creditableMember(member)) throw new GameRuleError("Đổi điểm dành cho thành viên đang hoạt động", 403);
  const { operationId, month } = command;
  const existing = club.games?.exchangeReceipts?.find(receipt => receipt.operationId === operationId);
  if (existing) {
    const matchesDirection = command.direction === CREDITS_TO_POINTS ? "spentCents" in existing :
      "units" in existing && existing.units === command.units;
    if (!matchesDirection || existing.month !== month || existing.memberId !== member.id)
      throw new GameRuleError("Mã đổi điểm đã được sử dụng", 409);
    return existing;
  }
  if (command.rate !== CREDIT_EXCHANGE_RATE) throw new GameRuleError("Tỷ lệ đổi đã thay đổi. Tải lại trang để tiếp tục", 409);
  const date = today(new Date(at));
  const before = creditWalletBalance(club, member.id);
  const label = monthLabel(month).toLocaleLowerCase("vi");
  let receipt: CreditExchangeReceipt;
  if (command.direction === CREDITS_TO_POINTS) {
    if (month !== date.slice(0, 7)) throw new GameRuleError("Chỉ cộng điểm đổi từ credits vào tháng hiện tại", 409);
    const awards = club.monthlyCreditAwards ??= [];
    const previous = awards.find(row => row.memberId === member.id && row.month === month);
    if ((previous?.count ?? 0) >= CREDIT_EXCHANGE_MONTHLY_LIMIT)
      throw new GameRuleError(`Bạn đã dùng hết ${CREDIT_EXCHANGE_MONTHLY_LIMIT} lượt đổi trong tháng này`, 409);
    const spentCents = CREDIT_EXCHANGE_COST_CENTS;
    const pointCents = CREDIT_EXCHANGE_AWARD_CENTS;
    const wallet = spendGameCredits(club, member.id, spentCents, "Đổi credits lấy điểm " + label, at);
    if (previous) {
      previous.count += 1;
      previous.pointCents += pointCents;
    } else awards.push({ memberId: member.id, month, count: 1, pointCents });
    receipt = { operationId, memberId: member.id, month, at, pointCents, spentCents, balanceChangeCents: wallet.balanceCents - before };
  } else {
    const { units } = command;
    const available = creditExchangeView(club, member, date).months.find(row => row.month === month);
    if (!available || units > available.units) throw new GameRuleError("Điểm tháng không đủ cho số điểm muốn đổi", 409);
    const earnedCents = units * CREDITS_PER_POINT_UNIT_CENTS;
    const wallet = awardGameCredits(club, member.id, earnedCents, "Đổi điểm " + label + " lấy credits", at);
    const uses = club.monthlyCreditUses ??= [];
    const previous = uses.find(row => row.memberId === member.id && row.month === month);
    if (previous) previous.units += units;
    else uses.push({ memberId: member.id, month, units });
    receipt = { operationId, memberId: member.id, month, at, units, earnedCents, balanceChangeCents: wallet.balanceCents - before };
  }
  (club.games!.exchangeReceipts ??= []).push(receipt);
  return receipt;
}
