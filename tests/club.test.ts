import test from "node:test";
import "./password.test";
import assert from "node:assert/strict";
import {
  addDays,
  closeWeek,
  createClub,
  makeSchedule,
  newEntry,
  rulesFor,
  scoreFor,
  syncWeeks,
  today,
  weekId,
  weekday,
  type Club,
  type Member,
} from "../lib/club";
import { applyAction } from "../lib/actions";
import { canInitializeClub } from "../lib/access";
import {
  academicWeekFor,
  availabilityForDuty,
  weekMatches,
} from "../lib/availability";
import { makeReport, readImport, readAvailabilityUpload } from "../lib/excel";

test("Public visitors cannot claim ownership before the configured owner", () => {
  assert.equal(
    canInitializeClub("owner@example.com", "stranger@example.com"),
    false,
  );
  assert.equal(canInitializeClub(undefined, "stranger@example.com"), false);
  assert.equal(canInitializeClub("", "stranger@example.com"), false);
  assert.equal(
    canInitializeClub("owner@example.com", "OWNER@example.com"),
    true,
  );
});

const adminIdentity = {
  userId: "owner",
  email: "owner@example.com",
  displayName: "Chủ nhiệm",
};
const memberIdentity = {
  userId: "student",
  email: "student@example.com",
  displayName: "Thành viên",
};
function fixture(): Club {
  const c = createClub(adminIdentity.userId);
  syncWeeks(c);
  applyAction(c, adminIdentity, "profile", {
    name: "Chủ nhiệm",
    studentId: "BCS001",
  });
  applyAction(c, memberIdentity, "profile", {
    name: "Thành viên",
    studentId: "SV0001",
  });
  return c;
}
test("Vietnam midnight and Monday–Sunday boundaries", () => {
  assert.equal(today(new Date("2026-11-01T16:59:59Z")), "2026-11-01");
  assert.equal(today(new Date("2026-11-01T17:00:00Z")), "2026-11-02");
  assert.equal(weekId("2026-11-01"), "2026-10-26");
  assert.equal(weekId("2026-11-02"), "2026-11-02");
});
test("First owner becomes BCS; normal profile cannot choose admin", () => {
  const c = fixture();
  assert.equal(c.members[0].role, "admin");
  assert.equal(c.members[1].role, "member");
  assert.throws(
    () => applyAction(c, memberIdentity, "settings", { name: "Hacked" }),
    /BCS/,
  );
});
test("An imported MSSV cannot be claimed through profile updates", () => {
  const c = fixture();
  applyAction(c, adminIdentity, "member", {
    name: "Người khác",
    studentId: "SV0002",
    email: "known@example.com",
  });
  assert.throws(
    () =>
      applyAction(c, { ...memberIdentity, userId: "other" }, "profile", {
        name: "Giả mạo",
        studentId: "SV0002",
      }),
    /MSSV/,
  );
});
test("Empty or matching emails cannot link another imported profile", () => {
  for (const email of ["", memberIdentity.email]) {
    const c = fixture();
    applyAction(c, adminIdentity, "member", {
      name: "Thành viên được nhập",
      studentId: "IMPORTED001",
      email,
    });
    const before = JSON.stringify(c);
    assert.throws(
      () =>
        applyAction(c, { ...memberIdentity, email }, "profile", {
          name: "Người nhận nhầm",
          studentId: "IMPORTED001",
        }),
      /BCS/,
    );
    assert.equal(JSON.stringify(c), before);
  }
});
test("Inactive members cannot update their profile", () => {
  const c = fixture();
  c.members[1].active = false;
  assert.throws(
    () =>
      applyAction(c, memberIdentity, "profile", {
        name: "Đổi tên",
        studentId: "SV0001",
      }),
    /ngừng hoạt động/,
  );
});
test("Absence requires a reason and returning requires approval", () => {
  const c = fixture();
  assert.throws(
    () =>
      applyAction(c, memberIdentity, "register", {
        status: "absent",
        reason: " ",
      }),
    /lý do/,
  );
  applyAction(c, memberIdentity, "register", {
    status: "absent",
    reason: "Lịch học bù",
  });
  assert.throws(
    () => applyAction(c, memberIdentity, "register", { status: "attending" }),
    /BCS/,
  );
  applyAction(c, memberIdentity, "register", {
    status: "pending",
    reason: "Em đã đổi lịch",
  });
  const e = c.weeks.at(-1)!.entries[1];
  assert.equal(e.status, "pending");
  assert.equal(e.absent, undefined);
});
test("Approval updates status once and rejects a second decision", () => {
  const c = fixture();
  applyAction(c, memberIdentity, "register", {
    status: "absent",
    reason: "Bận học",
  });
  applyAction(c, memberIdentity, "register", {
    status: "pending",
    reason: "Đã rảnh",
  });
  const data = { week: weekId(), memberId: c.members[1].id, approved: true };
  applyAction(c, adminIdentity, "review", data);
  assert.equal(c.weeks.at(-1)!.entries[1].status, "attending");
  assert.throws(
    () => applyAction(c, adminIdentity, "review", data),
    /đã được xử lý/,
  );
});
test("Closing handles unregistered and pending separately, preserving excuse", () => {
  const c = fixture();
  applyAction(c, memberIdentity, "register", {
    status: "absent",
    reason: "Bận học",
  });
  applyAction(c, memberIdentity, "register", {
    status: "pending",
    reason: "Đã rảnh",
  });
  const w = c.weeks.at(-1)!;
  closeWeek(w);
  assert.equal(w.entries[0].status, "absent");
  assert.equal(w.entries[0].excused, false);
  assert.equal(w.entries[1].status, "absent");
  assert.equal(w.entries[1].excused, true);
  assert.match(w.entries[1].decision!, /Chưa được duyệt/);
  const before = JSON.stringify(w);
  closeWeek(w);
  assert.equal(JSON.stringify(w), before);
});
test("End of week auto-closes before opening next week", () => {
  const c = fixture();
  const old = c.weeks.at(-1)!;
  syncWeeks(c, addDays(old.id, 7));
  assert.equal(old.closed, true);
  assert.equal(c.weeks.at(-1)!.id, addDays(old.id, 7));
});
test("Meeting date must stay within the selected week", () => {
  const c = fixture();
  assert.throws(
    () =>
      applyAction(c, adminIdentity, "meeting", {
        week: weekId(),
        meetingDate: addDays(weekId(), 7),
        time: "18:30",
        location: "C1",
      }),
    /trong tuần/,
  );
});
test("Cancelled weeks do not deduct meeting points", () => {
  const c = fixture();
  const w = c.weeks.at(-1)!;
  w.meetingDate = today();
  w.cancelled = true;
  closeWeek(w);
  c.rules = [{ month: "2000-01", A: 10, B: 15, C: 5, D: 0 }];
  assert.equal(scoreFor(c, c.members[0].id, today().slice(0, 7)).points, 0);
});
test("Cross-month meetings are counted by meeting date", () => {
  const c = fixture();
  c.weeks = [
    {
      id: "2026-10-26",
      meetingDate: "2026-11-01",
      time: "18:30",
      location: "C1",
      closed: false,
      cancelled: false,
      entries: [newEntry(c.members[0].id)],
    },
  ];
  closeWeek(c.weeks[0]);
  c.rules = [{ month: "2000-01", A: 10, B: 15, C: 5, D: 0 }];
  assert.equal(scoreFor(c, c.members[0].id, "2026-10").points, 0);
  assert.equal(scoreFor(c, c.members[0].id, "2026-11").points, -5);
});
test("Passed regulations never deduct points, including unchecked", () => {
  const c = fixture();
  applyAction(c, memberIdentity, "register", { status: "attending" });
  const w = c.weeks.at(-1)!;
  w.meetingDate = today();
  applyAction(c, adminIdentity, "entry", {
    week: w.id,
    memberId: c.members[1].id,
    passed: true,
  });
  closeWeek(w);
  assert.equal(scoreFor(c, c.members[1].id, today().slice(0, 7)).points, 0);
  assert.equal(scoreFor(c, c.members[1].id, today().slice(0, 7)).passed, 1);
});
test("Absent members cannot pass regulations; closed edits require a reason", () => {
  const c = fixture();
  const w = c.weeks.at(-1)!;
  assert.throws(
    () =>
      applyAction(c, adminIdentity, "entry", {
        week: w.id,
        memberId: c.members[1].id,
        passed: true,
      }),
    /có mặt/,
  );
  closeWeek(w);
  assert.throws(
    () =>
      applyAction(c, adminIdentity, "entry", {
        week: w.id,
        memberId: c.members[1].id,
        excused: true,
      }),
    /lý do/,
  );
});
function schedulerFixture() {
  const c = fixture();
  for (let i = 0; i < 5; i++)
    c.members.push({
      id: `m${i}`,
      name: `Người ${i}`,
      studentId: `SV${i + 10}`,
      role: "member",
      active: true,
      joined: "2026-01-01",
      extraDuties: i === 0,
      availability: [1, 2, 3, 4, 5].flatMap((d) => [`${d}-am`, `${d}-pm`]),
    });
  c.members.forEach((m) => (m.joined = "2026-01-01"));
  return c;
}
test("Duty schedule allows more than two turns, respects availability and two seats", () => {
  const c = schedulerFixture();
  const s = makeSchedule(c, "2026-11");
  assert.ok(s.shifts.length > 0);
  assert.ok(s.shifts.every((t) => t.assignments.length === 2));
  const counts = new Map<string, number>();
  for (const t of s.shifts) {
    assert.notEqual(t.assignments[0].memberId, t.assignments[1].memberId);
    for (const a of t.assignments) {
      const m = c.members.find((m) => m.id === a.memberId)!;
      assert.ok(m.availability.includes(`${weekday(t.date)}-${t.period}`));
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    }
  }
  assert.ok([...counts.values()].some((n) => n > 2));
  assert.ok([...counts.values()].every((n) => n >= 1));
  assert.ok(counts.get("m0")! > counts.get("m1")!);
});
test("Insufficient availability leaves visible gaps, without duplicate people", () => {
  const c = schedulerFixture();
  c.members.forEach((m) => (m.availability = []));
  c.members[0].availability = ["1-am"];
  const s = makeSchedule(c, "2026-11");
  assert.ok(s.shifts.some((t) => t.assignments.length === 0));
  assert.ok(s.shifts.every((t) => t.assignments.length <= 1));
});
test("Draft assignments do not earn points, only verified published duties do", () => {
  const c = schedulerFixture();
  const s = makeSchedule(c, "2026-11");
  c.schedules = [s];
  c.rules = [{ month: "2000-01", A: 10, B: 15, C: 5, D: 0 }];
  const a = s.shifts[0].assignments[0];
  a.result = "completed";
  assert.equal(scoreFor(c, a.memberId, "2026-11").points, 0);
  s.published = true;
  assert.equal(scoreFor(c, a.memberId, "2026-11").points, 10);
});
test("Replacing a member credits the replacement, preserves the original and resets verification", () => {
  const c = schedulerFixture();
  const s = makeSchedule(c, "2026-11");
  s.published = true;
  c.schedules = [s];
  c.rules = [{ month: "2000-01", A: 10, B: 15, C: 5, D: 0 }];
  const t = s.shifts[0];
  const old = t.assignments[0].memberId;
  const replacement = c.members.find(
    (m) =>
      m.availability.includes(`${weekday(t.date)}-${t.period}`) &&
      !t.assignments.some((a) => a.memberId === m.id),
  )!;
  t.assignments[0].result = "unexcused";
  applyAction(c, adminIdentity, "shift", {
    month: s.month,
    shiftId: t.id,
    position: 0,
    replacementId: replacement.id,
  });
  assert.equal(t.assignments[0].originalId, old);
  assert.equal(t.assignments[0].result, "unverified");
  applyAction(c, adminIdentity, "shift", {
    month: s.month,
    shiftId: t.id,
    position: 0,
    result: "completed",
  });
  assert.equal(scoreFor(c, old, s.month).dutyMissed, 0);
  assert.equal(scoreFor(c, replacement.id, s.month).completed, 1);
});
test("Rule changes have an effective month", () => {
  const c = fixture();
  c.rules = [
    { month: "2000-01", A: 10, B: 15, C: 5, D: 0 },
    { month: "2026-11", A: 20, B: 30, C: 10, D: 0 },
  ];
  assert.equal(rulesFor(c, "2026-10").A, 10);
  assert.equal(rulesFor(c, "2026-11").A, 20);
});
test("Excel exports four readable worksheets with correct totals", async () => {
  const c = schedulerFixture();
  const s = makeSchedule(c, today().slice(0, 7));
  s.published = true;
  c.schedules = [s];
  const { buffer, warnings } = await makeReport(c, today().slice(0, 7));
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets.length, 4);
  assert.ok(workbook.getWorksheet("Tổng hợp tháng"));
  assert.ok(workbook.getWorksheet("Chi tiết trực"));
  assert.ok(warnings.length > 0);
  assert.equal(
    workbook.worksheets[0].getCell("I4").value,
    scoreFor(c, c.members[0].id, today().slice(0, 7)).points,
  );
});
test("Excel availability import recognizes all seven days and preference", async () => {
  const { default: ExcelJS } = await import("exceljs");
  const b = new ExcelJS.Workbook();
  const s = b.addWorksheet("Data");
  s.addRow([
    "MSSV",
    "Họ tên",
    "Email",
    ...["T2", "T3", "T4", "T5", "T6", "T7", "CN"].flatMap((d) => [
      `${d} sáng`,
      `${d} chiều`,
    ]),
    "Muốn trực thêm",
  ]);
  s.addRow([
    "SV001",
    "Sinh viên",
    "sv@example.com",
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    1,
  ]);
  const buffer = await b.xlsx.writeBuffer();
  const file = new File([new Uint8Array(buffer)], "test.xlsx");
  const rows = await readImport(file, "availability");
  assert.deepEqual(rows[0].availability, ["1-am", "0-am"]);
  assert.equal(rows[0].extraDuties, true);
});

