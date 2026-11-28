import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, type Identity } from "../lib/actions";
import { createClub, syncWeeks, type Member } from "../lib/club";
import {
  applyGameCommand, creditsRanking, drawWheelFactor, formatCredits, gamesView, parseGameCommand,
  wheelFactorForRoll, WHEEL_FACTORS, WHEEL_REFUND_EVERY, wheelNetCents, xoBoard, xoWinningLine, XO_BOARD_SIZE,
  type GameCommand, type Mark, type WheelFactor,
} from "../lib/games";
import { eraseMemberData } from "../lib/member-deletion";
import { workspaceView } from "../lib/workspace-view";

const roomId = "01515568-323c-45c8-8915-3c7538796701";
const spinId = "c8f39f0d-6277-406f-ac57-e8ee4817eee2";
const horizontalWin = [395, 0, 396, 20, 397, 40, 398, 60, 399];

function fixture() {
  const [owner, host, guest, spectator] = ["owner", "host", "guest", "spectator"].map((id, index): Member => ({
    id, name: id, studentId: "GAMES-" + index, userId: "account-" + id, role: index === 0 ? "admin" : "member",
    active: true, joined: "2020-01-01", availability: [], extraDuties: false,
  }));
  const club = createClub(owner.userId!);
  club.members = [owner, host, guest, spectator];
  syncWeeks(club);
  let next = Date.now() - 60_000;
  const view = (id: string) => gamesView(club, id, 1);
  const run = (id: string, command: GameCommand, factor?: WheelFactor) =>
    applyGameCommand(club, id, command, next++, factor);
  const create = (stake = 1) => run(host.id, { kind: "create", id: roomId, stake, walletVersion: view(host.id).wallet.version });
  const join = (stake = 1) => run(guest.id, { kind: "join", id: roomId, stake, walletVersion: view(guest.id).wallet.version });
  const move = (turn: number, cell: number) => run(turn % 2 === 0 ? host.id : guest.id, { kind: "move", id: roomId, turn, cell });
  const identity = (member: Member): Identity => ({ userId: member.userId!, displayName: member.name, email: "" });
  return { club, owner, host, guest, spectator, view, run, create, join, move, identity };
}

test("Both account roles start with 10,000 game credits and wallets stay out of workspace responses", () => {
  const { club, owner, host, guest, identity, run, view } = fixture();
  assert.equal(view(owner.id).wallet.balanceCents, 1_000_000);
  assert.equal(view(host.id).wallet.balanceCents, 1_000_000);
  assert.equal(view(host.id).wallet.maxWheelStake, 2_000);
  assert.equal(club.games, undefined);
  run(guest.id, { kind: "spin", id: spinId, stake: 1, walletVersion: 0 }, -4);
  assert.equal(view(host.id).wallet.balanceCents, 1_000_000);
  assert.equal(view(host.id).spins.length, 0);
  assert.equal(view(guest.id).wallet.balanceCents, 999_500);
  for (const member of [owner, host, guest]) assert.equal("games" in workspaceView(club, identity(member), 1).club, false);
});

test("Credits ranking includes active accounts, shares ranks for equal balances, and reflects game settlements", () => {
  const { club, owner, host, guest, spectator, identity, view, run, create, join, move } = fixture();
  guest.name = "Châu";
  owner.name = "An";
  host.name = "Bình";
  spectator.name = "Dũng";
  club.members.push(
    { ...spectator, id: "unregistered", userId: undefined },
    { ...spectator, id: "disabled-test", userId: "native:test-member" },
  );
  club.testAccountsDisabled = true;
  const initial = creditsRanking(club, 8);
  assert.equal(initial.revision, 8);
  assert.deepEqual(initial.rows.map(row => [row.name, row.balanceCents, row.rank]), [
    ["An", 1_000_000, 1], ["Bình", 1_000_000, 1], ["Châu", 1_000_000, 1], ["Dũng", 1_000_000, 1],
  ]);
  assert.equal(club.games, undefined);

  create();
  join();
  horizontalWin.forEach((cell, turn) => move(turn, cell));
  assert.deepEqual(creditsRanking(club, 9).rows.map(row => [row.memberId, row.balanceCents, row.rank]), [
    [host.id, 1_000_095, 1], [owner.id, 1_000_000, 2], [spectator.id, 1_000_000, 2], [guest.id, 999_900, 4],
  ]);
  assert.equal(formatCredits(view(host.id).wallet.balanceCents), "10.000,95");
  run(guest.id, { kind: "spin", id: spinId, stake: 1, walletVersion: view(guest.id).wallet.version }, 6);
  assert.deepEqual(creditsRanking(club, 10).rows[0], { memberId: guest.id, name: guest.name, balanceCents: 1_000_400, rank: 1 });
  applyAction(club, identity(owner), "member", { memberId: guest.id, active: false });
  assert.deepEqual(creditsRanking(club, 11).rows.map(row => row.memberId), [host.id, owner.id, spectator.id]);
});

