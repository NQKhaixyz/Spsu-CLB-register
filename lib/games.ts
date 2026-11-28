import type { Club } from "./club";
import { recordCreditEntry, type CreditMovement, type PendingCreditEntry } from "./credit-history";
import { activeSharingPeriod, type SharingPeriod } from "./sharing-types";
import type { CreditExchangeReceipt } from "./credit-exchange";

export const WHEEL_FACTORS = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const;
export type WheelFactor = typeof WHEEL_FACTORS[number];
export const COIN_SIDES = ["one", "two"] as const;
export type CoinSide = typeof COIN_SIDES[number];
export const COIN_WIN_PAYOUT_CENTS = 190;
export type Mark = "X" | "O";
export type XoSize = 3 | 20;
export const XO_BOARD_SIZE = 20;
export const GAME_RULES_VERSION = "7";
export const WHEEL_REFUND_EVERY = 10;
export const WHEEL_REFUND_PERCENT = 19;

const startingBalance = 1_000_000;
const creditCents = 100;
const winnerCentsPerCredit = 195;
const coinWinCentsPerCredit = COIN_WIN_PAYOUT_CENTS - creditCents;
const maxBalance = Number.MAX_SAFE_INTEGER;
const recentCount = 5;
const gameResultHistoryLimit = 10;
const requestIdFormat = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const creditNumber = new Intl.NumberFormat("vi-VN");
const rankNames = new Intl.Collator("vi-VN", { numeric: true });

type WheelProgress = { spins: number; netCredits: number };
const emptyWheelProgress: WheelProgress = { spins: 0, netCredits: 0 };
type Wallet = {
  balanceCents: number;
  version: number;
  spins: WheelSpin[];
  flips?: CoinFlip[];
  wheelProgress?: WheelProgress;
  operatorGrants?: CreditAdjustmentReceipt[];
};
export type CreditAdjustmentMode = "add" | "subtract" | "set";
export type CreditAdjustmentReceipt = {
  operationId: string;
  amountCents: number;
  beforeCents: number;
  afterCents: number;
  appliedAt: number;
  actorId?: string;
  mode?: CreditAdjustmentMode;
};
export type CreditAdjustmentCommand = {
  operationId: string;
  memberId: string;
  mode: CreditAdjustmentMode;
  amountCents: number;
  walletVersion: number;
};
export type CreditRecipient = { memberId: string; name: string; balanceCents: number; walletVersion: number; identifier?: string; partnerName?: string };
export type CreditAdjustmentResult = { memberId: string; name: string; balanceCents: number; walletVersion: number; receipt: CreditAdjustmentReceipt };
const defaultWallet: Wallet = { balanceCents: startingBalance, version: 0, spins: [] };

export type WheelSpin = {
  id: string;
  at: number;
  stake: number;
  factor: WheelFactor;
  netCents: number;
  balanceCents: number;
  refundCents?: number;
  walletChangeCents?: number;
};

export type CoinFlip = {
  id: string;
  at: number;
  stake: number;
  pick: CoinSide;
  side: CoinSide;
  netCents: number;
  balanceCents: number;
  walletChangeCents?: number;
};
export type CoinFlipCommand = { kind: "flip"; id: string; stake: number; pick: CoinSide; walletVersion: number };

export type XoRoom = {
  id: string;
  size?: XoSize;
  hostId: string;
  guestId?: string;
  stake: number;
  moves: number[];
  status: "waiting" | "playing" | "won" | "draw" | "cancelled";
  winnerId?: string;
  finishReason?: "surrender" | "unavailable";
  updatedAt: number;
};

export type OpenXoRoom = Pick<XoRoom, "id" | "hostId" | "stake"> & { size: XoSize };
export type GamesState = {
  wallets: Record<string, Wallet>;
  rooms: XoRoom[];
  creditHistorySince?: number;
  exchangeReceipts?: CreditExchangeReceipt[];
};
export type GamesView = {
  revision: number;
  wallet: Pick<Wallet, "balanceCents" | "version"> & { maxWheelStake: number; maxCoinflipStake: number };
  openRooms: OpenXoRoom[];
  ownRooms: XoRoom[];
  spins: WheelSpin[];
  flips: CoinFlip[];
  cupidPartnerId?: string;
  wheelProgress: { spins: number; pendingRefundCents: number };
};
export type GamesResponse = GamesView & { spin?: WheelSpin; flip?: CoinFlip };
export type CreditsRanking = {
  revision: number;
  rows: { memberId: string; name: string; balanceCents: number; rank: number }[];
};

