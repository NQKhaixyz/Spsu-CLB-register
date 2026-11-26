import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { applyAction } from "../lib/actions";
import { addDays, createClub, newEntry, pausedForScoreWeek, scoreFor, setMemberActive, today, type Member } from "../lib/club";
import { makeReport } from "../lib/excel";
import { monthlyScoreboard, workspaceView } from "../lib/workspace-view";

const owner = { userId: "owner-qa", displayName: "Điều hành QA", email: "" };
const viewer = { userId: "viewer-qa", displayName: "Người xem QA", email: "" };
function fixture() {
  const club = createClub(owner.userId);
  const [admin, peer, reader]: Member[] = [owner, { userId: "peer-qa", displayName: "Người trực thay" }, viewer].map((u, index) => ({
    id: "m" + index, userId: u.userId, name: u.displayName, studentId: "QA00" + index, joined: "2026-09-01",
    role: index === 0 ? "admin" : "member", active: true, extraDuties: false, availability: [],
  }));
  admin.committee = "cs";
  peer.committees = ["cm", "tt"];
  club.members = [admin, peer, reader];
  club.weeks = ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"].map(id => ({
    id, meetingDate: addDays(id, 1), cancelled: false, closed: true, time: "", location: "",
    entries: club.members.map(m => ({ ...newEntry(m.id), status: "attending", passed: true })),
  }));
  club.schedules = [{ month: "2026-11", published: true, shifts: [
    { id: "d1", date: "2026-11-03", period: "am", assignments: [{ memberId: peer.id, originalId: admin.id, result: "completed" }] },
    { id: "d2", date: "2026-11-10", period: "pm", assignments: [{ memberId: peer.id, result: "unverified" }, { memberId: reader.id, originalId: peer.id, result: "completed" }] },
  ] }];
  club.manualActivities = [peer, reader].map(m => ({
    id: "a" + m.id, memberId: m.id, week: "2026-11-02", date: "2026-11-03", kind: "special", quantity: 1, points: 2.75, note: "Điểm nội bộ", updatedAt: "", updatedBy: admin.id,
  }));
  return { club, admin, peer, reader };
}

test("Pressing pause dates it by the current Vietnamese day and scheduled shifts cannot bypass the next Monday", () => {
  const { club, peer } = fixture();
  applyAction(club, owner, "member", { memberId: peer.id, active: false });
  assert.equal(peer.left, today());
  assert.throws(() => applyAction(club, viewer, "member", { memberId: peer.id, active: true }), /BĐH/);
  // Existing deployments already store the click date in left.
  peer.left = "2026-10-31";
  for (const user of [owner, viewer]) {
    const view = workspaceView(club, user, 1);
    const weeks = view.weeklyScores.filter(row => row.memberId === peer.id).map(row => row.week);
    assert.deepEqual(weeks, ["2026-10-26"]);
    assert.ok(view.club.members.some(m => m.id === peer.id));
  }
  const present = (month: string, day: string) => monthlyScoreboard(club, month, day).some(row => row.memberId === peer.id);
  assert.ok(present("2026-11", "2026-11-01"));
  assert.equal(present("2026-11", "2026-11-02"), false);
  assert.ok(present("2026-10", "2026-12-10"));
  assert.equal(present("2026-11", "2026-12-10"), false);
  assert.equal(present("2026-12", "2026-11-02"), false);
});