test("XO holds both stakes and a win pays exactly 1.95 once, even on replay", () => {
  const { host, guest, spectator, view, run, create, join, move } = fixture();
  create();
  run(host.id, { kind: "create", id: roomId, stake: 1, walletVersion: 0 });
  assert.equal(view(host.id).wallet.balanceCents, 999_900);
  assert.deepEqual(view(spectator.id).openRooms, [{ id: roomId, hostId: host.id, stake: 1, size: 20 }]);
  assert.throws(() => run(host.id, { kind: "join", id: roomId, stake: 1, walletVersion: 1 }), /người tạo/);
  assert.throws(() => run(guest.id, { kind: "join", id: roomId, stake: 2, walletVersion: 0 }), /Mức cược/);
  join();
  run(guest.id, { kind: "join", id: roomId, stake: 1, walletVersion: 0 });
  assert.equal(view(guest.id).wallet.balanceCents, 999_900);
  assert.equal(view(spectator.id).openRooms.length, 0);
  assert.equal(view(spectator.id).ownRooms.length, 0);
  assert.throws(() => run(spectator.id, { kind: "move", id: roomId, turn: 0, cell: 8 }), /Không tìm thấy/);
  assert.throws(() => run(guest.id, { kind: "move", id: roomId, turn: 0, cell: 8 }), /đổi lượt/);
  assert.throws(() => run(host.id, { kind: "create", id: spinId, stake: 1, walletVersion: 1 }), /đang có phòng/);
  move(0, horizontalWin[0]);
  assert.throws(() => move(1, horizontalWin[0]), /đã được đánh/);
  horizontalWin.slice(1, -1).forEach((cell, index) => move(index + 1, cell));
  assert.equal(view(host.id).ownRooms[0].status, "playing");
  move(8, 399);
  move(8, 399);
  assert.equal(view(host.id).ownRooms[0].winnerId, host.id);
  assert.deepEqual(xoWinningLine(xoBoard(view(host.id).ownRooms[0].moves, 20), 20, 399), [395, 396, 397, 398, 399]);
  assert.equal(view(host.id).wallet.balanceCents, 1_000_095);
  assert.equal(view(guest.id).wallet.balanceCents, 999_900);
  assert.throws(() => move(9, 5), /kết thúc/);
});

test("XO draw and a cancelled waiting room refund the respective stakes once", () => {
  const { host, guest, view, run, create, join, move } = fixture();
  create(100);
  join(100);
  const cells = Array.from({ length: XO_BOARD_SIZE ** 2 }, (_, cell) => cell);
  const markFor = (cell: number) => (Math.floor((cell % 20) / 2) + Math.floor(cell / 20)) % 2;
  const seats = [cells.filter(cell => markFor(cell) === 0), cells.filter(cell => markFor(cell) === 1)];
  for (const [turn, cell] of cells.entries()) {
    assert.equal(view(host.id).ownRooms[0].status, "playing");
    move(turn, seats[turn % 2][Math.floor(cell / 2)]);
  }
  assert.equal(view(host.id).ownRooms[0].status, "draw");
  assert.equal(view(host.id).wallet.balanceCents, 1_000_000);
  assert.equal(view(guest.id).wallet.balanceCents, 1_000_000);
  run(host.id, { kind: "create", id: spinId, stake: 50, walletVersion: 2 });
  assert.equal(view(host.id).wallet.balanceCents, 995_000);
  run(host.id, { kind: "cancel", id: spinId });
  run(host.id, { kind: "cancel", id: spinId });
  assert.equal(view(host.id).wallet.balanceCents, 1_000_000);
  assert.equal(view(host.id).ownRooms[0].status, "cancelled");
});

