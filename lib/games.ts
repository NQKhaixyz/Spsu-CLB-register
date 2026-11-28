import type { Club } from "./club";

export const WHEEL_FACTORS = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const;
export type WheelFactor = typeof WHEEL_FACTORS[number];
export type Mark = "X" | "O";
export type XoSize = 3 | 20;
export const XO_BOARD_SIZE = 20;
export const GAME_RULES_VERSION = "3";
export const WHEEL_REFUND_EVERY = 10;

const startingBalance = 1_000_000;
const creditCents = 100;
const winnerCentsPerCredit = 195;
const maxBalance = Number.MAX_SAFE_INTEGER;
const recentCount = 5;
const requestIdFormat = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const creditNumber = new Intl.NumberFormat("vi-VN");
const rankNames = new Intl.Collator("vi-VN", { numeric: true });

type WheelProgress = { spins: number; netCredits: number };
const emptyWheelProgress: WheelProgress = { spins: 0, netCredits: 0 };
type Wallet = {
  balanceCents: number;
  version: number;
  spins: WheelSpin[];
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
export type CreditRecipient = { memberId: string; name: string; balanceCents: number; walletVersion: number; identifier?: string };
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
};

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
export type GamesState = { wallets: Record<string, Wallet>; rooms: XoRoom[] };
export type GamesView = {
  revision: number;
  wallet: Pick<Wallet, "balanceCents" | "version"> & { maxWheelStake: number };
  openRooms: OpenXoRoom[];
  ownRooms: XoRoom[];
  spins: WheelSpin[];
  wheelProgress: { spins: number; pendingRefundCents: number };
};
export type GamesResponse = GamesView & { spin?: WheelSpin };
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

