import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../lib/actions";
import { createClub, newEntry, closeWeek, syncWeeks, weekId, addDays, makeSchedule, shiftCapacity, scoreFor, type Member, type Week } from "../lib/club";
import { workspaceView } from "../lib/workspace-view";
import { makeReport } from "../lib/excel";
import ExcelJS from "exceljs";
import { canEditDutyDraft, type Shift } from "../lib/club";
import { availabilityForDuty, personKey, profileAvailability } from "../lib/availability";
import { syncAvailabilityProfiles } from "../lib/availability-profile-import";

const admin = { userId: "capacity-owner", email: "owner@example.invalid", displayName: "Admin" };
function fixture() {
  const club = createClub(admin.userId);
  club.members = Array.from({ length: 7 }, (_, i): Member => ({
    id: `m${i}`, userId: i === 0 ? admin.userId : `u${i}`, name: `Người ${i}`,
    studentId: `SV${i}`, active: true, role: i === 0 ? "admin" : "member",
    joined: "2020-01-01", availability: ["1-am", "1-pm"], extraDuties: false,
  }));
  club.days = [1];
  const week: Week = { id: weekId(), meetingDate: weekId(), time: "18:30", location: "C1", cancelled: false, closed: false, entries: club.members.map(m => newEntry(m.id)) };
  club.weeks = [week];
  club.rules = [{ month: "2000-01", A: 10, B: 10, C: 5, D: 2 }];
  return { club, week };
}

test("Hủy chốt khôi phục trạng thái trước chốt, giữ lý do/có phép và sửa đổi BĐH", () => {
  const { club, week } = fixture();
  Object.assign(week.entries[1], { status: "pending", reason: "Bận học", request: "Xin đi họp lại", excused: true });
  Object.assign(week.entries[2], { status: "attending", passed: true, attendanceVerified: true });
  const before = structuredClone(week.entries);
  applyAction(club, admin, "close", { week: week.id });
  assert.equal(scoreFor(club, "m3", week.id.slice(0, 7)).meetingMissed, 1);
  applyAction(club, admin, "entry", { week: week.id, memberId: "m4", absent: true, excused: true, note: "Đã kiểm tra" });
  applyAction(club, admin, "reopen", { week: week.id, note: "Kiểm tra lại" });
  assert.equal(week.closed, false);
  assert.deepEqual(week.entries.slice(0, 4), before.slice(0, 4));
  assert.equal(week.entries[4].excused, true);
  assert.equal(week.entries[4].attendanceVerified, true);
  assert.equal(scoreFor(club, "m3", week.id.slice(0, 7)).meetingMissed, 0);
  syncWeeks(club, addDays(week.id, 7));
  assert.equal(week.closed, true, "Current-week reopening must not disable end-of-week maintenance");
  assert.equal(scoreFor(club, "m3", week.id.slice(0, 7)).meetingMissed, 1);
});

test("Tuần cũ mở để sửa không tự chốt lại; dữ liệu cũ không snapshot vẫn giữ nguyên", () => {
  const { club, week } = fixture();
  week.id = addDays(week.id, -7);
  week.meetingDate = week.id;
  closeWeek(week);
  delete week.closingSnapshot; // Already published historical records.
  const entries = structuredClone(week.entries);
  applyAction(club, admin, "reopen", { week: week.id, note: "Rà soát tuần cũ" });
  syncWeeks(club);
  assert.equal(week.closed, false);
  assert.deepEqual(week.entries, entries);
  assert.equal(week.reopenedForCorrection, true);
  applyAction(club, admin, "close", { week: week.id });
  assert.equal(week.closed, true);
  assert.equal(week.reopenedForCorrection, undefined);
  assert.ok(club.logs.some(l => l.text.includes("Hủy chốt")));
});