test("XO surrender counts as a loss and pauses and deletions release the other stake", () => {
  const { club, owner, host, guest, identity, view, run, create, join } = fixture();
  create(20);
  join(20);
  run(host.id, { kind: "surrender", id: roomId });
  run(host.id, { kind: "surrender", id: roomId });
  assert.equal(view(host.id).wallet.balanceCents, 998_000);
  assert.equal(view(guest.id).wallet.balanceCents, 1_001_900);
  run(guest.id, { kind: "create", id: spinId, stake: 100, walletVersion: 2 });
  run(host.id, { kind: "join", id: spinId, stake: 100, walletVersion: 1 });
  applyAction(club, identity(owner), "member", { memberId: guest.id, active: false });
  assert.equal(view(host.id).ownRooms[0].finishReason, "unavailable");
  assert.equal(view(host.id).wallet.balanceCents, 998_000);
  assert.equal(view(guest.id).wallet.balanceCents, 1_001_900);
  assert.throws(() => run(guest.id, { kind: "spin", id: roomId, stake: 1, walletVersion: 4 }, 1), /tạm nghỉ/);
  eraseMemberData(club, owner, guest);
  assert.ok(!Object.hasOwn(club.games!.wallets, guest.id));
  assert.equal(view(host.id).ownRooms.length, 0);
  assert.equal(view(host.id).wallet.balanceCents, 998_000);
});

test("Wheel arithmetic produces −5 to +5 credits on a stake of one", () => {
  assert.deepEqual(WHEEL_FACTORS.map(factor => wheelNetCents(1, factor)), [-500, -400, -300, -200, -100, 0, 100, 200, 300, 400, 500]);
  for (let index = 0; index < 30; index++) assert.ok(WHEEL_FACTORS.includes(drawWheelFactor()));
  const { host, guest, view, run } = fixture();
  const lose = { kind: "spin", id: spinId, stake: 1, walletVersion: 0 } as const;
  const first = run(host.id, lose, -4);
  assert.equal(first?.netCents, -500);
  assert.deepEqual(run(host.id, lose, 6), first);
  assert.equal(view(host.id).wallet.balanceCents, 999_500);
  assert.equal(run(guest.id, lose, 6)?.netCents, 500);
  assert.equal(view(guest.id).wallet.balanceCents, 1_000_500);
  assert.throws(() => run(host.id, { ...lose, stake: 2 }, 6), /mức cược khác/);
  assert.throws(() => run(host.id, { ...lose, id: roomId }, 6), /Số dư đã thay đổi/);
});

test("Wheel rejects a possible overdraft and protects old retries after recent results roll over", () => {
  const { host, run, view, create } = fixture();
  create(9_995);
  assert.equal(view(host.id).wallet.maxWheelStake, 1);
  assert.throws(() => run(host.id, { kind: "spin", id: spinId, stake: 2, walletVersion: 1 }, 6), /không đủ/);
  const allRemaining = { kind: "spin", id: spinId, stake: 1, walletVersion: 1 } as const;
  run(host.id, allRemaining, -4);
  assert.equal(view(host.id).wallet.balanceCents, 0);
  run(host.id, { kind: "cancel", id: roomId });
  assert.equal(view(host.id).wallet.balanceCents, 999_500);
  for (let index = 0; index <= WHEEL_REFUND_EVERY; index++)
    run(host.id, { kind: "spin", id: crypto.randomUUID(), stake: 1, walletVersion: view(host.id).wallet.version }, 1);
  assert.equal(view(host.id).spins.length, 10);
  assert.throws(() => run(host.id, allRemaining, 6), /Số dư đã thay đổi/);
  assert.equal(view(host.id).wallet.balanceCents, 999_750);
});

test("Game commands require an integer wager, a current cursor, and a valid board position", () => {
  const valid = { kind: "spin", id: spinId, stake: 1, walletVersion: 0 };
  for (const stake of [-1, 0, 1.1, Number.MAX_SAFE_INTEGER, Infinity, "2", null])
    assert.throws(() => parseGameCommand({ ...valid, stake }), /số nguyên dương/);
  assert.deepEqual(parseGameCommand({ ...valid, factor: 2, balanceCents: 999_999, memberId: "someone-else" }), valid);
  assert.throws(() => parseGameCommand({ ...valid, walletVersion: -1 }), /không hợp lệ/);
  const last = { kind: "move", id: roomId, cell: 399, turn: 399 };
  assert.deepEqual(parseGameCommand(last), last);
  assert.throws(() => parseGameCommand({ ...last, cell: 400 }), /không hợp lệ/);
  assert.throws(() => parseGameCommand({ ...last, turn: 400 }), /không hợp lệ/);
});

