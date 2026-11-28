import type { Club } from "./club";

export const WHEEL_FACTORS = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const;
export type WheelFactor = typeof WHEEL_FACTORS[number];
export type Mark = "X" | "O";
export type XoSize = 3 | 20;
export const XO_BOARD_SIZE = 20;
export const GAME_RULES_VERSION = "2";
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
type Wallet = { balanceCents: number; version: number; spins: WheelSpin[]; wheelProgress?: WheelProgress };
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

export function creditsRanking(club: Club, revision: number): CreditsRanking {
  const sorted = club.members
    .filter(member => member.active && member.userId && !(club.testAccountsDisabled && member.userId === "native:test-member"))
    .map(({ id, name }) => ({ memberId: id, name, balanceCents: walletFor(club.games, id).balanceCents }))
    .sort((a, b) => b.balanceCents - a.balanceCents || rankNames.compare(a.name, b.name) || a.memberId.localeCompare(b.memberId));
  let rank = 0;
  const rows = sorted.map((row, index) => {
    if (sorted[index - 1]?.balanceCents !== row.balanceCents) rank = index + 1;
    return { ...row, rank };
  });
  return { revision, rows };
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

export function wheelOdds(factor: WheelFactor) {
  return factor > 0 ? 10 : 8;
}

export function wheelFactorForRoll(roll: number): WheelFactor {
  if (integerBetween(roll, 0, 99)) {
    for (const factor of WHEEL_FACTORS) {
      const weight = wheelOdds(factor);
      if (roll < weight) return factor;
      roll -= weight;
    }
  }
  throw new RangeError("Số ngẫu nhiên ngoài dải vòng quay");
}

export function drawWheelFactor(): WheelFactor {
  const sample = new Uint32Array(1);
  const uniformLimit = Math.floor(2 ** 32 / 100) * 100;
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= uniformLimit);
  return wheelFactorForRoll(sample[0] % 100);
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