export type GameCommand =
  | { kind: "create"; id: string; stake: number; walletVersion: number }
  | { kind: "join"; id: string; stake: number; walletVersion: number }
  | { kind: "spin"; id: string; stake: number; walletVersion: number }
  | { kind: "move"; id: string; cell: number; turn: number }
  | { kind: "cancel" | "surrender"; id: string };

export class GameRuleError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function integerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function parseCreditAdjustment(data: Record<string, unknown>): CreditAdjustmentCommand {
  const { operationId, memberId, mode, amountCents, walletVersion } = data;
  if (typeof operationId !== "string" || !requestIdFormat.test(operationId) || typeof memberId !== "string" || !memberId || memberId.length > 120)
    throw new GameRuleError("Tài khoản hoặc mã điều chỉnh credits không hợp lệ");
  if (mode !== "add" && mode !== "subtract" && mode !== "set")
    throw new GameRuleError("Chọn thao tác điều chỉnh");
  if (!integerBetween(amountCents, mode === "set" ? 0 : 1, maxBalance))
    throw new GameRuleError(mode === "set" ? "Nhập số credits từ 0 trở lên" : "Nhập số credits lớn hơn 0");
  if (!integerBetween(walletVersion, 0, maxBalance)) throw new GameRuleError("Phiên bản số dư không hợp lệ");
  return { operationId, memberId, mode, amountCents, walletVersion };
}

export function parseGameCommand(body: unknown): GameCommand | CoinFlipCommand {
  const invalid = () => new GameRuleError("Thao tác trò chơi không hợp lệ");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid();
  const { kind, id, stake, walletVersion, cell, turn, pick } = body as Record<string, unknown>;
  if (typeof id !== "string" || !requestIdFormat.test(id)) throw invalid();
  if (kind === "create" || kind === "join" || kind === "spin" || kind === "flip") {
    if (!integerBetween(stake, 1, Math.floor(maxBalance / (5 * creditCents))))
      throw new GameRuleError("Mức cược phải là số nguyên dương");
    if (!integerBetween(walletVersion, 0, maxBalance)) throw invalid();
    if (kind === "flip") {
      if (pick !== "one" && pick !== "two") throw new GameRuleError("Chọn một mặt đồng xu");
      return { kind, id, stake, walletVersion, pick };
    }
    return { kind, id, stake, walletVersion };
  }
  const lastCell = XO_BOARD_SIZE ** 2 - 1;
  if (kind === "move" && integerBetween(cell, 0, lastCell) && integerBetween(turn, 0, lastCell))
    return { kind, id, cell, turn };
  if (kind === "cancel" || kind === "surrender") return { kind, id };
  throw invalid();
}

export function markOnTurn(turn: number): Mark {
  return turn % 2 === 0 ? "X" : "O";
}

export function xoSize(room: XoRoom) {
  return room.size ?? 3;
}

export function xoWinLength(size: XoSize) {
  return size === XO_BOARD_SIZE ? 5 : 3;
}

export function xoBoard(moves: readonly number[], size: XoSize): (Mark | null)[] {
  const board: (Mark | null)[] = Array.from({ length: size * size }, () => null);
  moves.forEach((cell, turn) => { board[cell] = markOnTurn(turn); });
  return board;
}

const winDirections = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;

export function xoWinningLine(board: readonly (Mark | null)[], size: XoSize, lastMove?: number) {
  if (lastMove === undefined || !board[lastMove]) return;
  const mark = board[lastMove];
  const row = Math.floor(lastMove / size);
  const column = lastMove % size;

  for (const [rowStep, columnStep] of winDirections) {
    const line = [lastMove];
    for (const direction of [-1, 1]) {
      const dy = rowStep * direction;
      const dx = columnStep * direction;
      let y = row + dy;
      let x = column + dx;
      while (y >= 0 && y < size && x >= 0 && x < size && board[y * size + x] === mark) {
        if (direction < 0) line.unshift(y * size + x);
        else line.push(y * size + x);
        y += dy;
        x += dx;
      }
    }
    if (line.length >= xoWinLength(size)) return line;
  }
}

export function isLiveRoom(room: XoRoom) {
  return room.status === "waiting" || room.status === "playing";
}

function isPlayer(room: XoRoom, memberId: string) {
  return room.hostId === memberId || room.guestId === memberId;
}

function walletFor(games: GamesState | undefined, memberId: string): Wallet {
  const wallets = games?.wallets;
  return wallets && Object.hasOwn(wallets, memberId) ? wallets[memberId] : defaultWallet;
}

