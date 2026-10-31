import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../lib/actions";
import {
  addDays,
  closeWeek,
  createClub,
  makeSchedule,
  newEntry,
  scoreFor,
  syncWeeks,
  weekId,
  type Club,
  type Member,
} from "../lib/club";
import {
  activeAvailabilityDatasetFor,
  availabilityForDuty,
  personKey,
} from "../lib/availability";

const admin = {
  userId: "bcs-regression-owner",
  email: "bcs@example.invalid",
  displayName: "BĐH kiểm thử",
};
const settings = {
  month: "2026-11",
  anchorDate: "2026-11-09",
  anchorWeek: 11,
  startDate: "2026-11-09",
  amStart: "08:30",
  amEnd: "11:30",
  pmStart: "14:00",
  pmEnd: "17:30",
  allowedLateMinutes: 30,
};
function member(id: string): Member {
  return {
    id,
    name: id.length < 2 ? id + id : id,
    studentId: `SV${id}`,
    userId: id,
    role: "member",
    active: true,
    joined: "2026-01-01",
    availability: [],
    extraDuties: false,
  };
}
function fixture(): Club {
  const c = createClub(admin.userId);
  c.members = [
    { ...member("owner"), userId: admin.userId, role: "admin" },
    member("a"),
    member("b"),
    member("c"),
  ];
  c.rules = [{ month: "2000-01", A: 10, B: 20, C: 15, D: 5 }];
  syncWeeks(c);
  return c;
}
const rows = (names: string[], period = "Sáng") =>
  names.map((name, i) => ({
    sourceRow: i + 2,
    name: name.length < 2 ? name + name : name,
    day: "Thứ 2",
    period,
    weeks: "11-20",
    note: "",
  }));
function activate(c: Club) {
  applyAction(c, admin, "importAvailabilityDetails", {
    filename: "active.xlsx",
    rows: rows(["a", "b", "c"]),
  });
  applyAction(c, admin, "activateAvailabilityDetails", settings);
}

test("Uploading a detailed replacement stages it without changing published-shift eligibility", () => {
  const c = fixture();
  activate(c);
  const s = c.schedules.find((s) => s.month === settings.month)!;
  s.published = true;
  const shift = s.shifts.find((t) => t.id === "2026-11-09-am")!;
  const replacement = c.members.find(
    (m) =>
      ["a", "b", "c"].includes(m.id) &&
      !shift.assignments.some((a) => a.memberId === m.id),
  )!;
  const active = JSON.stringify(activeAvailabilityDatasetFor(c));
  applyAction(c, admin, "importAvailabilityDetails", {
    filename: "staged.xlsx",
    rows: rows(["a", "b", "c"], "Chiều"),
  });
  assert.equal(c.availabilityDataset?.filename, "staged.xlsx");
  assert.equal(JSON.stringify(activeAvailabilityDatasetFor(c)), active);
  assert.equal(
    availabilityForDuty(c, replacement, shift.date, shift.period, shift).available,
    true,
  );
  applyAction(c, admin, "shift", {
    month: s.month,
    shiftId: shift.id,
    position: 0,
    replacementId: replacement.id,
  });
  assert.equal(shift.assignments[0].memberId, replacement.id);
  assert.throws(
    () => applyAction(c, admin, "activateAvailabilityDetails", settings),
    /đã có lịch công bố/,
  );
  assert.equal(JSON.stringify(activeAvailabilityDatasetFor(c)), active);
  applyAction(c, admin, "activateAvailabilityDetails", {
    ...settings,
    month: "2026-12",
  });
  assert.equal(activeAvailabilityDatasetFor(c)?.filename, "staged.xlsx");
  assert.equal(
    availabilityForDuty(c, replacement, "2026-12-07", "am").available,
    false,
  );
  assert.equal(
    availabilityForDuty(c, replacement, "2026-12-07", "pm").available,
    true,
  );
});