test("20×20 XO detects vertical and both diagonal lines without wrapping at the edge", () => {
  const lineFor = (cells: number[], latest: number) => {
    const board: (Mark | null)[] = Array(400).fill(null);
    cells.forEach(cell => { board[cell] = "O"; });
    return xoWinningLine(board, 20, latest);
  };
  for (const line of [[14, 34, 54, 74, 94], [231, 252, 273, 294, 315], [19, 38, 57, 76, 95], [7, 8, 9, 10, 11, 12]]) {
    assert.deepEqual(lineFor(line, line[2]), line);
  }
  assert.equal(lineFor([18, 19, 20, 21, 22], 20), undefined);
  assert.equal(lineFor([14, 34, 54, 74], 74), undefined);
});

test("Legacy XO rooms finish with 3×3 rules and keep their payouts", () => {
  const { club, host, guest, view, create, join, move } = fixture();
  create();
  assert.equal(gamesView(club, guest.id, 1, true).openRooms.length, 0);
  delete club.games!.rooms[0].size;
  assert.equal(gamesView(club, guest.id, 1, true).openRooms[0].size, 3);
  join();
  assert.throws(() => move(0, 9), /ngoài bàn cờ/);
  [0, 3, 1, 4, 2].forEach((cell, turn) => move(turn, cell));
  assert.equal(view(host.id).ownRooms[0].status, "won");
  assert.equal(view(host.id).wallet.balanceCents, 1_000_095);
});

test("Each wheel factor gets one equal roll and the biased random tail is rejected", ({ mock }) => {
  const outcomes = Array.from({ length: 11 }, (_, roll) => wheelFactorForRoll(roll));
  assert.deepEqual(outcomes, WHEEL_FACTORS);
  for (const roll of [-1, 10.5, 11, NaN]) assert.throws(() => wheelFactorForRoll(roll), RangeError);
  const values = [4_294_967_295, 4_294_967_291];
  const random = mock.method(crypto, "getRandomValues", <T extends ArrayBufferView | null>(buffer: T): T => {
    const value = values.shift();
    assert.ok(buffer instanceof Uint32Array && value !== undefined);
    buffer[0] = value;
    return buffer;
  });
  assert.equal(drawWheelFactor(), 6);
  assert.equal(random.mock.callCount(), 2);
});

test("Every ten wheel turns settle half the net loss once and profitable groups refund zero", () => {
  const { host, guest, view, run } = fixture();
  const play = (stake: number, factor: WheelFactor, id: string = crypto.randomUUID()) => {
    const command = { kind: "spin", id, stake, walletVersion: view(host.id).wallet.version } as const;
    return { command, spin: run(host.id, command, factor) };
  };
  play(1, -4);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 1, pendingRefundCents: 250 });
  play(1, 6);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 2, pendingRefundCents: 0 });
  play(2, -1);
  for (let turn = 3; turn < 9; turn++) assert.equal(play(1, 1).spin?.refundCents, undefined);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 9, pendingRefundCents: 200 });
  assert.equal(view(host.id).wallet.balanceCents, 999_600);
  const { command, spin } = play(1, 0, spinId);
  assert.equal(spin?.netCents, -100);
  assert.equal(spin?.refundCents, 250);
  assert.equal(view(host.id).wallet.balanceCents, 999_750);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 0, pendingRefundCents: 0 });
  assert.deepEqual(run(host.id, command, -4), spin);
  assert.equal(view(host.id).wallet.balanceCents, 999_750);
  play(3, 0);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 1, pendingRefundCents: 150 });
  assert.deepEqual(view(guest.id).wheelProgress, { spins: 0, pendingRefundCents: 0 });
  play(1, 6);
  play(1, 2);
  for (let turn = 3; turn < 9; turn++) play(1, 1);
  const profitable = play(1, 1).spin;
  assert.equal(profitable?.refundCents, undefined);
  assert.equal(view(host.id).wallet.balanceCents, 1_000_050);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 0, pendingRefundCents: 0 });
  for (const factor of [0, 2, 1, 1, 1, 1, 1, 1, 1, 1] as const) assert.equal(play(1, factor).spin?.refundCents, undefined);
  assert.equal(view(host.id).wallet.balanceCents, 1_000_050);
});