export function creditWalletBalance(club: Club, memberId: string) {
  return walletFor(club.games, memberId).balanceCents;
}

const two = BigInt(2);
const maxCreditBalance = BigInt(maxBalance);
function creditPair(club: Club, memberId: string) {
  for (const group of club.sharing?.groups ?? []) {
    const period = group.kind === "cupid" ? activeSharingPeriod(group) : undefined;
    if (!period || period.asset !== "credits" || period.memberIds.length !== 2 || !period.memberIds.includes(memberId)) continue;
    const partnerId = period.memberIds.find(id => id !== memberId);
    if (partnerId) return { period, partnerId };
  }
}

export function cupidCreditPartnerId(club: Club, memberId: string) {
  return creditPair(club, memberId)?.partnerId;
}

export function mergeCupidCredits(club: Club, period: SharingPeriod, at: number) {
  const games: GamesState = club.games ??= { wallets: Object.create(null) as GamesState["wallets"], rooms: [] };
  const [one, other] = period.memberIds;
  if (!one || !other) return;
  const total = BigInt(walletFor(games, one).balanceCents) + BigInt(walletFor(games, other).balanceCents);
  const equal = Number(total / two);
  period.creditRemainder = Number(total % two) || undefined;
  for (const memberId of [one, other]) {
    const difference = equal - walletFor(games, memberId).balanceCents;
    saveWalletBalance(games, memberId, equal);
    recordCreditEntry(games, { memberId, at, balanceCents: equal, changeCents: difference, kind: "cupid", label: "Gộp ví Cupid" });
  }
}

export function separateCupidCredits(club: Club, period: SharingPeriod, at: number) {
  const games = club.games;
  const [one] = period.memberIds;
  if (!games || !one) return;
  const balance = walletFor(games, one).balanceCents;
  period.endingCreditBalance = balance;
  const remainder = period.creditRemainder ?? 0;
  if (remainder) {
    saveWalletBalance(games, one, balance + remainder);
    recordCreditEntry(games, { memberId: one, at, balanceCents: balance + remainder, changeCents: remainder,
      kind: "cupid", label: "Phần lẻ khi kết thúc Cupid" });
  }
  for (const memberId of period.memberIds) saveWalletBalance(games, memberId, walletFor(games, memberId).balanceCents);
  delete period.creditRemainder;
}

export function initializeCreditHistory(club: Club, now: number) {
  const games: GamesState = club.games ??= { rooms: [], wallets: Object.create(null) as GamesState["wallets"] };
  if (games.creditHistorySince !== undefined) return false;
  const members = new Set(club.members.filter(member => member.userId).map(member => member.id));
  const entries: PendingCreditEntry[] = [];
  for (const [memberId, wallet] of Object.entries(games.wallets)) {
    if (!members.has(memberId)) continue;
    for (const spin of wallet.spins) {
      const refund = spin.refundCents ?? 0;
      entries.push({ memberId, at: spin.at, kind: "wheel", label: `Vòng quay ×${spin.factor}`, changeCents: spin.netCents,
        balanceCents: spin.balanceCents - refund });
      if (refund) entries.push({ memberId, at: spin.at, kind: "refund", label: "Hoàn cược vòng quay",
        changeCents: refund, balanceCents: spin.balanceCents });
    }
    for (const flip of wallet.flips ?? []) entries.push({ memberId, at: flip.at, kind: "coinflip",
      label: flip.netCents > 0 ? "Coinflip · Đoán đúng" : "Coinflip · Đoán sai", changeCents: flip.netCents, balanceCents: flip.balanceCents });
    for (const grant of wallet.operatorGrants ?? []) entries.push({ memberId, at: grant.appliedAt, kind: "adjustment",
      label: "Điều chỉnh credits", changeCents: grant.afterCents - grant.beforeCents, balanceCents: grant.afterCents });
  }
  for (const room of games.rooms) {
    if (room.status !== "won" || !room.winnerId) continue;
    for (const memberId of [room.hostId, room.guestId]) {
      if (!memberId || !members.has(memberId)) continue;
      const won = memberId === room.winnerId;
      entries.push({ memberId, at: room.updatedAt, kind: "xo", label: won ? "XO · Thắng ván" : "XO · Thua ván",
        changeCents: won ? xoPrizeCents(room.stake) - room.stake * creditCents : -room.stake * creditCents, balanceCents: null });
    }
  }
  for (const entry of entries.sort((one, two) => one.at - two.at)) recordCreditEntry(games, entry);
  games.creditHistorySince = now;
  return true;
}