test("Detailed availability preserves time windows, academic weeks, notes and source row numbers", async () => {
  const { default: ExcelJS } = await import("exceljs");
  const b = new ExcelJS.Workbook(),
    s = b.addWorksheet("Lịch rảnh");
  s.addRow(["Họ và tên", "Thứ", "Buổi", "Tuần học"]);
  s.addRow(["Thành viên một", "Thứ 3", "8h- 10h", "2-19", "Ghi chú riêng"]);
  s.addRow(["Thành viên một", "Thứ 5", "14h-16h", "11,15,17"]);
  s.addRow([]);
  s.addRow(["Thành viên hai", "Thứ 2", "Cả ngày", "trừ tuần 13"]);
  const result = await readAvailabilityUpload(
    new File([new Uint8Array(await b.xlsx.writeBuffer())], "lich.xlsx"),
  );
  assert.equal(result.format, "details");
  assert.equal(result.rows.length, 3);
  if (result.format !== "details") throw new Error("Expected detailed format");
  assert.deepEqual(result.rows[0], {
    sourceRow: 2,
    name: "Thành viên một",
    day: "Thứ 3",
    period: "8h- 10h",
    weeks: "2-19",
    note: "Ghi chú riêng",
  });
  assert.equal(result.rows[1].weeks, "11,15,17");
  assert.equal(result.rows[2].sourceRow, 5);
  assert.equal(result.rows[2].weeks, "trừ tuần 13");
});

