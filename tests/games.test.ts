import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, type Identity } from "../lib/actions";
import { createClub, syncWeeks, type Member } from "../lib/club";
import {
  adjustGameCredits, applyCoinFlip, applyGameCommand, creditRecipients, creditsRanking, drawWheelFactor, formatCredits, gamesView, parseCreditAdjustment,
  parseCreditAmount, parseGameCommand, settleWeeklyCreditInactivity,
  wheelFactorForRoll, WHEEL_FACTORS, WHEEL_REFUND_EVERY, wheelNetCents, xoBoard, xoWinningLine, XO_BOARD_SIZE,
  type CoinFlipCommand, type GameCommand, type Mark, type WheelFactor,
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

test("Coinflip uses the game wallet, returns 1.9 times the stake on wins and settles each round once", () => {
  const { club, host, guest, view, run } = fixture();
  const command: CoinFlipCommand = { kind: "flip", id: crypto.randomUUID(), stake: 7, pick: "one", walletVersion: 0 };
  assert.deepEqual(parseGameCommand(command), command);
  assert.throws(() => parseGameCommand({ ...command, pick: "other" }), /Chọn một mặt/);
  for (const stake of [0, -1, 2.5, "1", Infinity])
    assert.throws(() => parseGameCommand({ ...command, stake }), /số nguyên dương/);
  assert.equal(view(host.id).wallet.maxCoinflipStake, 10_000);
  const won = applyCoinFlip(club, host.id, command, "one", 11);
  assert.equal(won.netCents, 630);
  assert.equal(won.balanceCents, 1_000_630);
  assert.deepEqual(applyCoinFlip(club, host.id, command, "two", 12), won);
  assert.throws(() => applyCoinFlip(club, host.id, { ...command, pick: "two" }, "two", 13), /lựa chọn khác/);
  const next = { ...command, id: crypto.randomUUID(), walletVersion: 1 };
  const lost = applyCoinFlip(club, host.id, next, "two", 14);
  assert.equal(lost.netCents, -700);
  assert.equal(lost.balanceCents, 999_930);
  assert.deepEqual(view(host.id).flips, [lost, won]);
  assert.deepEqual(view(guest.id).flips, []);
  assert.equal(view(guest.id).wallet.balanceCents, 1_000_000);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 0, pendingRefundCents: 0 });
  run(host.id, { kind: "spin", id: spinId, stake: 1, walletVersion: 2 }, 1);
  assert.throws(() => applyCoinFlip(club, host.id, { ...next, id: crypto.randomUUID(), walletVersion: 2 }, "two", 15), /Số dư đã thay đổi/);
  assert.throws(() => applyCoinFlip(club, host.id, { ...next, id: crypto.randomUUID(), walletVersion: 3, stake: 10_000 }, "two", 16), /vượt số credits/);
});