test("Existing detailed datasets without an active snapshot remain effective until explicitly replaced", () => {
  const c = fixture();
  activate(c);
  delete c.activeAvailabilityDataset;
  const original = JSON.stringify(c.availabilityDataset);
  applyAction(c, admin, "importAvailabilityDetails", {
    filename: "next.xlsx",
    rows: rows(["a", "b", "c"], "Chiều"),
  });
  assert.equal(JSON.stringify(c.activeAvailabilityDataset), original);
  assert.equal(
    availabilityForDuty(c, c.members[1], "2026-11-09", "am").available,
    true,
  );
});

test("Importing weekly MSSV availability replaces the active detailed source", () => {
  const c = fixture();
  activate(c);
  applyAction(c, admin, "import", {
    kind: "availability",
    rows: ["a", "b", "c"].map((id) => ({
      studentId: `SV${id}`,
      name: id + id,
      availability: ["1-pm"],
    })),
  });
  const m = c.members[1];
  assert.equal(activeAvailabilityDatasetFor(c), undefined);
  assert.equal(availabilityForDuty(c, m, "2026-11-09", "am").available, false);
  assert.equal(availabilityForDuty(c, m, "2026-11-09", "pm").available, true);
  applyAction(c, admin, "schedule", { month: "2026-11" });
  const schedule = c.schedules.find((s) => s.month === "2026-11")!;
  assert.equal(schedule.sourceFilename, undefined);
  assert.ok(schedule.shifts.some((s) => s.date < settings.startDate));
  assert.ok(
    schedule.shifts.filter((s) => s.period === "pm").some((s) => s.assignments.length === 2),
  );
  assert.ok(schedule.shifts.filter((s) => s.period === "am").every((s) => !s.assignments.length));
});

test("Meeting scoring excludes joined-after and left-before records for absence, attendance and regulations", () => {
  const c = fixture();
  const lateJoin = c.members[1];
  const left = c.members[2];
  const valid = c.members[3];
  lateJoin.joined = "2026-11-12";
  left.left = "2026-11-10";
  left.active = false;
  for (const [id, meetingDate] of [
    ["2026-11-02", "2026-11-08"],
    ["2026-11-09", "2026-11-11"],
  ]) {
    c.weeks.push({
      id,
      meetingDate,
      time: "18:30",
      location: "C1",
      cancelled: false,
      closed: true,
      entries: [lateJoin, left, valid].map((m) => ({
        ...newEntry(m.id),
        status: id === "2026-11-02" ? "attending" : "absent",
        absent: id !== "2026-11-02",
        passed: id === "2026-11-02",
      })),
    });
  }
  assert.deepEqual(
    [scoreFor(c, lateJoin.id, "2026-11").meetingMissed, scoreFor(c, lateJoin.id, "2026-11").attended, scoreFor(c, lateJoin.id, "2026-11").passed],
    [0, 0, 0],
  );
  const leftScore = scoreFor(c, left.id, "2026-11");
  assert.equal(leftScore.meetingMissed, 0);
  assert.equal(leftScore.attended, 1);
  assert.equal(leftScore.passed, 1);
  assert.equal(leftScore.points, 0);
  assert.equal(scoreFor(c, valid.id, "2026-11").meetingMissed, 1);
  assert.equal(scoreFor(c, valid.id, "2026-11").points, -15);
});

test("Weekly syncing skips members outside the known meeting date without deleting verified history", () => {
  const c = fixture();
  const w = c.weeks.find((w) => w.id === weekId())!;
  const date = addDays(w.id, 1);
  w.meetingDate = w.id;
  const newcomer = member("latejoin");
  newcomer.joined = date;
  c.members.push(newcomer);
  const seeded = member("already-seeded");
  seeded.joined = date;
  c.members.push(seeded);
  w.entries.push(newEntry(seeded.id));
  const verified = member("verified-history");
  verified.joined = date;
  c.members.push(verified);
  w.entries.push({ ...newEntry(verified.id), attendanceVerified: true });
  syncWeeks(c, date);
  assert.equal(w.entries.some((e) => e.memberId === newcomer.id), false);
  assert.equal(w.entries.some((e) => e.memberId === seeded.id), false);
  assert.equal(w.entries.some((e) => e.memberId === verified.id), true);
  closeWeek(w);
  assert.equal(scoreFor(c, newcomer.id, w.meetingDate.slice(0, 7)).meetingMissed, 0);
  assert.equal(scoreFor(c, verified.id, w.meetingDate.slice(0, 7)).meetingMissed, 0);
});

