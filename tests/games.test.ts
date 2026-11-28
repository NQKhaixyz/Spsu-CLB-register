import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, type Identity } from "../lib/actions";
import { createClub, syncWeeks, type Member } from "../lib/club";
import {
  applyGameCommand, drawWheelFactor, gamesView, parseGameCommand, WHEEL_FACTORS, wheelNetCents,
  xoBoard, xoWinningLine, type GameCommand, type WheelFactor,
} from "../lib/games";
import { eraseMemberData } from "../lib/member-deletion";
import { workspaceView } from "../lib/workspace-view";

const roomId = "01515568-323c-45c8-8915-3c7538796701";
const spinId = "c8f39f0d-6277-406f-ac57-e8ee4817eee2";

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

test("XO holds both stakes and a win pays exactly 1.95 once, even on replay", () => {
  const { host, guest, spectator, view, run, create, join, move } = fixture();
  create();
  run(host.id, { kind: "create", id: roomId, stake: 1, walletVersion: 0 });
  assert.equal(view(host.id).wallet.balanceCents, 999_900);
  assert.deepEqual(view(spectator.id).openRooms, [{ id: roomId, hostId: host.id, stake: 1 }]);
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
  move(0, 0);
  assert.throws(() => move(1, 0), /đã được đánh/);
  [3, 1, 4, 2].forEach((cell, index) => move(index + 1, cell));
  move(4, 2);
  assert.equal(view(host.id).ownRooms[0].winnerId, host.id);
  assert.deepEqual(xoWinningLine(xoBoard(view(host.id).ownRooms[0].moves)), [0, 1, 2]);
  assert.equal(view(host.id).wallet.balanceCents, 1_000_095);
  assert.equal(view(guest.id).wallet.balanceCents, 999_900);
  assert.throws(() => move(5, 5), /kết thúc/);
});

test("XO draw and a cancelled waiting room refund the respective stakes once", () => {
  const { host, guest, view, run, create, join, move } = fixture();
  create(100);
  join(100);
  [0, 1, 2, 4, 3, 5, 7, 6, 8].forEach((cell, index) => move(index, cell));
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
  for (let index = 0; index < 6; index++)
    run(host.id, { kind: "spin", id: crypto.randomUUID(), stake: 1, walletVersion: view(host.id).wallet.version }, 1);
  assert.equal(view(host.id).spins.length, 5);
  assert.throws(() => run(host.id, allRemaining, 6), /Số dư đã thay đổi/);
  assert.equal(view(host.id).wallet.balanceCents, 999_500);
});

test("Game commands require an integer wager, a current cursor, and a valid board position", () => {
  const valid = { kind: "spin", id: spinId, stake: 1, walletVersion: 0 };
  for (const stake of [-1, 0, 1.1, Number.MAX_SAFE_INTEGER, Infinity, "2", null])
    assert.throws(() => parseGameCommand({ ...valid, stake }), /số nguyên dương/);
  assert.deepEqual(parseGameCommand({ ...valid, factor: 2, balanceCents: 999_999, memberId: "someone-else" }), valid);
  assert.throws(() => parseGameCommand({ ...valid, walletVersion: -1 }), /không hợp lệ/);
  assert.throws(() => parseGameCommand({ kind: "move", id: roomId, cell: 9, turn: 0 }), /không hợp lệ/);
  assert.throws(() => parseGameCommand({ kind: "move", id: roomId, cell: 0, turn: 9 }), /không hợp lệ/);
});