test("Hủy chốt yêu cầu admin, lý do, trạng thái đã chốt; snapshot riêng tư", () => {
  const { club, week } = fixture();
  closeWeek(week);
  const user = { ...admin, userId: "u1" };
  assert.throws(() => applyAction(club, user, "reopen", { week: week.id, note: "Thử sửa" }), /BĐH/);
  assert.throws(() => applyAction(club, admin, "reopen", { week: week.id }), /lý do/);
  const view = workspaceView(club, user, 1);
  assert.equal(view.club.weeks[0].closingSnapshot, undefined);
  assert.equal(view.club.weeks[0].entries.length, 1);
  assert.ok(week.closingSnapshot);
  applyAction(club, admin, "reopen", { week: week.id, note: "Thử sửa" });
  assert.throws(() => applyAction(club, admin, "reopen", { week: week.id, note: "Thử sửa" }), /chưa được chốt/);
});

for (const capacity of [1, 3, 5]) test(`Xếp lịch ${capacity} người/ca, không trùng và đúng lịch rảnh`, () => {
  const { club } = fixture();
  applyAction(club, admin, "schedule", { month: "2026-11", peoplePerShift: capacity });
  const schedule = club.schedules[0];
  assert.equal(club.peoplePerShift, capacity);
  assert.equal(schedule.peoplePerShift, capacity);
  assert.ok(schedule.shifts.every(s => s.assignments.length === capacity && shiftCapacity(s) === capacity));
  assert.ok(schedule.shifts.every(s => new Set(s.assignments.map(a => a.memberId)).size === capacity));
  assert.ok(club.members.slice(1).every(m => schedule.shifts.some(s => s.assignments.some(a => a.memberId === m.id))));
  assert.ok(schedule.shifts.every(s => s.assignments.every(a => a.memberId !== club.members[0].id)));
  const shift = schedule.shifts[0];
  const replacement = club.members.slice(1).find(m => !shift.assignments.some(a => a.memberId === m.id))!;
  applyAction(club, admin, "shift", { month: schedule.month, shiftId: shift.id, position: capacity - 1, replacementId: replacement.id });
  assert.equal(shift.assignments[capacity - 1].memberId, replacement.id);
  assert.throws(() => applyAction(club, admin, "shift", { month: schedule.month, shiftId: shift.id, position: capacity, replacementId: replacement.id }), /Vị trí/);
  const saved = structuredClone(shift.assignments);
  applyAction(club, admin, "cancelShift", { month: schedule.month, shiftId: shift.id });
  applyAction(club, admin, "restoreShift", { month: schedule.month, shiftId: shift.id });
  assert.deepEqual(shift.assignments, saved);
});

test("Sức chứa được kiểm tra; thiếu người không xếp trùng; lịch công bố và lịch cũ giữ nguyên", () => {
  const { club } = fixture();
  for (const peoplePerShift of [0, -1, 1.5, 51, "bad"])
    assert.throws(() => applyAction(club, admin, "schedule", { month: "2026-11", peoplePerShift }), /1–50/);
  const schedule = makeSchedule(club, "2026-11", 7);
  assert.ok(schedule.shifts.every(s => s.assignments.length === 6 && shiftCapacity(s) === 7));
  schedule.published = true;
  club.schedules.push(schedule);
  const original = structuredClone(schedule);
  assert.throws(() => applyAction(club, admin, "schedule", { month: "2026-11", peoplePerShift: 1 }), /đã công bố/);
  applyAction(club, admin, "schedule", { month: "2026-12", peoplePerShift: 3 });
  assert.deepEqual(club.schedules[0], original);
  assert.equal(shiftCapacity({ ...schedule.shifts[0], capacity: undefined }), 2);
});

test("Áp dụng file lịch rảnh nhận số người mỗi ca và xuất nhãn phiếu điểm danh", async () => {
  const { club } = fixture();
  applyAction(club, admin, "importAvailabilityDetails", {
    filename: "capacity.xlsx",
    rows: club.members.map((m, i) => ({ sourceRow: i + 2, name: m.name, day: "Thứ 2", period: "Cả ngày", weeks: "11-20", note: "" })),
  });
  applyAction(club, admin, "activateAvailabilityDetails", {
    month: "2026-11", anchorDate: "2026-11-09", anchorWeek: 11, startDate: "2026-11-09",
    amStart: "08:30", amEnd: "11:30", pmStart: "14:00", pmEnd: "17:30", allowedLateMinutes: 30,
    peoplePerShift: 3,
  });
  assert.equal(club.peoplePerShift, 3);
  assert.ok(club.schedules[0].shifts.every(s => s.capacity === 3 && s.assignments.length === 3));
  const workbook = new ExcelJS.Workbook();
  const { buffer } = await makeReport(club, "2026-11");
  await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets[0].getCell("H3").value, "Đạt phiếu điểm danh");
  assert.equal(workbook.worksheets[1].getCell("I3").value, "Đạt phiếu điểm danh");
});