test("Detailed availability rejects incomplete rows instead of silently dropping them", async () => {
  const { default: ExcelJS } = await import("exceljs");
  const b = new ExcelJS.Workbook(),
    s = b.addWorksheet("Data");
  s.addRow(["Họ và tên", "Thứ", "Buổi", "Tuần học"]);
  s.addRow(["Thành viên", "Thứ 2", "Sáng", ""]);
  await assert.rejects(() =>
    readAvailabilityUpload(
      new File([new Uint8Array(Buffer.from([]))], "empty.xlsx"),
    ),
  );
  const file = new File(
    [new Uint8Array(await b.xlsx.writeBuffer())],
    "invalid.xlsx",
  );
  await assert.rejects(() => readAvailabilityUpload(file), /Dòng 2/);
});

test("Detailed import is BCS-only and does not invent MSSVs or overwrite effective schedules", () => {
  const c = fixture();
  const beforeMembers = JSON.stringify(c.members),
    beforeSchedules = JSON.stringify(c.schedules),
    beforeVersion = c.availabilityVersion;
  const data = {
    filename: "lich.xlsx",
    rows: [
      {
        sourceRow: 2,
        name: "Thành viên trong file",
        day: "Thứ 3",
        period: "8h- 10h",
        weeks: "trừ tuần 13",
        note: "Tháng 11: t4-6 full",
      },
    ],
  };
  assert.throws(
    () => applyAction(c, memberIdentity, "importAvailabilityDetails", data),
    /BCS/,
  );
  applyAction(c, adminIdentity, "importAvailabilityDetails", data);
  assert.equal(JSON.stringify(c.members), beforeMembers);
  assert.equal(JSON.stringify(c.schedules), beforeSchedules);
  assert.equal(c.availabilityVersion, beforeVersion);
  assert.deepEqual(c.availabilityDataset?.rows, data.rows);
  assert.equal(c.availabilityDataset?.importedBy, "Chủ nhiệm");
  c.demo = true;
  applyAction(c, adminIdentity, "resetDemo", { confirm: "BAT DAU" });
  assert.deepEqual(c.availabilityDataset?.rows, data.rows);
});