test("Credit inactivity settles each complete Vietnam week once and caps the charge at the available balance", () => {
  const { club, host, guest, spectator, view } = fixture();
  const local = (date: string) => Date.parse(date + "+07:00");
  const first = local("2026-11-28T15:00:00");
  const opening = local("2026-11-30T00:00:00");
  const ending = local("2026-12-07T00:00:00");
  assert.equal(settleWeeklyCreditInactivity(club, first), true);
  assert.equal(settleWeeklyCreditInactivity(club, opening), true);
  assert.equal(view(guest.id).wallet.balanceCents, 1_000_000);
  adjustGameCredits(club, { operationId: crypto.randomUUID(), memberId: spectator.id, mode: "set", amountCents: 25_000, walletVersion: 0 },
    "issuer", first + 10);
  applyCoinFlip(club, host.id, { kind: "flip", id: crypto.randomUUID(), stake: 1, pick: "one", walletVersion: 0 }, "two", ending - 1);
  applyGameCommand(club, guest.id, { kind: "spin", id: spinId, stake: 1, walletVersion: 0 }, ending - 1, 1);
  assert.equal(settleWeeklyCreditInactivity(club, ending - 1), false);
  assert.equal(settleWeeklyCreditInactivity(club, ending), true);
  assert.equal(view(host.id).wallet.balanceCents, 999_900);
  assert.equal(view(guest.id).wallet.balanceCents, 900_000);
  assert.deepEqual(view(guest.id).inactivityCharge, { week: "2026-11-30", amountCents: 100_000 });
  assert.equal(view(spectator.id).wallet.balanceCents, 0);
  assert.deepEqual(view(spectator.id).inactivityCharge, { week: "2026-11-30", amountCents: 25_000 });
  assert.equal(settleWeeklyCreditInactivity(structuredClone(club), ending + 10), false);
  assert.equal(settleWeeklyCreditInactivity(club, ending + 7 * 86_400_000), true);
  assert.equal(view(guest.id).wallet.balanceCents, 800_000);
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

test("Issuer wallet adjustments are idempotent and preserve rewards, exact credits and concurrent play", () => {
  const { club, host, guest, view, run } = fixture();
  host.name = guest.name = "Nguyễn Minh Đức";
  run(host.id, { kind: "spin", id: spinId, stake: 1, walletVersion: 0 }, -4);
  const original = view(host.id).wallet.balanceCents;
  const initialVersion = view(host.id).wallet.version;
  const command = parseCreditAdjustment({ operationId: roomId, memberId: host.id, mode: "add", amountCents: 700_000, walletVersion: initialVersion });
  const grant = adjustGameCredits(club, command, "issuer", 101);
  assert.equal(grant.changed, true);
  assert.equal(grant.result.receipt.beforeCents, original);
  assert.equal(grant.result.balanceCents, original + 700_000);
  assert.equal(creditsRanking(club, 1).rows[0].memberId, host.id);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 1, pendingRefundCents: 225 });
  assert.deepEqual(adjustGameCredits(club, command, "issuer", 102), { changed: false, result: grant.result });
  assert.throws(() => adjustGameCredits(club, { ...command, memberId: guest.id }, "issuer", 103), /đã được sử dụng/);
  assert.throws(() => adjustGameCredits(club, { ...command, amountCents: 100 }, "issuer", 103), /đã được sử dụng/);
  assert.throws(() => parseCreditAdjustment({ ...command, amountCents: -1 }), /lớn hơn 0/);
  const subtract = parseCreditAdjustment({ ...command, operationId: crypto.randomUUID(), mode: "subtract", amountCents: 25 });
  assert.throws(() => adjustGameCredits(club, subtract, "issuer", 104), /Số dư vừa thay đổi/);
  const reduced = adjustGameCredits(club, { ...subtract, walletVersion: grant.result.walletVersion }, "issuer", 104);
  assert.equal(reduced.result.balanceCents, grant.result.balanceCents - 25);
  assert.throws(() => adjustGameCredits(club, {
    ...subtract, operationId: crypto.randomUUID(), amountCents: reduced.result.balanceCents + 1, walletVersion: reduced.result.walletVersion,
  }, "issuer", 105), /lớn hơn số dư/);
  const cleared = adjustGameCredits(club, parseCreditAdjustment({
    ...command, operationId: crypto.randomUUID(), mode: "set", amountCents: 0, walletVersion: reduced.result.walletVersion,
  }), "issuer", 106);
  assert.equal(cleared.result.balanceCents, 0);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 1, pendingRefundCents: 225 });
  assert.equal(parseCreditAmount("25,01"), 2501);
  assert.equal(parseCreditAmount("0.95"), 95);
  assert.equal(parseCreditAmount("1.005"), undefined);
  assert.deepEqual(creditRecipients(club).filter(item => item.name === host.name).map(item => item.identifier).sort(),
    [host.studentId, guest.studentId].sort());
  guest.active = false;
  assert.throws(() => adjustGameCredits(club, { ...command, operationId: spinId, memberId: guest.id }, "issuer", 107), /tạm nghỉ/);
  assert.ok(!creditRecipients(club).some(item => item.memberId === guest.id));
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
  for (let index = 0; index < 10; index++)
    run(host.id, { kind: "spin", id: crypto.randomUUID(), stake: 1, walletVersion: view(host.id).wallet.version }, 1);
  assert.equal(view(host.id).spins.length, 10);
  assert.throws(() => run(host.id, allRemaining, 6), /Số dư đã thay đổi/);
  assert.equal(view(host.id).wallet.balanceCents, 999_725);
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

