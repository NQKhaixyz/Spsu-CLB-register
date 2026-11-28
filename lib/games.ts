import type { Club } from "./club";

export const WHEEL_FACTORS = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const;
export type WheelFactor = typeof WHEEL_FACTORS[number];
export type Mark = "X" | "O";

const startingBalance = 1_000_000;
const creditCents = 100;
const winnerCentsPerCredit = 195;
const maxBalance = Number.MAX_SAFE_INTEGER;
const recentCount = 5;
const requestIdFormat = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

type Wallet = { balanceCents: number; version: number; spins: WheelSpin[] };
const defaultWallet: Wallet = { balanceCents: startingBalance, version: 0, spins: [] };

export type WheelSpin = {
  id: string;
  at: number;
  stake: number;
  factor: WheelFactor;
  netCents: number;
  balanceCents: number;
};

export type XoRoom = {
  id: string;
  hostId: string;
  guestId?: string;
  stake: number;
  moves: number[];
  status: "waiting" | "playing" | "won" | "draw" | "cancelled";
  winnerId?: string;
  finishReason?: "surrender" | "unavailable";
  updatedAt: number;
};

export type OpenXoRoom = Pick<XoRoom, "id" | "hostId" | "stake">;
export type GamesState = { wallets: Record<string, Wallet>; rooms: XoRoom[] };
export type GamesView = {
  revision: number;
  wallet: Pick<Wallet, "balanceCents" | "version"> & { maxWheelStake: number };
  openRooms: OpenXoRoom[];
  ownRooms: XoRoom[];
  spins: WheelSpin[];
};
export type GamesResponse = GamesView & { spin?: WheelSpin };

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
  if (kind === "move" && integerBetween(cell, 0, 8) && integerBetween(turn, 0, 8))
    return { kind, id, cell, turn };
  if (kind === "cancel" || kind === "surrender") return { kind, id };
  throw invalid();
}

export function markOnTurn(turn: number): Mark {
  return turn % 2 === 0 ? "X" : "O";
}

export function xoBoard(moves: readonly number[]): (Mark | null)[] {
  const board: (Mark | null)[] = Array.from({ length: 9 }, () => null);
  moves.forEach((cell, turn) => { board[cell] = markOnTurn(turn); });
  return board;
}

const winLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

export function xoWinningLine(board: readonly (Mark | null)[]) {
  return winLines.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]);
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

function maxWheelStake(games: GamesState | undefined, memberId: string) {
  const { balanceCents } = walletFor(games, memberId);
  const room = liveRoomFor(games, memberId);
  const reservedPrize = room ? room.stake * winnerCentsPerCredit : 0;
  return Math.min(
    Math.floor(balanceCents / (5 * creditCents)),
    Math.floor((maxBalance - balanceCents - reservedPrize) / (5 * creditCents)),
  );
}

export function wheelNetCents(stake: number, factor: WheelFactor) {
  return (factor - 1) * stake * creditCents;
}

export function xoPrizeCents(stake: number) {
  return stake * winnerCentsPerCredit;
}

export function drawWheelFactor(): WheelFactor {
  const sample = new Uint32Array(1);
  const uniformLimit = Math.floor(2 ** 32 / WHEEL_FACTORS.length) * WHEEL_FACTORS.length;
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= uniformLimit);
  return WHEEL_FACTORS[sample[0] % WHEEL_FACTORS.length];
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

export function gamesView(club: Club, memberId: string, revision: number): GamesView {
  const games = club.games;
  const { balanceCents, version, spins } = walletFor(games, memberId);
  const activeMembers = new Set(club.members.filter(member => member.active).map(member => member.id));
  const rooms = games?.rooms ?? [];
  return {
    revision,
    wallet: { balanceCents, version, maxWheelStake: maxWheelStake(games, memberId) },
    openRooms: rooms.filter(room => room.status === "waiting" && activeMembers.has(room.hostId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ id, hostId, stake }) => ({ id, hostId, stake })),
    ownRooms: rooms.filter(room => isPlayer(room, memberId))
      .sort((a, b) => Number(isLiveRoom(b)) - Number(isLiveRoom(a)) || b.updatedAt - a.updatedAt)
      .slice(0, recentCount),
    spins,
  };
}

function reserveXoStake(games: GamesState, memberId: string, stake: number, walletVersion: number) {
  const wallet = walletFor(games, memberId);
  if (walletVersion !== wallet.version) throw new GameRuleError("Số dư đã thay đổi, kiểm tra lại mức cược", 409);
  if (liveRoomFor(games, memberId)) throw new GameRuleError("Bạn đang có phòng XO", 409);
  if (wallet.balanceCents < stake * creditCents) throw new GameRuleError("Bạn không đủ credits để đặt cược");
  if (wallet.balanceCents > maxBalance - (winnerCentsPerCredit - creditCents) * stake)
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
    const next = updateBalance(games, memberId, netCents);
    const spin = { id: command.id, at, stake: command.stake, factor: wheelFactor, netCents, balanceCents: next.balanceCents };
    next.spins = [spin, ...next.spins].slice(0, recentCount);
    return spin;
  }
  const room = games.rooms.find(room => room.id === command.id);
  if (command.kind === "create") {
    if (room) {
      if (room.hostId === memberId && room.stake === command.stake) return;
      throw new GameRuleError("Phòng đã được tạo", 409);
    }
    reserveXoStake(games, memberId, command.stake, command.walletVersion);
    games.rooms.unshift({ id: command.id, hostId: memberId, stake: command.stake, moves: [], status: "waiting", updatedAt: at });
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
  if (room.moves[command.turn] === command.cell && markOnTurn(command.turn) === mark) return;
  if (room.status !== "playing" || room.moves.length !== command.turn || markOnTurn(command.turn) !== mark)
    throw new GameRuleError("Đã đổi lượt hoặc ván XO đã kết thúc", 409);
  if (room.moves.includes(command.cell)) throw new GameRuleError("Ô này đã được đánh", 409);
  room.moves.push(command.cell);
  room.updatedAt = at;
  if (xoWinningLine(xoBoard(room.moves))) finishRoom(games, room, at, "won", memberId);
  else if (room.moves.length === 9) finishRoom(games, room, at, "draw");
}