const detailedSettings = {
  anchorDate: "2026-11-09",
  anchorWeek: 11,
  startDate: "2026-11-09",
  amStart: "08:30",
  amEnd: "11:30",
  pmStart: "14:00",
  pmEnd: "17:30",
  allowedLateMinutes: 30,
  ignoreSourceNotes: true,
};
function detailedFixture(period = "14h30-17h30") {
  const c = fixture(),
    m = c.members[1];
  c.availabilityDataset = {
    filename: "test.xlsx",
    importedAt: "",
    importedBy: "BCS",
    settings: detailedSettings,
    memberLinks: { [m.name.toLocaleLowerCase("vi")]: m.id },
    rows: [
      {
        sourceRow: 2,
        name: m.name,
        day: "Thứ 2",
        period,
        weeks: "2-18",
        note: "Không dùng cột này",
      },
    ],
  };
  return { c, m };
}
test("Academic week 11 is 9–15 November, with ranges, lists and exclusions", () => {
  assert.equal(academicWeekFor("2026-11-09", detailedSettings), 11);
  assert.equal(academicWeekFor("2026-11-15", detailedSettings), 11);
  assert.equal(academicWeekFor("2026-11-16", detailedSettings), 12);
  assert.equal(weekMatches("11,15,17", 12), false);
  assert.equal(weekMatches("2-18", 18), true);
  assert.equal(weekMatches("trừ tuần 13", 13, 19), false);
  assert.equal(weekMatches("trừ tuần 13", 14, 19), true);
  assert.equal(weekMatches("trừ tuần 13", 20, 19), false);
});
test("Duty eligibility allows 30 minutes late, rejects 31 and early departure", () => {
  const { c, m } = detailedFixture();
  const accepted = availabilityForDuty(c, m, "2026-11-09", "pm");
  assert.equal(accepted.available, true);
  assert.equal(accepted.lateMinutes, 30);
  assert.match(accepted.note, /Có ca học tan lúc 14:30/);
  assert.doesNotMatch(accepted.note, /Không dùng/);
  c.availabilityDataset!.rows[0].period = "14h31-17h30";
  assert.equal(availabilityForDuty(c, m, "2026-11-09", "pm").available, false);
  c.availabilityDataset!.rows[0].period = "14h30-17h29";
  assert.equal(availabilityForDuty(c, m, "2026-11-09", "pm").available, false);
  c.availabilityDataset!.rows[0].period = "8h-10h";
  assert.equal(availabilityForDuty(c, m, "2026-11-09", "am").available, false);
  c.availabilityDataset!.rows.push({
    ...c.availabilityDataset!.rows[0],
    sourceRow: 3,
    period: "10h-12h",
  });
  assert.equal(availabilityForDuty(c, m, "2026-11-09", "am").available, true);
  assert.equal(availabilityForDuty(c, m, "2026-11-02", "am").available, false);
});
test("Activating detailed availability creates pending MSSV profiles, is repeatable and makes a private draft", () => {
  const c = fixture();
  applyAction(c, adminIdentity, "importAvailabilityDetails", {
    filename: "real.xlsx",
    rows: [
      {
        sourceRow: 2,
        name: "Người chờ MSSV",
        day: "Thứ 2",
        period: "Cả ngày",
        weeks: "11-18",
        note: "Bỏ qua",
      },
    ],
  });
  const data = { ...detailedSettings, month: "2026-11" };
  assert.throws(
    () => applyAction(c, memberIdentity, "activateAvailabilityDetails", data),
    /BCS/,
  );
  applyAction(c, adminIdentity, "activateAvailabilityDetails", data);
  const m = c.members.find((x) => x.name === "Người chờ MSSV")!;
  assert.equal(m.studentId, "");
  assert.equal(m.needsStudentId, true);
  assert.equal(m.userId, undefined);
  const s = c.schedules.find((s) => s.month === "2026-11")!;
  assert.equal(s.published, false);
  assert.ok(s.shifts.every((s) => s.date >= "2026-11-09"));
  assert.equal(s.shifts.find((s) => s.date === "2026-11-09")?.academicWeek, 11);
  const count = c.members.length;
  applyAction(c, adminIdentity, "activateAvailabilityDetails", data);
  assert.equal(c.members.length, count);
  applyAction(c, adminIdentity, "member", {
    memberId: m.id,
    studentId: "SV_READY",
  });
  assert.equal(m.needsStudentId, false);
  assert.equal(m.id, c.availabilityDataset?.memberLinks?.["người chờ mssv"]);
  c.demo = true;
  applyAction(c, adminIdentity, "resetDemo", { confirm: "BAT DAU" });
  assert.ok(c.members.some((x) => x.id === m.id));
  assert.ok(c.availabilityDataset?.settings);
});
test("Late checkbox is manual, does not change points and is exported with notes", async () => {
  const { c, m } = detailedFixture();
  c.rules = [{ month: "2000-01", A: 10, B: 15, C: 5, D: 0 }];
  c.schedules = [makeSchedule(c, "2026-11")];
  const s = c.schedules[0],
    shift = s.shifts.find((s) => s.date === "2026-11-09" && s.period === "pm")!;
  const position = shift.assignments.findIndex((a) => a.memberId === m.id);
  assert.ok(position >= 0);
  assert.equal(shift.assignments[position].late, false);
  const data = { month: s.month, shiftId: shift.id, position };
  assert.throws(
    () => applyAction(c, adminIdentity, "shift", { ...data, late: true }),
    /Công bố/,
  );
  s.published = true;
  applyAction(c, adminIdentity, "shift", { ...data, result: "completed" });
  const before = scoreFor(c, m.id, s.month).points;
  applyAction(c, adminIdentity, "shift", {
    ...data,
    late: true,
    note: "Có ca học tan lúc 14:30",
  });
  assert.equal(scoreFor(c, m.id, s.month).points, before);
  assert.throws(
    () => applyAction(c, memberIdentity, "shift", { ...data, late: false }),
    /BCS/,
  );
  const { buffer } = await makeReport(c, "2026-11");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.getWorksheet("Chi tiết trực")!;
  assert.equal(sheet.getCell("K3").value, "Đến muộn");
  const first = sheet
    .getRows(4, sheet.rowCount - 3)!
    .find((r) => r.getCell(11).value === "Có")!;
  assert.ok(first);
  assert.match(first.getCell(10).text, /14:30/);
  applyAction(c, adminIdentity, "shift", { ...data, late: false });
  assert.equal(shift.assignments[position].late, false);
});