export function formatCredits(cents: number) {
  const amount = Math.abs(cents);
  const remainder = amount % creditCents;
  const whole = creditNumber.format((amount - remainder) / creditCents);
  const fraction = remainder ? "," + String(remainder).padStart(2, "0").replace(/0$/, "") : "";
  return (cents < 0 ? "−" : "") + whole + fraction;
}

export function parseCreditAmount(text: string) {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return;
  const cents = Number(match[1]) * creditCents + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : undefined;
}

export function creditsRanking(club: Club, revision: number): CreditsRanking {
  const sorted = club.members
    .filter(member => canReceiveCredits(club, member))
    .map(({ id, name }) => ({ memberId: id, name, balanceCents: walletFor(club.games, id).balanceCents }))
    .sort((a, b) => b.balanceCents - a.balanceCents || rankNames.compare(a.name, b.name) || a.memberId.localeCompare(b.memberId));
  let rank = 0;
  const rows = sorted.map((row, index) => {
    if (sorted[index - 1]?.balanceCents !== row.balanceCents) rank = index + 1;
    return { ...row, rank };
  });
  return { revision, rows };
}

function canReceiveCredits(club: Club, member: Club["members"][number]) {
  return member.active && !!member.userId && !(club.testAccountsDisabled && member.userId === "native:test-member");
}