test("Rút lịch từ ngày bấm đến Chủ nhật bảo toàn ca trước ngày bấm và điểm đã xác minh", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-11T08:00:00Z") });
  const { club } = fixture();
  club.members.forEach((member) => { member.availability = ["1-am", "2-am", "3-am", "4-am", "5-am", "6-am", "0-am"]; });
  const shift = (date: string, result: "completed" | "unverified" = "unverified"): Shift => ({
    id: date + "-" + result, date, period: "am", startTime: "08:30", endTime: "11:30", capacity: 2,
    assignments: [{ memberId: "m1", result }],
  });
  club.schedules = [{ month: "2026-11", published: true, shifts: [
    shift("2026-11-10", "completed"), shift("2026-11-11", "completed"),
    shift("2026-11-11"), shift("2026-11-15"), shift("2026-11-16"),
  ] }];
  const prior = structuredClone(club.schedules[0].shifts);
  const points = scoreFor(club, "m1", "2026-11").points;
  assert.throws(() => applyAction(club, { userId: "u1", displayName: "Member", email: "" }, "withdrawDutyWeek", { from: "2026-11-11" }), /BĐH/);
  assert.throws(() => applyAction(club, admin, "withdrawDutyWeek", { from: "2026-11-10" }), /Ngày đã đổi/);
  applyAction(club, admin, "withdrawDutyWeek", { from: "2026-11-11" });
  const current = club.schedules[0].shifts;
  assert.deepEqual(current[0], prior[0]);
  assert.deepEqual(current[1], prior[1]);
  assert.deepEqual(current[4], prior[4]);
  assert.equal(current[2].withdrawnOn, "2026-11-11");
  assert.equal(current[3].draft, true);
  assert.equal(canEditDutyDraft(current[2]), true);
  assert.equal(scoreFor(club, "m1", "2026-11").points, points);
  applyAction(club, admin, "schedule", { month: "2026-11", week: "2026-11-09", peoplePerShift: 3 });
  assert.equal(current[2].capacity, 3);
  assert.equal(current[3].capacity, 3);
  assert.deepEqual(current[0], prior[0]);
  assert.deepEqual(current[1], prior[1]);
  assert.deepEqual(current[4], prior[4]);
  assert.equal(scoreFor(club, "m1", "2026-11").points, points);
  applyAction(club, admin, "publish", { month: "2026-11", week: "2026-11-09" });
  assert.ok(current.every((item) => !item.draft && !item.withdrawnOn));
  assert.equal(scoreFor(club, "m1", "2026-11").points, points);
});

test("Phạm vi rút lịch dùng ngày Việt Nam và đi qua ranh giới tháng", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-30T17:05:00Z") });
  const { club } = fixture();
  const shift = (date: string): Shift => ({
    id: date, date, period: "am", assignments: [{ memberId: "m1", result: "unverified" }],
  });
  club.schedules = [
    { month: "2026-11", published: true, shifts: [shift("2026-11-30")] },
    { month: "2026-12", published: true, shifts: [shift("2026-12-01"), shift("2026-12-06"), shift("2026-12-07")] },
  ];
  applyAction(club, admin, "withdrawDutyWeek", { from: "2026-12-01" });
  assert.equal(club.schedules[0].shifts[0].draft, undefined);
  assert.deepEqual(club.schedules[1].shifts.map((item) => !!item.draft), [true, true, false]);
  assert.equal(canEditDutyDraft(club.schedules[1].shifts[0], new Date("2026-12-06T10:00:00Z")), true);
  assert.equal(canEditDutyDraft(club.schedules[1].shifts[0], new Date("2026-12-06T17:00:00Z")), false);
});