test("First-turn matching covers every feasible member before allocating second turns, regardless of ID order", () => {
  for (const ids of [
    ["a-flex", "b-flex", "c-week11", "d-week12", "e-week13"],
    ["z-flex", "y-flex", "x-week11", "w-week12", "v-week13"],
  ]) {
    const c = createClub(admin.userId);
    c.days = [1];
    c.members = ids.map(member);
    const detailedRows = ids.map((name, i) => ({
      sourceRow: i + 2,
      name,
      day: "Thứ 2",
      period: "Sáng",
      weeks: i < 2 ? "11-13" : String(i + 9),
      note: "",
    }));
    c.activeAvailabilityDataset = {
      filename: "matching.xlsx",
      importedAt: "2026-10-31T00:00:00Z",
      importedBy: "BĐH",
      rows: detailedRows,
      settings: { ...settings, ignoreSourceNotes: true },
      memberLinks: Object.fromEntries(ids.map((id) => [personKey(id), id])),
    };
    const schedule = makeSchedule(c, "2026-11");
    const counts = new Map(ids.map((id) => [id, 0]));
    for (const shift of schedule.shifts) {
      assert.equal(new Set(shift.assignments.map((a) => a.memberId)).size, shift.assignments.length);
      assert.ok(shift.assignments.length <= 2);
      for (const assignment of shift.assignments) {
        counts.set(assignment.memberId, counts.get(assignment.memberId)! + 1);
        assert.equal(
          availabilityForDuty(c, c.members.find((m) => m.id === assignment.memberId)!, shift.date, shift.period, shift).available,
          true,
        );
      }
    }
    assert.ok([...counts.values()].every((n) => n >= 1));
    assert.equal([...counts.values()].reduce((a, b) => a + b), 6);
  }
});

test("First-turn matching keeps cancelled shifts empty and preserves their original restoration snapshot", () => {
  const c = fixture();
  c.members.forEach((m) => (m.availability = ["1-am", "1-pm"]));
  const cancelled = {
    id: "2026-11-09-am",
    date: "2026-11-09",
    period: "am" as const,
    assignments: [{ memberId: "a", result: "cancelled" as const }],
    cancelled: true,
    cancellationSnapshot: [{ memberId: "a", result: "completed" as const, note: "Giữ kết quả" }],
  };
  c.schedules = [{ month: "2026-11", published: false, shifts: [cancelled] }];
  const schedule = makeSchedule(c, "2026-11");
  assert.deepEqual(schedule.shifts.find((s) => s.id === cancelled.id), cancelled);
  assert.ok(schedule.shifts.filter((s) => !s.cancelled).some((s) => s.assignments.length === 2));
});

test("Both matching stages respect future join dates with weekly and detailed availability", () => {
  for (const detailed of [false, true]) {
    const c = fixture();
    c.days = [1];
    const future = member("future");
    future.joined = "2026-11-16";
    c.members.push(future);
    c.members.forEach((m) => (m.availability = ["1-am", "1-pm"]));
    if (detailed) {
      c.activeAvailabilityDataset = {
        filename: "future-join.xlsx",
        importedAt: "2026-10-31T00:00:00Z",
        importedBy: "BĐH",
        rows: rows(c.members.map((m) => m.name)),
        settings: { ...settings, ignoreSourceNotes: true },
        memberLinks: Object.fromEntries(
          c.members.map((m) => [personKey(m.name), m.id]),
        ),
      };
    }
    const schedule = makeSchedule(c, "2026-11");
    const assigned = schedule.shifts.filter((shift) =>
      shift.assignments.some((a) => a.memberId === future.id),
    );
    assert.ok(assigned.length >= 1);
    assert.ok(assigned.every((shift) => shift.date >= future.joined));
    assert.ok(
      schedule.shifts
        .filter((shift) => shift.date < future.joined)
        .every((shift) =>
          shift.assignments.every((a) => a.memberId !== future.id),
        ),
    );
  }
});