export function creditRecipients(club: Club): CreditRecipient[] {
  const members = club.members.filter(member => canReceiveCredits(club, member));
  const names = new Map<string, number>();
  const keyFor = (name: string) => name.normalize("NFC").trim().toLocaleLowerCase("vi-VN");
  for (const member of members) {
    const key = keyFor(member.name);
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  return members.map(member => {
    const wallet = walletFor(club.games, member.id);
    const partnerId = cupidCreditPartnerId(club, member.id);
    const partnerName = partnerId ? club.members.find(item => item.id === partnerId)?.name : undefined;
    return {
      memberId: member.id, name: member.name, balanceCents: wallet.balanceCents, walletVersion: wallet.version,
      ...(partnerName ? { partnerName } : {}),
      ...((names.get(keyFor(member.name)) ?? 0) > 1 ? { identifier: member.studentId || member.loginName || member.id } : {}),
    };
  }).sort((a, b) => rankNames.compare(a.name, b.name) || a.memberId.localeCompare(b.memberId));
}

export function adjustGameCredits(club: Club, command: CreditAdjustmentCommand, actorId: string, at: number) {
  const { memberId, operationId, mode, amountCents, walletVersion } = command;
  const member = club.members.find(item => item.id === memberId);
  if (!member) throw new GameRuleError("Không tìm thấy tài khoản nhận credits", 404);
  const games: GamesState = club.games ??= { wallets: Object.create(null) as GamesState["wallets"], rooms: [] };
  const wallet = walletFor(games, memberId);
  for (const [owner, otherWallet] of Object.entries(games.wallets)) {
    const receipt = otherWallet.operatorGrants?.find(item => item.operationId === operationId);
    if (!receipt) continue;
    if (owner !== memberId || receipt.amountCents !== amountCents || receipt.actorId !== actorId || (receipt.mode ?? "add") !== mode)
      throw new GameRuleError("Mã điều chỉnh credits đã được sử dụng", 409);
    const result: CreditAdjustmentResult = { memberId, name: member.name, balanceCents: wallet.balanceCents, walletVersion: wallet.version, receipt };
    return { changed: false, result };
  }
  if (!canReceiveCredits(club, member)) throw new GameRuleError("Tài khoản nhận credits đang tạm nghỉ hoặc chưa đăng ký", 409);
  if (wallet.version !== walletVersion) throw new GameRuleError("Số dư vừa thay đổi. Kiểm tra lại số dư hiện tại", 409);
  const changeCents = mode === "set" ? amountCents - wallet.balanceCents : mode === "add" ? amountCents : -amountCents;
  if (mode === "subtract" && amountCents > wallet.balanceCents)
    throw new GameRuleError("Số credits muốn trừ lớn hơn số dư hiện tại");
  const multiplier = mode === "set" && creditPair(club, memberId) ? 2 : 1;
  if (changeCents > 0 && BigInt(changeCents) * BigInt(multiplier) > creditHeadroom(club, memberId))
    throw new GameRuleError("Số dư sẽ vượt giới hạn tính toán", 409);
  const next = updateBalance(club, memberId, at, [{ kind: "adjustment", label: "Điều chỉnh credits", changeCents }], multiplier);
  const receipt: CreditAdjustmentReceipt = {
    operationId, mode, amountCents, beforeCents: wallet.balanceCents, afterCents: next.balanceCents, appliedAt: at, actorId,
  };
  next.operatorGrants = [...(next.operatorGrants ?? []), receipt];
  const result: CreditAdjustmentResult = { memberId, name: member.name, balanceCents: next.balanceCents, walletVersion: next.version, receipt };
  return { changed: true, result };
}

function saveWalletBalance(games: GamesState, memberId: string, balanceCents: number) {
  const old = walletFor(games, memberId);
  const wallet = { ...old, balanceCents, version: old.version + 1 };
  games.wallets[memberId] = wallet;
  return wallet;
}

function updateBalance(club: Club, memberId: string, at: number, movements: readonly CreditMovement[], multiplier = 1) {
  const games = club.games!;
  const pair = creditPair(club, memberId);
  const other = pair ? walletFor(games, pair.partnerId) : undefined;
  const divisor = pair ? two : BigInt(1);
  let balanceCents = walletFor(games, memberId).balanceCents;
  let partnerBalance = other?.balanceCents ?? 0;
  let total = BigInt(balanceCents) + BigInt(partnerBalance) + BigInt(pair?.period.creditRemainder ?? 0);
  for (const movement of movements) {
    const nextTotal = total + BigInt(movement.changeCents) * BigInt(multiplier);
    if (nextTotal < BigInt(0) || nextTotal > maxCreditBalance * divisor)
      throw new GameRuleError("Số dư credits vượt giới hạn tính toán");
    const next = Number(nextTotal / divisor);
    recordCreditEntry(games, { ...movement, at, memberId, balanceCents: next, changeCents: next - balanceCents });
    if (pair) recordCreditEntry(games, { ...movement, label: "Cupid · " + movement.label,
      at, memberId: pair.partnerId, balanceCents: next, changeCents: next - partnerBalance });
    balanceCents = next;
    partnerBalance = next;
    total = nextTotal;
  }
  if (pair) {
    pair.period.creditRemainder = Number(total % two) || undefined;
    saveWalletBalance(games, pair.partnerId, partnerBalance);
  }
  return saveWalletBalance(games, memberId, balanceCents);
}

export function spendGameCredits(club: Club, memberId: string, amountCents: number, label: string, at: number) {
  if (!integerBetween(amountCents, 1, creditWalletBalance(club, memberId)))
    throw new GameRuleError("Bạn không đủ credits để đổi điểm", 409);
  club.games ??= { wallets: Object.create(null) as GamesState["wallets"], rooms: [] };
  return updateBalance(club, memberId, at, [{ kind: "exchange", label, changeCents: -amountCents }]);
}

export function awardGameCredits(club: Club, memberId: string, amountCents: number, label: string, at: number) {
  club.games ??= { wallets: Object.create(null) as GamesState["wallets"], rooms: [] };
  if (!integerBetween(amountCents, 1, maxBalance) || BigInt(amountCents) > creditHeadroom(club, memberId))
    throw new GameRuleError("Số dư sẽ vượt giới hạn tính toán", 409);
  return updateBalance(club, memberId, at, [{ kind: "exchange", label, changeCents: amountCents }]);
}

export function clearLegacyInactivity(games: GamesState | undefined) {
  const legacy = games as (GamesState & { inactivityDue?: unknown; inactivityWeek?: unknown }) | undefined;
  if (!legacy || (!Object.hasOwn(legacy, "inactivityDue") && !Object.hasOwn(legacy, "inactivityWeek"))) return false;
  delete legacy.inactivityDue;
  delete legacy.inactivityWeek;
  for (const oldWallet of Object.values(legacy.wallets)) {
    const wallet = oldWallet as Wallet & { creditActivityWeek?: unknown; inactivityCharge?: unknown; gameInactivityCharge?: unknown };
    delete wallet.creditActivityWeek;
    delete wallet.inactivityCharge;
    delete wallet.gameInactivityCharge;
  }
  return true;
}

function liveRoomFor(games: GamesState | undefined, memberId: string) {
  return games?.rooms.find(room => isLiveRoom(room) && isPlayer(room, memberId));
}

function wheelRefundCents(netCredits = 0) {
  return Math.max(0, -netCredits) * (creditCents * WHEEL_REFUND_PERCENT / 100);
}

function reservedCredits(games: GamesState | undefined, memberId: string) {
  const room = liveRoomFor(games, memberId);
  const prize = room ? xoPrizeCents(room.stake) : 0;
  return BigInt(prize) + BigInt(wheelRefundCents(walletFor(games, memberId).wheelProgress?.netCredits));
}

function creditHeadroom(club: Club, memberId: string) {
  const games = club.games;
  const reserve = reservedCredits(games, memberId);
  const pair = creditPair(club, memberId);
  const balance = BigInt(walletFor(games, memberId).balanceCents);
  if (!pair) return maxCreditBalance - balance - reserve;
  const partnerReserve = reservedCredits(games, pair.partnerId);
  const total = balance + BigInt(walletFor(games, pair.partnerId).balanceCents) + BigInt(pair.period.creditRemainder ?? 0);
  // Each wallet must still be able to settle its own open wagers after a split.
  return two * (maxCreditBalance - (reserve > partnerReserve ? reserve : partnerReserve)) - total;
}

function maxWheelStake(club: Club, memberId: string) {
  const balanceCents = walletFor(club.games, memberId).balanceCents;
  return Math.max(0, Math.min(
    Math.floor(balanceCents / (5 * creditCents)),
    Number(creditHeadroom(club, memberId) / BigInt(5 * creditCents)),
  ));
}

function maxCoinflipStake(club: Club, memberId: string) {
  const wallet = walletFor(club.games, memberId);
  return Math.max(0, Math.min(
    Math.floor(wallet.balanceCents / creditCents),
    Number(creditHeadroom(club, memberId) / BigInt(coinWinCentsPerCredit)),
    Math.floor(maxBalance / (5 * creditCents)),
  ));
}

export function drawCoinSide(): CoinSide {
  return COIN_SIDES[crypto.getRandomValues(new Uint8Array(1))[0] % COIN_SIDES.length];
}

export function applyCoinFlip(club: Club, memberId: string, command: CoinFlipCommand, side: CoinSide, at: number): CoinFlip {
  if (!club.members.some(member => member.id === memberId && member.active))
    throw new GameRuleError("Tài khoản đang tạm nghỉ", 403);
  const games = club.games ??= { rooms: [], wallets: Object.create(null) as GamesState["wallets"] };
  const wallet = walletFor(games, memberId);
  const previous = wallet.flips?.find(flip => flip.id === command.id);
  if (previous) {
    if (previous.stake !== command.stake || previous.pick !== command.pick)
      throw new GameRuleError("Lượt tung xu đã dùng lựa chọn khác", 409);
    return previous;
  }
  if (wallet.version !== command.walletVersion)
    throw new GameRuleError("Số dư đã thay đổi, kiểm tra lại mức cược", 409);
  if (!integerBetween(command.stake, 1, maxCoinflipStake(club, memberId)))
    throw new GameRuleError("Mức cược vượt số credits có thể dùng");
  const netCents = command.stake * (command.pick === side ? coinWinCentsPerCredit : -creditCents);
  const next = updateBalance(club, memberId, at, [{ kind: "coinflip",
    label: command.pick === side ? "Coinflip · Đoán đúng" : "Coinflip · Đoán sai", changeCents: netCents }]);
  const flip = { id: command.id, at, stake: command.stake, pick: command.pick, side, netCents, balanceCents: next.balanceCents,
    ...(creditPair(club, memberId) ? { walletChangeCents: next.balanceCents - wallet.balanceCents } : {}) };
  next.flips = [flip, ...(wallet.flips ?? [])].slice(0, gameResultHistoryLimit);
  return flip;
}

export function wheelNetCents(stake: number, factor: WheelFactor) {
  return (factor - 1) * stake * creditCents;
}

export function xoPrizeCents(stake: number) {
  return stake * winnerCentsPerCredit;
}

export function wheelFactorForRoll(roll: number): WheelFactor {
  if (!integerBetween(roll, 0, WHEEL_FACTORS.length - 1))
    throw new RangeError("Số ngẫu nhiên ngoài dải vòng quay");
  return WHEEL_FACTORS[roll];
}

export function drawWheelFactor(): WheelFactor {
  const buckets = WHEEL_FACTORS.length;
  const sample = new Uint32Array(1);
  const uniformLimit = Math.floor(2 ** 32 / buckets) * buckets;
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= uniformLimit);
  return wheelFactorForRoll(sample[0] % buckets);
}