export function parseGameCommand(body: unknown): GameCommand {
  const invalid = () => new GameRuleError("Thao tác trò chơi không hợp lệ");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid();
  const { kind, id, stake, walletVersion, cell, turn } = body as Record<string, unknown>;
  if (typeof id !== "string" || !requestIdFormat.test(id)) throw invalid();
  if (kind === "create" || kind === "join" || kind === "spin") {
    if (!integerBetween(stake, 1, Math.floor(maxBalance / (5 * creditCents))))
      throw new GameRuleError("Mức cược phải là số nguyên dương");
    if (!integerBetween(walletVersion, 0, maxBalance)) throw invalid();
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
    return {
      memberId: member.id, name: member.name, balanceCents: wallet.balanceCents, walletVersion: wallet.version,
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
  const balance = mode === "set" ? amountCents : wallet.balanceCents + (mode === "add" ? amountCents : -amountCents);
  if (balance < 0) throw new GameRuleError("Số credits muốn trừ lớn hơn số dư hiện tại");
  const room = liveRoomFor(games, memberId);
  const reservedPrize = room ? xoPrizeCents(room.stake) : 0;
  const reservedRefund = wheelRefundCents(wallet.wheelProgress?.netCredits);
  if (!Number.isSafeInteger(balance) || balance > maxBalance - reservedPrize - reservedRefund)
    throw new GameRuleError("Số dư sẽ vượt giới hạn tính toán", 409);
  const next = updateBalance(games, memberId, balance - wallet.balanceCents);
  const receipt: CreditAdjustmentReceipt = {
    operationId, mode, amountCents, beforeCents: wallet.balanceCents, afterCents: next.balanceCents, appliedAt: at, actorId,
  };
  next.operatorGrants = [...(next.operatorGrants ?? []), receipt];
  const result: CreditAdjustmentResult = { memberId, name: member.name, balanceCents: next.balanceCents, walletVersion: next.version, receipt };
  return { changed: true, result };
}

function updateBalance(games: GamesState, memberId: string, delta: number) {
  const old = walletFor(games, memberId);
  const balanceCents = old.balanceCents + delta;
  if (!integerBetween(balanceCents, 0, maxBalance)) throw new GameRuleError("Số dư credits vượt giới hạn tính toán");
  const wallet = { ...old, balanceCents, version: old.version + 1 };
  games.wallets[memberId] = wallet;
  return wallet;
}

function liveRoomFor(games: GamesState | undefined, memberId: string) {
  return games?.rooms.find(room => isLiveRoom(room) && isPlayer(room, memberId));
}

function wheelRefundCents(netCredits = 0) {
  return Math.max(0, -netCredits) * (creditCents / 2);
}

function maxWheelStake(games: GamesState | undefined, memberId: string) {
  const { balanceCents, wheelProgress } = walletFor(games, memberId);
  const room = liveRoomFor(games, memberId);
  const reservedPrize = room ? room.stake * winnerCentsPerCredit : 0;
  const reservedRefund = wheelRefundCents(wheelProgress?.netCredits);
  return Math.min(
    Math.floor(balanceCents / (5 * creditCents)),
    Math.floor((maxBalance - balanceCents - reservedPrize - reservedRefund) / (5 * creditCents)),
  );
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

function finishRoom(games: GamesState, room: XoRoom, at: number,
  status: "won" | "draw" | "cancelled", winnerId?: string, reason?: XoRoom["finishReason"]) {
  if (status === "won" && winnerId) updateBalance(games, winnerId, xoPrizeCents(room.stake));
  else if (status !== "won") {
    updateBalance(games, room.hostId, room.stake * creditCents);
    if (room.guestId) updateBalance(games, room.guestId, room.stake * creditCents);
  }
  room.status = status;
  room.winnerId = winnerId;
  room.finishReason = reason;
  room.updatedAt = at;
  trimFinishedRooms(games);
}

export function dropMemberFromGames(club: Club, memberId: string, erase = false, at = Date.now()) {
  const games = club.games;
  if (!games) return;
  const room = liveRoomFor(games, memberId);
  if (room) finishRoom(games, room, at, "cancelled", undefined, "unavailable");
  if (erase) {
    delete games.wallets[memberId];
    games.rooms = games.rooms.filter(room => !isPlayer(room, memberId));
  }
}

export function gamesView(club: Club, memberId: string, revision: number, legacyOnly = false): GamesView {
  const games = club.games;
  const { balanceCents, version, spins, wheelProgress } = walletFor(games, memberId);
  const activeMembers = new Set(club.members.filter(member => member.active).map(member => member.id));
  const rooms = legacyOnly ? (games?.rooms ?? []).filter(room => xoSize(room) === 3) : games?.rooms ?? [];
  return {
    revision,
    wallet: { balanceCents, version, maxWheelStake: maxWheelStake(games, memberId) },
    openRooms: rooms.filter(room => room.status === "waiting" && activeMembers.has(room.hostId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(room => ({ id: room.id, hostId: room.hostId, stake: room.stake, size: xoSize(room) })),
    ownRooms: rooms.filter(room => isPlayer(room, memberId))
      .sort((a, b) => Number(isLiveRoom(b)) - Number(isLiveRoom(a)) || b.updatedAt - a.updatedAt)
      .slice(0, recentCount),
    spins,
    wheelProgress: { spins: wheelProgress?.spins ?? 0, pendingRefundCents: wheelRefundCents(wheelProgress?.netCredits) },
  };
}

function reserveXoStake(games: GamesState, memberId: string, stake: number, walletVersion: number) {
  const wallet = walletFor(games, memberId);
  if (walletVersion !== wallet.version) throw new GameRuleError("Số dư đã thay đổi, kiểm tra lại mức cược", 409);
  if (liveRoomFor(games, memberId)) throw new GameRuleError("Bạn đang có phòng XO", 409);
  if (wallet.balanceCents < stake * creditCents) throw new GameRuleError("Bạn không đủ credits để đặt cược");
  const reservedRefund = wheelRefundCents(wallet.wheelProgress?.netCredits);
  if (wallet.balanceCents > maxBalance - reservedRefund - (winnerCentsPerCredit - creditCents) * stake)
    throw new GameRuleError("Mức cược vượt giới hạn tính toán");
  updateBalance(games, memberId, -stake * creditCents);
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
    if (command.stake > maxWheelStake(games, memberId))
      throw new GameRuleError("Bạn không đủ credits cho mức cược này");
    if (wheelFactor === undefined) throw new Error("Máy chủ chưa chọn hệ số");
    const netCents = wheelNetCents(command.stake, wheelFactor);
    const progress = wallet.wheelProgress ?? emptyWheelProgress;
    const spins = progress.spins + 1;
    const netCredits = progress.netCredits + netCents / creditCents;
    const settleRefund = spins === WHEEL_REFUND_EVERY;
    const refundCents = settleRefund ? wheelRefundCents(netCredits) : 0;
    const next = updateBalance(games, memberId, netCents + refundCents);
    next.wheelProgress = settleRefund ? emptyWheelProgress : { spins, netCredits };
    const spin: WheelSpin = {
      id: command.id, at, stake: command.stake, factor: wheelFactor, netCents, balanceCents: next.balanceCents,
      ...(refundCents ? { refundCents } : {}),
    };
    next.spins = [spin, ...next.spins].slice(0, WHEEL_REFUND_EVERY);
    return spin;
  }
  const room = games.rooms.find(room => room.id === command.id);
  if (command.kind === "create") {
    if (room) {
      if (room.hostId === memberId && room.stake === command.stake) return;
      throw new GameRuleError("Phòng đã được tạo", 409);
    }
    reserveXoStake(games, memberId, command.stake, command.walletVersion);
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
    reserveXoStake(games, memberId, room.stake, command.walletVersion);
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
    finishRoom(games, room, at, "cancelled");
    return;
  }
  const mark = room.hostId === memberId ? "X" : "O";
  if (command.kind === "surrender") {
    const opponent = mark === "X" ? room.guestId : room.hostId;
    if (room.finishReason === "surrender" && room.winnerId === opponent) return;
    if (room.status !== "playing" || !opponent) throw new GameRuleError("Ván XO đã kết thúc", 409);
    finishRoom(games, room, at, "won", opponent, "surrender");
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
  if (xoWinningLine(xoBoard(room.moves, size), size, command.cell)) finishRoom(games, room, at, "won", memberId);
  else if (room.moves.length === size * size) finishRoom(games, room, at, "draw");
}