test("Reactivation includes the return week without reopening previous pauses or charging absences from those dates", () => {
  const { club, peer } = fixture();
  const paused = (monday: string) => pausedForScoreWeek(peer, monday);
  setMemberActive(peer, false, "2026-11-02");
  setMemberActive(peer, false, "2026-11-03");
  assert.equal(peer.left, "2026-11-02");
  assert.equal(paused("2026-11-02"), false);
  assert.equal(paused("2026-11-09"), true);
  setMemberActive(peer, true, "2026-11-19");
  setMemberActive(peer, true, "2026-11-20");
  assert.equal(peer.pastPauses?.length, 1);
  assert.equal(paused("2026-11-09"), true);
  assert.equal(paused("2026-11-16"), false);
  assert.equal(scoreFor(club, peer.id, "2026-11", "2026-11-09").attended, 0);
  setMemberActive(peer, false, "2026-11-22");
  setMemberActive(peer, true, "2026-12-01");
  const weeks = workspaceView(club, viewer, 2).weeklyScores.filter(r => r.memberId === peer.id).map(r => r.week);
  assert.deepEqual(weeks, ["2026-10-26", "2026-11-02", "2026-11-16", "2026-11-30"]);
  assert.ok(!monthlyScoreboard(club, "2026-11", "2026-12-01").some(r => r.memberId === peer.id));
  assert.ok(monthlyScoreboard(club, "2026-12", "2026-12-01").some(r => r.memberId === peer.id));
  setMemberActive(peer, false, "2026-12-31");
  assert.equal(paused("2026-12-28"), false);
  setMemberActive(peer, true, "2027-01-03");
  assert.equal(paused("2027-01-04"), false);
});

test("Monthly workbook follows the same cutoff in every personal worksheet, warnings and substituted shifts", async () => {
  const { club, admin, peer, reader } = fixture();
  setMemberActive(peer, false, "2026-11-05");
  async function snapshot(day: string) {
    const { buffer, warnings } = await makeReport(club, "2026-11", day);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const rows = (sheet: string) => {
      const ws = book.getWorksheet(sheet)!;
      const headings = ws.getRow(3);
      return Array.from({ length: ws.rowCount - 3 }, (_, index) =>
        Object.fromEntries(Array.from({ length: ws.columnCount }, (_, col) =>
          [headings.getCell(col + 1).text, ws.getRow(index + 4).getCell(col + 1).text])));
    };
    const summary = rows("Tổng hợp tháng");
    assert.deepEqual(summary.map(r => [r["Họ tên"], Number(r["Tổng điểm"])]),
      monthlyScoreboard(club, "2026-11", day).map(r => [r.name, r.points]));
    return { rows, summary, warnings };
  }
  const before = await snapshot("2026-11-08");
  for (const sheet of ["Tổng hợp tháng", "Chi tiết họp", "Chi tiết hoạt động"]) {
    assert.equal(before.rows(sheet).find(r => r["Họ tên"] === peer.name)?.["Ban trực thuộc"], "Truyền thông, Chuyên môn");
    assert.equal(before.rows(sheet).find(r => r["Họ tên"] === reader.name)?.["Ban trực thuộc"], "Chưa phân ban");
  }
  const duty = before.rows("Chi tiết trực")[0];
  assert.equal(duty["Người được phân ban đầu"], admin.name);
  assert.equal(duty["Người thực tế phụ trách"], peer.name);
  assert.equal(duty["Ban của người được phân ban đầu"], "Điều hành");
  assert.equal(duty["Ban của người thực tế phụ trách"], "Truyền thông, Chuyên môn");
  assert.ok(before.warnings.includes("1 lượt trực chưa xác minh"));
  const after = await snapshot("2026-11-09");
  for (const sheet of ["Tổng hợp tháng", "Chi tiết họp", "Chi tiết hoạt động", "Chi tiết trực"]) {
    assert.ok(after.rows(sheet).every(r => !Object.values(r).includes(peer.name) && !Object.values(r).includes(peer.studentId)));
  }
  assert.equal(after.rows("Chi tiết trực").length, 1);
  assert.equal(after.rows("Chi tiết trực")[0]["Người thực tế phụ trách"], reader.name);
  assert.equal(after.rows("Chi tiết trực")[0]["Người được phân ban đầu"], "");
  assert.ok(!after.warnings.some(w => w.includes("lượt trực chưa xác minh")));
});