function trimFinishedRooms(games: GamesState) {
  const counts = new Map<string, number>();
  games.rooms.sort((a, b) => b.updatedAt - a.updatedAt);
  games.rooms = games.rooms.filter(room => {
    if (isLiveRoom(room)) return true;
    let keep = false;
    for (const id of [room.hostId, room.guestId]) {
      if (!id) continue;
      const count = counts.get(id) ?? 0;
      if (count < recentCount) keep = true;
      counts.set(id, count + 1);
    }
    return keep;
  });
}

function finishRoom(club: Club, room: XoRoom, at: number,
  status: "won" | "draw" | "cancelled", winnerId?: string, reason?: XoRoom["finishReason"]) {
  if (status === "won" && winnerId) updateBalance(club, winnerId, at,
    [{ kind: "xo", label: "XO · Nhận thưởng thắng ván", changeCents: xoPrizeCents(room.stake) }]);
  else if (status !== "won") {
    const returned = [{ kind: "xo" as const, label: "XO · Hoàn tiền cược", changeCents: room.stake * creditCents }];
    updateBalance(club, room.hostId, at, returned);
    if (room.guestId) updateBalance(club, room.guestId, at, returned);
  }
  room.status = status;
  room.winnerId = winnerId;
  room.finishReason = reason;
  room.updatedAt = at;
  trimFinishedRooms(club.games!);
}