test("Every ten wheel turns settle 45 percent of the net loss once and profitable groups refund zero", () => {
  const { host, guest, view, run } = fixture();
  assert.equal(WHEEL_REFUND_EVERY, 10);
  const play = (stake: number, factor: WheelFactor, id: string = crypto.randomUUID()) => {
    const command = { kind: "spin", id, stake, walletVersion: view(host.id).wallet.version } as const;
    return { command, spin: run(host.id, command, factor) };
  };
  play(1, -4);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 1, pendingRefundCents: 225 });
  play(1, 6);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 2, pendingRefundCents: 0 });
  play(2, -1);
  for (let turn = 3; turn < 9; turn++) assert.equal(play(1, 1).spin?.refundCents, undefined);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 9, pendingRefundCents: 180 });
  assert.equal(view(host.id).wallet.balanceCents, 999_600);
  const { command, spin } = play(1, 0, spinId);
  assert.equal(spin?.netCents, -100);
  assert.equal(spin?.refundCents, 225);
  assert.equal(view(host.id).wallet.balanceCents, 999_725);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 0, pendingRefundCents: 0 });
  assert.deepEqual(run(host.id, command, -4), spin);
  assert.equal(view(host.id).wallet.balanceCents, 999_725);
  play(3, 0);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 1, pendingRefundCents: 135 });
  assert.deepEqual(view(guest.id).wheelProgress, { spins: 0, pendingRefundCents: 0 });
  play(1, 6);
  play(1, 2);
  for (let turn = 3; turn < 9; turn++) play(1, 1);
  const profitable = play(1, 1).spin;
  assert.equal(profitable?.refundCents, undefined);
  assert.equal(view(host.id).wallet.balanceCents, 1_000_025);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 0, pendingRefundCents: 0 });
  for (const factor of [0, 2, 1, 1, 1, 1, 1, 1, 1, 1] as const) assert.equal(play(1, factor).spin?.refundCents, undefined);
  assert.equal(view(host.id).wallet.balanceCents, 1_000_025);
});

test("Incomplete five-turn groups keep their accrued loss and continue to the tenth spin", () => {
  const { club, host, guest, view, run } = fixture();
  club.games = { rooms: [], wallets: {
    [host.id]: { balanceCents: 999_500, version: 4, spins: [], wheelProgress: { spins: 4, netCredits: -5 } },
    [guest.id]: { balanceCents: 999_500, version: 9, spins: [], wheelProgress: { spins: 9, netCredits: -5 } },
  } };
  assert.deepEqual(view(guest.id).wheelProgress, { spins: 9, pendingRefundCents: 225 });
  const spin = (id: string) =>
    run(id, { kind: "spin", id: crypto.randomUUID(), stake: 1, walletVersion: view(id).wallet.version }, 1);
  assert.equal(spin(host.id)?.refundCents, undefined);
  assert.deepEqual(view(host.id).wheelProgress, { spins: 5, pendingRefundCents: 225 });
  assert.equal(spin(guest.id)?.refundCents, 225);
  assert.deepEqual(view(guest.id).wheelProgress, { spins: 0, pendingRefundCents: 0 });
  spin(guest.id);
  assert.equal(view(guest.id).wheelProgress.spins, 1);
});