test("Excel điền ô tích, thay đổi tay quyết định xếp lịch và tồn tại qua lần nhập tiếp theo", () => {
  const { club } = fixture();
  const member = club.members[1];
  const settings = {
    anchorDate: "2026-11-09", anchorWeek: 11, startDate: "2026-11-09",
    amStart: "08:30", amEnd: "11:30", pmStart: "14:00", pmEnd: "17:30",
    allowedLateMinutes: 30, ignoreSourceNotes: true,
  };
  const rows = [
    { sourceRow: 2, name: member.name, day: "Thứ 2", period: "Chiều", weeks: "11,13", note: "" },
    { sourceRow: 3, name: member.name, day: "Thứ 3", period: "8h-10h", weeks: "11-18", note: "" },
  ];
  club.activeAvailabilityDataset = {
    filename: "old.xlsx", rows, importedAt: "", importedBy: "", settings, memberLinks: { [personKey(member.name)]: member.id },
  };
  const beforeSchedule = JSON.stringify(club.schedules);
  const input = { filename: "new.xlsx", rows, importedAt: "2026-11-11", importedBy: "BĐH" };
  assert.equal(syncAvailabilityProfiles(club, input).matched, 1);
  assert.deepEqual(member.availability, ["1-pm", "2-am"]);
  assert.equal(availabilityForDuty(club, member, "2026-11-09", "pm").available, true);
  assert.equal(availabilityForDuty(club, member, "2026-11-16", "pm").available, false);
  assert.equal(availabilityForDuty(club, member, "2026-11-10", "am").available, false);
  applyAction(club, admin, "member", { memberId: member.id, availability: ["2-am", "4-am"] });
  assert.equal(availabilityForDuty(club, member, "2026-11-09", "pm").available, false);
  assert.equal(availabilityForDuty(club, member, "2026-11-12", "am").available, true);
  syncAvailabilityProfiles(club, input);
  assert.deepEqual(profileAvailability(club, member), ["2-am", "4-am"]);
  applyAction(club, admin, "member", { memberId: member.id, availability: ["1-pm", "4-am"] });
  assert.equal(availabilityForDuty(club, member, "2026-11-16", "pm").available, true);
  assert.equal(availabilityForDuty(club, member, "2026-11-10", "am").available, false);
  assert.equal(JSON.stringify(club.schedules), beforeSchedule);
  const generated = makeSchedule(club, "2026-11", 2);
  assert.ok(generated.shifts.filter((item) => item.period === "pm").some((item) => item.assignments.some((assignment) => assignment.memberId === member.id)));
});

test("Đồng bộ dùng tuần đã lưu cho ô trống, không tạo lại người ngoài danh sách", () => {
  const { club } = fixture();
  const member = club.members[1];
  const settings = {
    anchorDate: "2026-11-09", anchorWeek: 11, startDate: "2026-11-09",
    amStart: "08:30", amEnd: "11:30", pmStart: "14:00", pmEnd: "17:30",
    allowedLateMinutes: 30, ignoreSourceNotes: true,
  };
  const existing = { sourceRow: 44, name: member.name, day: "Thứ 3", period: "Sáng", weeks: "2-18", note: "" };
  club.activeAvailabilityDataset = {
    filename: "old.xlsx", rows: [existing], importedAt: "", importedBy: "", settings, memberLinks: { [personKey(member.name)]: member.id },
  };
  const originalMembers = club.members.length;
  const result = syncAvailabilityProfiles(club, {
    filename: "new.xlsx", importedAt: "2026-11-11", importedBy: "BĐH", rows: [
      { ...existing, weeks: "" },
      { ...existing, sourceRow: 45, name: "Người đã xóa" },
    ],
  });
  assert.deepEqual(result.reusedWeeks, [44]);
  assert.deepEqual(result.unmatchedNames, ["Người đã xóa"]);
  assert.equal(club.members.length, originalMembers);
  assert.deepEqual(member.availability, ["2-am"]);
  assert.equal(club.activeAvailabilityDataset?.rows[0].weeks, "2-18");
});