export function dropMemberFromGames(club: Club, memberId: string, erase = false, at = Date.now()) {
  const games = club.games;
  if (!games) return;
  const room = liveRoomFor(games, memberId);
  if (room) finishRoom(club, room, at, "cancelled", undefined, "unavailable");
  if (erase) {
    delete games.wallets[memberId];
    games.rooms = games.rooms.filter(room => !isPlayer(room, memberId));
    if (games.exchangeReceipts) games.exchangeReceipts = games.exchangeReceipts.filter(row => row.memberId !== memberId);
  }
}

export function gamesView(club: Club, memberId: string, revision: number, legacyOnly = false): GamesView {
  const games = club.games;
  const wallet = walletFor(games, memberId);
  const { balanceCents, version, spins, wheelProgress } = wallet;
  const activeMembers = new Set(club.members.filter(member => member.active).map(member => member.id));
  const rooms = legacyOnly ? (games?.rooms ?? []).filter(room => xoSize(room) === 3) : games?.rooms ?? [];
  return {
    revision,
    wallet: { balanceCents, version, maxWheelStake: maxWheelStake(club, memberId),
      maxCoinflipStake: maxCoinflipStake(club, memberId) },
    openRooms: rooms.filter(room => room.status === "waiting" && activeMembers.has(room.hostId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(room => ({ id: room.id, hostId: room.hostId, stake: room.stake, size: xoSize(room) })),
    ownRooms: rooms.filter(room => isPlayer(room, memberId))
      .sort((a, b) => Number(isLiveRoom(b)) - Number(isLiveRoom(a)) || b.updatedAt - a.updatedAt)
      .slice(0, recentCount),
    spins,
    flips: wallet.flips ?? [],
    cupidPartnerId: cupidCreditPartnerId(club, memberId),
    wheelProgress: { spins: wheelProgress?.spins ?? 0, pendingRefundCents: wheelRefundCents(wheelProgress?.netCredits) },
  };
}

function reserveXoStake(club: Club, memberId: string, stake: number, walletVersion: number, at: number) {
  const games = club.games!;
  const wallet = walletFor(games, memberId);
  if (walletVersion !== wallet.version) throw new GameRuleError("Số dư đã thay đổi, kiểm tra lại mức cược", 409);
  if (liveRoomFor(games, memberId)) throw new GameRuleError("Bạn đang có phòng XO", 409);
  if (wallet.balanceCents < stake * creditCents) throw new GameRuleError("Bạn không đủ credits để đặt cược");
  const prizeReserve = BigInt(xoPrizeCents(stake)) * (creditPair(club, memberId) ? two : BigInt(1));
  if (creditHeadroom(club, memberId) < prizeReserve - BigInt(stake * creditCents))
    throw new GameRuleError("Mức cược vượt giới hạn tính toán");
  updateBalance(club, memberId, at, [{ kind: "xo", label: "XO · Đặt cược", changeCents: -stake * creditCents }]);
}

export function applyGameCommand(club: Club, memberId: string, command: GameCommand, at: number,
  wheelFactor?: WheelFactor): WheelSpin | undefined {
  if (!club.members.some(member => member.id === memberId && member.active))
    throw new GameRuleError("Tài khoản đang tạm nghỉ", 403);
  const games = club.games ??= { rooms: [], wallets: Object.create(null) as GamesState["wallets"] };
  if (command.kind === "spin") {
    const wallet = walletFor(games, memberId);
    const previous = wallet.spins.find(spin => spin.id === command.id);
    if (previous) {
      if (previous.stake !== command.stake) throw new GameRuleError("Lượt quay đã dùng mức cược khác", 409);
      return previous;
    }
    if (wallet.version !== command.walletVersion)
      throw new GameRuleError("Số dư đã thay đổi, kiểm tra lại mức cược", 409);
    if (command.stake > maxWheelStake(club, memberId))
      throw new GameRuleError("Bạn không đủ credits cho mức cược này");
    if (wheelFactor === undefined) throw new Error("Máy chủ chưa chọn hệ số");
    const netCents = wheelNetCents(command.stake, wheelFactor);
    const progress = wallet.wheelProgress ?? emptyWheelProgress;
    const spins = progress.spins + 1;
    const netCredits = progress.netCredits + netCents / creditCents;
    const settleRefund = spins >= WHEEL_REFUND_EVERY;
    const refundCents = settleRefund ? wheelRefundCents(netCredits) : 0;
    const next = updateBalance(club, memberId, at, [
      { kind: "wheel", label: `Vòng quay ×${wheelFactor}`, changeCents: netCents },
      { kind: "refund", label: "Hoàn cược vòng quay", changeCents: refundCents },
    ]);
    next.wheelProgress = settleRefund ? emptyWheelProgress : { spins, netCredits };
    const spin: WheelSpin = {
      id: command.id, at, stake: command.stake, factor: wheelFactor, netCents, balanceCents: next.balanceCents,
      ...(refundCents ? { refundCents } : {}),
      ...(creditPair(club, memberId) ? { walletChangeCents: next.balanceCents - wallet.balanceCents } : {}),
    };
    next.spins = [spin, ...next.spins].slice(0, gameResultHistoryLimit);
    return spin;
  }
  const room = games.rooms.find(room => room.id === command.id);
  if (command.kind === "create") {
    if (room) {
      if (room.hostId === memberId && room.stake === command.stake) return;
      throw new GameRuleError("Phòng đã được tạo", 409);
    }
    reserveXoStake(club, memberId, command.stake, command.walletVersion, at);
    games.rooms.unshift({
      id: command.id, size: XO_BOARD_SIZE, hostId: memberId, stake: command.stake,
      moves: [], status: "waiting", updatedAt: at,
    });
    return;
  }
  if (command.kind === "join" && room) {
    if (room.guestId === memberId && room.stake === command.stake) return;
    if (room.status !== "waiting" || !club.members.some(member => member.id === room.hostId && member.active))
      throw new GameRuleError("Phòng đã có người hoặc đã đóng", 409);
    if (room.hostId === memberId) throw new GameRuleError("Bạn là người tạo phòng");
    if (room.stake !== command.stake) throw new GameRuleError("Mức cược của phòng đã thay đổi", 409);
    reserveXoStake(club, memberId, room.stake, command.walletVersion, at);
    room.guestId = memberId;
    room.status = "playing";
    room.updatedAt = at;
    return;
  }
  if (!room || !isPlayer(room, memberId)) throw new GameRuleError("Không tìm thấy phòng XO", 404);
  if (command.kind === "cancel") {
    if (room.status === "cancelled") return;
    if (room.status !== "waiting" || room.hostId !== memberId)
      throw new GameRuleError("Chỉ có thể hủy phòng khi đang chờ người chơi", 409);
    finishRoom(club, room, at, "cancelled");
    return;
  }
  const mark = room.hostId === memberId ? "X" : "O";
  if (command.kind === "surrender") {
    const opponent = mark === "X" ? room.guestId : room.hostId;
    if (room.finishReason === "surrender" && room.winnerId === opponent) return;
    if (room.status !== "playing" || !opponent) throw new GameRuleError("Ván XO đã kết thúc", 409);
    finishRoom(club, room, at, "won", opponent, "surrender");
    return;
  }
  if (command.kind !== "move") throw new GameRuleError("Không tìm thấy phòng XO", 404);
  const size = xoSize(room);
  if (command.cell >= size * size) throw new GameRuleError("Ô đánh nằm ngoài bàn cờ");
  if (room.moves[command.turn] === command.cell && markOnTurn(command.turn) === mark) return;
  if (room.status !== "playing" || room.moves.length !== command.turn || markOnTurn(command.turn) !== mark)
    throw new GameRuleError("Đã đổi lượt hoặc ván XO đã kết thúc", 409);
  if (room.moves.includes(command.cell)) throw new GameRuleError("Ô này đã được đánh", 409);
  room.moves.push(command.cell);
  room.updatedAt = at;
  if (xoWinningLine(xoBoard(room.moves, size), size, command.cell)) finishRoom(club, room, at, "won", memberId);
  else if (room.moves.length === size * size) finishRoom(club, room, at, "draw");
}
