import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../lib/actions";
import { createClub, syncWeeks, today, weekId, addDays, scoreFor, weeklyScoreFor, type Member } from "../lib/club";
import { activityName, activityScoreFor, ratedActivityKinds, visibleActivityKinds, activityUnitPoints, activityPointsFor, eventEvidenceExpiry, isEventOpen, reviewEventRegistration } from "../lib/activity";
import { committeeKinds } from "../lib/committees";
import { detachExpiredEventPhotos, eventEvidenceTarget, eventEvidenceView } from "../lib/event-evidence";
import { eventPhotoKey, purgeExpiredEventPhotos } from "../lib/event-photo-storage";
import { monthlyScoreboard, workspaceView } from "../lib/workspace-view";
import { monthlyScoreTier, rankScoreRows } from "../lib/score-ranks";
import { semesterScores } from "../lib/semester-scores";
import { makeReport } from "../lib/excel";
import ExcelJS from "exceljs";
const admin={userId:"owner-activity",displayName:"Admin",email:""};
const user={userId:"member-activity",displayName:"Member",email:""};
function fixture(){
 const club=createClub(admin.userId);
 club.members=[admin,user,{...user,userId:"other-activity",displayName:"Other"}].map((u,i):Member=>({id:"a"+i,name:u.displayName,studentId:"ACT00"+i,userId:u.userId,role:i===0?"admin":"member",active:true,joined:"2020-01-01",availability:[],extraDuties:false}));
 club.rules=[{month:"2000-01",A:10,B:10,C:5,D:5,activities:{lecture:3,c2:4,ddv:5,project:6,initiative:7,special:8}}];
 syncWeeks(club);return club;
}

const eventData=(id="event-test-1",points=6,startDate=today(),endDate=today())=>({id,name:"Ngày hội C2",points,startDate,endDate});

test("Score ranks are descending with deterministic ties and ten distinct monthly tiers", () => {
  const rows = [
    { memberId: "z", name: "Lan", points: -1 },
    { memberId: "c", name: "Bình", points: 2.75 },
    { memberId: "b", name: "An", points: 2.75 },
    { memberId: "a", name: "An", points: 2.75 },
    { memberId: "x", name: "Chi", points: 0 },
    { memberId: "top", name: "Vũ", points: 4 },
  ];
  const ranked = rankScoreRows(rows);
  assert.deepEqual(ranked.map(row => [row.memberId, row.rank]),
    [["top", 1], ["a", 2], ["b", 3], ["c", 4], ["x", 5], ["z", 6]]);
  assert.deepEqual(rows.map(row => row.memberId), ["z", "c", "b", "a", "x", "top"]);
  const tiers = Array.from({ length: 10 }, (_, i) => monthlyScoreTier(i + 1));
  assert.deepEqual(tiers.map(tier => tier?.label),
    ["Thách đấu", "Đại cao thủ", "Cao thủ", "Kim cương", "Lục bảo", "Bạch kim", "Vàng", "Bạc", "Đồng", "Sắt"]);
  assert.equal(new Set(tiers.map(tier => tier?.id)).size, 10);
  assert.equal(monthlyScoreTier(11), undefined);
});

test("Semester totals sum each monthly report across years and include members only for their eligible months", () => {
  const club = fixture();
  const [, member, newcomer] = club.members;
  newcomer.joined = "2027-01-01";
  const paused = { ...member, id: "paused", name: "Paused", active: false, left: "2026-12-31" };
  club.members.push(paused);
  club.rules = [
    { month: "2026-12", A: 1.25, B: 0, C: 0, D: 0 },
    { month: "2027-01", A: 2.75, B: 0, C: 0, D: 0 },
  ];
  club.schedules = [
    { month: "2026-12", published: true, shifts: [{
      id: "dec-duty", date: "2026-12-22", period: "am",
      assignments: [member, paused].map(person => ({ memberId: person.id, result: "completed" as const })),
    }] },
    { month: "2027-01", published: true, shifts: [{
      id: "jan-duty", date: "2027-01-05", period: "am",
      assignments: [member, newcomer].map(person => ({ memberId: person.id, result: "completed" as const })),
    }] },
  ];
  club.pointDeductions = [{
    id: "semester-deduction", memberId: member.id, week: "2027-01-04", date: "2027-01-05", points: 0.25,
    reason: "Điểm trừ thử", createdAt: "", createdBy: "a0",
  }];
  const result = semesterScores(club, "2026-12", "2027-01", "2027-01-31");
  assert.deepEqual(result.months, ["2026-12", "2027-01"]);
  assert.deepEqual(result.rows.map(row => [row.memberId, row.points, row.rank, row.byMonth]), [
    [member.id, 3.75, 1, { "2026-12": 1.25, "2027-01": 2.5 }],
    [newcomer.id, 2.75, 2, { "2027-01": 2.75 }],
    [paused.id, 1.25, 3, { "2026-12": 1.25 }],
  ]);
  assert.deepEqual(semesterScores(club, "2027-01", "2026-12").months, []);
});

test("Multi-round events use the per-event multiplier for each approved round and keep reviews, photos and Excel aligned", async () => {
  const c = fixture();
  const data = { ...eventData("event-multiple", 1.75), participationMultiplier: 1.5, requiresEvidence: true };
  applyAction(c, admin, "createEvent", data);
  const event = c.events![0];
  for (const registrationId of ["first-round", "second-round", "second-round"]) {
    applyAction(c, user, "registerEvent", { eventId: event.id, registrationId });
  }
  const [first, second] = c.activityRegistrations!;
  assert.equal(c.activityRegistrations!.length, 2);
  const viewer = { ...user, userId: "other-activity" };
  assert.throws(() => applyAction(c, viewer, "registerEvent", { eventId: event.id, registrationId: first.id }), /đã được sử dụng/);
  first.evidence = { id: crypto.randomUUID(), submittedAt: Date.now() };
  second.evidence = { id: crypto.randomUUID(), submittedAt: Date.now() };
  const confirm = (id: string, photoId?: string) =>
    reviewEventRegistration(c, c.members[0], { id, confirmed: true }, () => {}, photoId);
  assert.throws(() => confirm(first.id, second.evidence!.id), /minh chứng/);
  confirm(second.id, second.evidence.id);
  assert.equal(activityPointsFor(c, second), 1.75);
  confirm(first.id, first.evidence.id);
  const direct = { eventId: event.id, registrationId: "third-round", memberId: first.memberId };
  applyAction(c, admin, "addEventParticipant", direct);
  applyAction(c, admin, "addEventParticipant", direct);
  const rounds = c.activityRegistrations!;
  assert.equal(rounds.length, 3);
  assert.equal(rounds[2].confirmedDirectly, true);
  assert.equal(rounds[2].evidence, undefined);
  assert.deepEqual(rounds.map(round => activityPointsFor(c, round)), [1.75, 2.63, 3.94]);
  const month = today().slice(0, 7);
  const weekScore = weeklyScoreFor(c, first.memberId, weekId());
  const monthScore = monthlyScoreboard(c, month).find(row => row.memberId === first.memberId);
  assert.equal(weekScore.points, 8.32);
  assert.equal(weekScore.activityPoints.event, 8.32);
  assert.equal(monthScore?.points, 8.32);
  assert.equal(monthScore?.activityPoints.event, 8.32);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await makeReport(c, month)).buffer);
  assert.deepEqual([4, 5, 6].map(row => book.getWorksheet("Chi tiết hoạt động")!.getCell(row, 8).value), [1.75, 2.63, 3.94]);
  assert.equal(book.getWorksheet("Tổng hợp tháng")!.getCell("I4").value, 8.32);
  assert.throws(() => applyAction(c, admin, "editEvent", { ...data, participationMultiplier: null }), /nhiều lượt/);
  assert.throws(() => applyAction(c, admin, "editEvent", { ...data, points: 100000, participationMultiplier: 100000 }), /giới hạn/);
  applyAction(c, admin, "editEvent", { ...data, participationMultiplier: 2 });
  assert.equal(weeklyScoreFor(c, first.memberId, weekId()).points, 12.25);
  applyAction(c, admin, "reviewActivity", { id: rounds[2].id, confirmed: false, reason: "Ghi dư một lượt" });
  assert.equal(weeklyScoreFor(c, first.memberId, weekId()).points, 5.25);
  applyAction(c, admin, "cancelEvent", { id: event.id });
  assert.equal(weeklyScoreFor(c, first.memberId, weekId()).points, 0);
});

test("Fixed event modes credit 0.25 for a single member or each approved round, consistently in reports", async () => {
  const club = fixture();
  const single = { ...eventData("event-fixed-one"), scoringMode: "single", participationMultiplier: 10 };
  const perRound = { ...eventData("event-fixed-many"), scoringMode: "perRound" };
  applyAction(club, admin, "createEvent", single);
  applyAction(club, admin, "createEvent", perRound);
  applyAction(club, user, "registerEvent", { eventId: single.id });
  applyAction(club, user, "registerEvent", { eventId: single.id });
  for (const registrationId of ["fixed-round-1", "fixed-round-2", "fixed-round-2", "fixed-round-3"]) {
    applyAction(club, user, "registerEvent", { eventId: perRound.id, registrationId });
  }
  const [one, first, second, third] = club.activityRegistrations!;
  assert.equal(club.activityRegistrations!.length, 4);
  for (const row of [one, first, second]) applyAction(club, admin, "reviewActivity", { id: row.id, confirmed: true });
  assert.equal(third.status, "pending");
  assert.equal(club.events![0].participationMultiplier, undefined);
  assert.deepEqual([one, first, second].map(row => activityPointsFor(club, row)), [0.25, 0.25, 0.25]);
  assert.throws(() => applyAction(club, admin, "editEvent", { ...perRound, scoringMode: "single" }), /nhiều lượt/);
  const month = today().slice(0, 7);
  assert.equal(weeklyScoreFor(club, "a1", weekId()).activityPoints.event, 0.75);
  assert.equal(monthlyScoreboard(club, month).find(row => row.memberId === "a1")?.points, 0.75);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await makeReport(club, month)).buffer);
  const detail = book.getWorksheet("Chi tiết hoạt động")!;
  assert.deepEqual([4, 5, 6, 7].map(row => detail.getCell(row, 8).value), [0.25, 0.25, 0.25, 0]);
});

test("Contribution events require an individual award on approval or direct addition and allow later adjustments", async () => {
  const club = fixture();
  const data = { ...eventData("event-contributions"), scoringMode: "contribution", requiresEvidence: true };
  applyAction(club, admin, "createEvent", data);
  const event = club.events![0];
  applyAction(club, user, "registerEvent", { eventId: event.id });
  const registration = club.activityRegistrations![0];
  const photoId = crypto.randomUUID();
  registration.evidence = { id: photoId, submittedAt: Date.now() };
  const review = { id: registration.id, confirmed: true };
  assert.throws(() => reviewEventRegistration(club, club.members[0], review, () => {}, photoId), /Nhập điểm đóng góp/);
  assert.throws(() => reviewEventRegistration(club, club.members[0], { ...review, contributionPoints: 1.234 }, () => {}, photoId), /Nhập điểm đóng góp/);
  const direct = { eventId: event.id, memberId: "a2" };
  assert.throws(() => applyAction(club, admin, "addEventParticipant", direct), /Nhập điểm đóng góp/);
  reviewEventRegistration(club, club.members[0], { ...review, contributionPoints: 0 }, () => {}, photoId);
  applyAction(club, admin, "addEventParticipant", { ...direct, contributionPoints: 2.15 });
  const edit = { id: registration.id, contributionPoints: 1.37 };
  assert.throws(() => applyAction(club, user, "saveEventContribution", edit), /Chỉ BĐH/);
  applyAction(club, admin, "saveEventContribution", edit);
  const month = today().slice(0, 7);
  assert.equal(weeklyScoreFor(club, "a1", weekId()).activityPoints.event, 1.37);
  assert.equal(monthlyScoreboard(club, month).find(row => row.memberId === "a2")?.points, 2.15);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await makeReport(club, month)).buffer);
  const detail = book.getWorksheet("Chi tiết hoạt động")!;
  assert.deepEqual([4, 5].map(row => [detail.getCell(row, 7).value, detail.getCell(row, 8).value]), [["", 1.37], ["", 2.15]]);
  applyAction(club, admin, "cancelEvent", { id: event.id });
  assert.equal(weeklyScoreFor(club, "a1", weekId()).activityPoints.event, 0);
  assert.throws(() => applyAction(club, admin, "saveEventContribution", edit), /Chỉ chỉnh điểm/);
});

test("BĐH accounts can manage the workspace and are excluded from both scoreboards and all Excel sheets", async () => {
  const c = fixture();
  const event = createEvent(c);
  applyAction(c, admin, "registerEvent", { eventId: event.id });
  const row = c.activityRegistrations![0];
  applyAction(c, admin, "reviewActivity", { id: row.id, confirmed: true });
  const month = today().slice(0, 7), week = weekId();
  const owner = c.members[0];
  c.schedules = [{ month, published: true, shifts: [{ id: "shift-admin", date: today(), period: "pm",
    assignments: [{ memberId: owner.id, result: "completed" }] }] }];
  const args = { memberId: owner.id, week, date: today(), kind: "special", points: 2 };
  assert.throws(() => applyAction(c, admin, "saveManualActivity", args), /tài khoản thành viên/);
  assert.throws(() => applyAction(c, admin, "deductPoints", { ...args, id: "exclude-admin", reason: "Điểm trừ" }), /tài khoản thành viên/);
  assert.equal(scoreFor(c, owner.id, month).points, 0);
  assert.ok(monthlyScoreboard(c, month).every(item => item.memberId !== owner.id));
  assert.ok(workspaceView(c, admin, 1).weeklyScores.every(item => item.memberId !== owner.id));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await makeReport(c, month)).buffer);
  for (const sheet of book.worksheets) {
    assert.ok(!JSON.stringify(sheet.getSheetValues()).includes(owner.name));
    assert.ok(!JSON.stringify(sheet.getSheetValues()).includes(owner.studentId));
  }
  assert.equal(workspaceView(c, admin, 1).isAdmin, true);
});

test("Members see the same monthly totals as the admin report across a split week without receiving private records", () => {
  const club = fixture();
  const week = "2026-08-31";
  const note = "ghi chú nội bộ của người khác";
  const base = { week, kind: "committee" as const, committee: "cs" as const, quantity: 1, note, updatedAt: "", updatedBy: "a0" };
  club.manualActivities = [
    { ...base, id: "aug-peer", memberId: "a2", date: week, points: 5.25 },
    { ...base, id: "sep-mine", memberId: "a1", date: "2026-09-01", points: 3.5 },
    { ...base, id: "sep-peer", kind: "special", memberId: "a2", date: "2026-09-02", points: 6.75 },
  ];
  club.members[0].joined = "2026-09-01";
  club.members[2].committee = "cs";
  const oldBoardLabels = ["Cán sự", "Ban điều hành", "Ban ĐH"];
  for (const label of oldBoardLabels)
    club.logs.push({ at: "", actor: "BĐH", text: `Nhập Điểm theo ban: Other, ${label} · 5.25 điểm, ngày 2026-08-31 (tuần 2026-08-31)` });
  const stored = JSON.stringify(club);
  const august = monthlyScoreboard(club, "2026-08");
  const september = monthlyScoreboard(club, "2026-09");
  assert.deepEqual(august.map(r => [r.memberId, r.points, r.committeeNames]), [
    ["a1", 0, "Chưa phân ban"], ["a2", 5.25, "Điều hành"],
  ]);
  assert.deepEqual(september.map(r => [r.memberId, r.points]), [["a1", 3.5], ["a2", 6.75]]);
  assert.equal(weeklyScoreFor(club, "a2", week).points, 12);
  for (const row of september) {
    const report = scoreFor(club, row.memberId, "2026-09");
    assert.equal(row.points, report.points);
    assert.deepEqual(row.activityCounts, report.activityCounts);
    assert.deepEqual(row.activityPoints, report.activityPoints);
    assert.deepEqual(row.attendancePoints, report.attendancePoints);
    assert.deepEqual(Object.keys(row).sort(), [
      "memberId", "name", "committeeNames", "points", "completed", "dutyMissed", "meetingMissed",
      "attended", "passed", "lateCount", "activityCounts", "activityPoints", "attendancePoints",
    ].sort());
  }
  const published = JSON.stringify([...august, ...september]);
  for (const privateValue of [note, "ACT002", "other-activity", "aug-peer"]) assert.ok(!published.includes(privateValue));
  assert.equal(activityName(club, club.manualActivities[0]), "Điều hành");
  assert.equal(activityName(club, { kind: "committee", committee: "dh" }), "Điều hành");
  const boardLogs = workspaceView(club, admin, 1).club.logs.filter(log => log.text.startsWith("Nhập Điểm theo ban: Other,"));
  assert.equal(boardLogs.length, oldBoardLabels.length);
  assert.ok(boardLogs.every(log => log.text.includes("Other, Điều hành · 5.25 điểm")));
  assert.equal(workspaceView(club, { ...user, userId: "other-activity" }, 1).isAdmin, false);
  assert.equal(JSON.stringify(club), stored);
});

test("Weekly score details use each month's attendance rules and add up to the recorded total", () => {
  const club = fixture();
  const week = "2026-08-31";
  const memberId = "a1";
  club.rules = [
    { month: "2026-08", A: 1.25, B: 0, C: 0, D: 0.25 },
    { month: "2026-09", A: 2.25, B: 0.5, C: 0, D: 0.5, E: 0.5 },
  ];
  club.schedules = [
    { month: "2026-08", published: true, shifts: [{
      id: "aug-last", date: week, period: "am", assignments: [{ memberId, result: "completed", late: true }],
    }] },
    { month: "2026-09", published: true, shifts: [
      { id: "sep-first", date: "2026-09-01", period: "am", assignments: [{ memberId, result: "completed", late: true }] },
      { id: "sep-second", date: "2026-09-02", period: "am", assignments: [{ memberId, result: "unexcused" }] },
    ] },
  ];
  club.weeks = [{
    id: week, meetingDate: "2026-09-02", location: "Phòng họp", time: "18:00", cancelled: false, closed: true,
    entries: [{ memberId, status: "attending", reason: "", excused: false, absent: false, passed: true }],
  }];
  const score = weeklyScoreFor(club, memberId, week);
  assert.deepEqual(score.attendancePoints, {
    completed: 3.5, dutyMissed: -0.5, meetingMissed: 0, lateCount: -0.75, passed: 0.5,
  });
  assert.equal(score.attended, 1);
  assert.equal(score.points, 2.75);
  assert.equal(Object.values(score.attendancePoints).reduce((total, value) => total + value, 0), score.points);
});

test("Event location persists when older clients omit it and clears when the form sends an empty string", () => {
  const club = fixture();
  const data = eventData();
  applyAction(club, admin, "createEvent", { ...data, location: "  Hội trường C1  " });
  const event = club.events![0];
  assert.equal(event.location, "Hội trường C1");
  applyAction(club, admin, "editEvent", { ...data, name: "Ngày hội của Đội" });
  assert.equal(event.location, "Hội trường C1");
  applyAction(club, admin, "editEvent", { ...data, location: "" });
  assert.equal(event.location, "");
});

test("Event hours can be added to a date-only event, preserved by older forms and cleared independently", () => {
  const club = fixture();
  const data = eventData();
  applyAction(club, admin, "createEvent", data);
  const event = club.events![0];
  assert.equal(event.startTime, undefined);
  const expiresAt = eventEvidenceExpiry(event);
  applyAction(club, admin, "editEvent", { ...data, startTime: "08:30", endTime: "10:45" });
  applyAction(club, admin, "editEvent", { ...data, location: "Hội trường" });
  assert.deepEqual([event.startTime, event.endTime], ["08:30", "10:45"]);
  assert.equal(eventEvidenceExpiry(event), expiresAt);
  assert.ok(isEventOpen(event, data.endDate));
  applyAction(club, admin, "editEvent", { ...data, endTime: "" });
  assert.deepEqual([event.startTime, event.endTime], ["08:30", undefined]);
});

test("Event hours require a valid clock range and support events that run overnight", () => {
  const club = fixture();
  const data = eventData();
  assert.throws(() => applyAction(club, admin, "createEvent", { ...data, startTime: "24:00" }), /HH:mm/);
  assert.throws(() => applyAction(club, admin, "createEvent", { ...data, endTime: null }), /HH:mm/);
  const hours = { startTime: "23:45", endTime: "00:15" };
  assert.throws(() => applyAction(club, admin, "createEvent", { ...data, ...hours }), /giờ kết thúc phải từ giờ bắt đầu/);
  const nextDay = addDays(data.endDate, 1);
  applyAction(club, admin, "createEvent", { ...data, ...hours, endDate: nextDay });
  const event = club.events![0];
  assert.equal(event.endDate, nextDay);
  assert.deepEqual([event.startTime, event.endTime], ["23:45", "00:15"]);
  assert.throws(() => applyAction(club, admin, "editEvent", data), /giờ kết thúc phải từ giờ bắt đầu/);
  assert.equal(event.endDate, nextDay);
});

function createEvent(c:ReturnType<typeof fixture>, data: ReturnType<typeof eventData> & { requiresEvidence?: boolean } = eventData()) {
 applyAction(c,admin,"createEvent",data);return c.events!.find(e=>e.id===data.id)!;
}
function register(c:ReturnType<typeof fixture>,eventId="event-test-1",identity=user) {
 applyAction(c,identity,"registerEvent",{eventId});return c.activityRegistrations!.find(r=>r.eventId===eventId&&r.memberId===c.members.find(m=>m.userId===identity.userId)!.id)!;
}
test("Self registrations for evidence events require review of the current photo", () => {
  const c = fixture();
  const event = createEvent(c, { ...eventData(), requiresEvidence: true });
  const row = register(c);
  const [reviewer, owner, other] = c.members;
  const approve = { id: row.id, confirmed: true };
  const review = (confirmed: boolean, photo: string, reason = "") =>
    reviewEventRegistration(c, reviewer, { ...approve, confirmed, reason }, () => {}, photo);
  assert.equal(eventEvidenceView(row, event, owner).canUpload, true);
  assert.equal(eventEvidenceView(row, event, reviewer).canReview, false);
  assert.equal(eventEvidenceTarget(c, other, row.id), null);
  assert.equal(eventEvidenceTarget(c, owner, "no registration"), null);
  assert.throws(() => applyAction(c, admin, "reviewActivity", approve), /minh chứng/);
  row.evidence = { id: crypto.randomUUID(), submittedAt: Date.now() };
  assert.throws(() => applyAction(c, admin, "reviewActivity", { ...approve, checkedPhoto: row.evidence!.id }), /minh chứng/);
  assert.throws(() => review(true, "replaced-id"), /minh chứng/);
  assert.throws(() => reviewEventRegistration(c, owner, approve, () => {}, row.evidence!.id), /Chỉ BĐH/);
  review(false, row.evidence.id, "Ảnh bị mờ");
  assert.equal(weeklyScoreFor(c, owner.id, row.week).activityCounts.event, 0);
  assert.equal(eventEvidenceView(row, event, owner).canUpload, true);
  assert.equal(eventEvidenceView(row, event, owner).evidence?.reviewNote, "Ảnh bị mờ");
  const rejectedId = row.evidence.id;
  // In production this transition is performed by the new photo upload route.
  row.evidence = { id: crypto.randomUUID(), submittedAt: Date.now() };
  row.status = "pending";
  assert.throws(() => review(true, rejectedId), /minh chứng/);
  review(true, row.evidence.id);
  assert.equal(eventEvidenceView(row, event, owner).canUpload, false);
  assert.equal(activityScoreFor(c, owner.id, row.week, true).activityPoints.event, 6);
  assert.equal(activityScoreFor(c, owner.id, row.date.slice(0, 7)).activityCounts.event, 1);
});

test("BĐH can directly credit a roster member without an account, registration or photo after an event ends", async () => {
  const c = fixture();
  const event = createEvent(c, { ...eventData("manual-past", 2.75), requiresEvidence: true });
  const endDate = addDays(weekId(), -5);
  applyAction(c, admin, "editEvent", { ...event, startDate: endDate, endDate });
  const member = c.members[2];
  delete member.userId;
  member.studentId = "";
  member.needsStudentId = true;
  const args = { eventId: event.id, memberId: member.id };
  applyAction(c, admin, "addEventParticipant", args);
  const row = c.activityRegistrations![0];
  const logged = c.logs.length;
  applyAction(c, admin, "addEventParticipant", args);
  assert.equal(c.logs.length, logged);
  assert.equal(c.activityRegistrations!.length, 1);
  assert.deepEqual([row.status, row.confirmedDirectly, row.reviewedBy, row.date, row.week, row.quantity],
    ["confirmed", true, c.members[0].id, endDate, weekId(endDate), 1]);
  assert.ok(row.reviewedAt);
  assert.equal(row.evidence, undefined);
  assert.equal(eventEvidenceView(row, event, member).canUpload, false);
  assert.equal(weeklyScoreFor(c, member.id, row.week).activityCounts.event, 1);
  assert.equal(scoreFor(c, member.id, endDate.slice(0, 7)).activityPoints.event, 2.75);
  const { buffer } = await makeReport(c, endDate.slice(0, 7));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const detail = workbook.getWorksheet("Chi tiết hoạt động")!.getRow(4);
  assert.equal(detail.getCell(8).value, 2.75);
  assert.equal(detail.getCell(9).value, "BĐH xác nhận trực tiếp");
  assert.equal(detail.getCell(11).text, "");
  applyAction(c, admin, "cancelEvent", { id: event.id });
  assert.equal(weeklyScoreFor(c, member.id, row.week).activityTotal, 0);
  applyAction(c, admin, "restoreEvent", { id: event.id, cancelledAt: event.cancelledAt });
  assert.equal(weeklyScoreFor(c, member.id, row.week).activityTotal, 2.75);
});

test("A direct confirmation reuses a pending registration and leaves its existing photo as an attachment", () => {
  const c = fixture();
  const event = createEvent(c, { ...eventData(), requiresEvidence: true });
  const row = register(c);
  const submittedAt = row.submittedAt, photoId = crypto.randomUUID();
  row.quantity = 2;
  row.date = addDays(event.endDate, -7);
  row.week = weekId(row.date);
  row.evidence = { id: photoId, submittedAt: Date.now() };
  const args = { eventId: event.id, memberId: row.memberId };
  applyAction(c, admin, "addEventParticipant", args);
  applyAction(c, user, "registerEvent", { eventId: event.id });
  assert.equal(c.activityRegistrations!.length, 1);
  assert.equal(row.submittedAt, submittedAt);
  assert.deepEqual([row.quantity, row.date, row.week], [1, event.endDate, weekId(event.endDate)]);
  assert.equal(weeklyScoreFor(c, row.memberId, row.week).activityTotal, event.points);
  const proof = eventEvidenceView(row, event, c.members[0]);
  assert.equal(proof.evidence?.id, photoId);
  assert.equal(proof.evidence?.status, "attached");
  assert.equal(proof.evidence?.reviewedAt, null);
  assert.equal(proof.canReview, false);
  applyAction(c, admin, "reviewActivity", { id: row.id, confirmed: false, reason: "Nhầm người" });
  assert.equal(weeklyScoreFor(c, row.memberId, row.week).activityTotal, 0);
  assert.throws(() => applyAction(c, admin, "addEventParticipant", args), /thay đổi/);
});

test("Direct confirmation can correct a withdrawal or rejection and preserves an actual photo rejection", () => {
  const c = fixture();
  const event = createEvent(c, { ...eventData(), requiresEvidence: true });
  const row = register(c);
  const args = { eventId: event.id, memberId: row.memberId };
  applyAction(c, user, "withdrawActivity", { id: row.id });
  applyAction(c, admin, "addEventParticipant", { ...args, previousStatus: "withdrawn", previousDecisionAt: row.submittedAt });
  assert.equal(row.status, "confirmed");
  const other = register(c, event.id, { ...user, userId: "other-activity" });
  other.evidence = { id: crypto.randomUUID(), submittedAt: Date.now() };
  reviewEventRegistration(c, c.members[0], { id: other.id, confirmed: false, reason: "Ảnh mờ" }, () => {}, other.evidence.id);
  const correction = { eventId: event.id, memberId: other.memberId, previousStatus: "declined", previousDecisionAt: other.reviewedAt };
  assert.throws(() => applyAction(c, admin, "addEventParticipant", correction), /lý do/);
  applyAction(c, admin, "addEventParticipant", { ...correction, reason: "BĐH có mặt tại sự kiện" });
  assert.equal(other.status, "confirmed");
  assert.equal(other.decision, "BĐH có mặt tại sự kiện");
  const proof = eventEvidenceView(other, event, c.members[0]);
  assert.equal(proof.evidence?.status, "rejected");
  assert.equal(proof.evidence?.reviewNote, "Ảnh mờ");
  assert.equal(c.activityRegistrations!.length, 2);
  assert.equal(weeklyScoreFor(c, other.memberId, other.week).activityTotal, event.points);
});

test("Direct attendance is restricted to BĐH, eligible members and non-cancelled events", () => {
  const c = fixture(), event = createEvent(c);
  const args = { eventId: event.id, memberId: c.members[1].id };
  assert.throws(() => applyAction(c, user, "addEventParticipant", args), /BĐH/);
  assert.throws(() => applyAction(c, admin, "addEventParticipant", { ...args, memberId: "missing" }), /thành viên/);
  assert.throws(() => applyAction(c, admin, "addEventParticipant", { ...args, eventId: "missing" }), /sự kiện/);
  c.members[1].joined = addDays(event.endDate, 1);
  assert.throws(() => applyAction(c, admin, "addEventParticipant", args), /không hoạt động/);
  c.members[1].joined = "2020-01-01";
  const row = register(c);
  applyAction(c, admin, "reviewActivity", { id: row.id, confirmed: true });
  const before = structuredClone(row);
  applyAction(c, admin, "addEventParticipant", args);
  assert.deepEqual(row, before);
  applyAction(c, admin, "cancelEvent", { id: event.id });
  assert.throws(() => applyAction(c, admin, "addEventParticipant", { ...args, memberId: "a2" }), /đã hủy/);
  assert.equal(c.activityRegistrations!.length, 1);
});

test("Event photos expire at Vietnam midnight after two full days, across months", () => {
  const c = fixture();
  const event = createEvent(c, { ...eventData(), requiresEvidence: true });
  const row = register(c);
  event.endDate = "2026-12-30";
  row.evidence = { id: crypto.randomUUID(), submittedAt: 100 };
  const expires = Date.parse("2027-01-02T00:00:00+07:00");
  assert.equal(eventEvidenceExpiry(event), expires);
  assert.equal(eventEvidenceView(row, event, c.members[0], expires - 1).canReview, true);
  assert.equal(eventEvidenceView(row, event, c.members[1], expires - 1).canUpload, true);
  assert.deepEqual(eventEvidenceView(row, event, c.members[1], expires), {
    evidence: null, expiresAt: expires, expired: true, canUpload: false, canReview: false,
  });
});

test("Photo cleanup deletes expired and orphaned files, preserving scores and extended events", async () => {
  let state = fixture();
  const expires = createEvent(state, { ...eventData("event-expiry"), requiresEvidence: true });
  const expiredRow = register(state, expires.id);
  const extended = createEvent(state, { ...eventData("event-extended", 3), requiresEvidence: true });
  const activeRow = register(state, extended.id);
  const expiredId = crypto.randomUUID(), activeId = crypto.randomUUID();
  expiredRow.evidence = { id: expiredId, submittedAt: Date.now() };
  activeRow.evidence = { id: activeId, submittedAt: Date.now() };
  reviewEventRegistration(state, state.members[0], { id: expiredRow.id, confirmed: true }, () => {}, expiredId);
  applyAction(state, admin, "editEvent", { ...extended, endDate: addDays(today(), 5) });
  const now = eventEvidenceExpiry(expires);
  const expiredKey = eventPhotoKey(expiredId), activeKey = eventPhotoKey(activeId);
  const orphanKey = eventPhotoKey(crypto.randomUUID()), stagingKey = eventPhotoKey(crypto.randomUUID());
  const objects = new Map([[expiredKey, now - 1000], [activeKey, now - 86400000],
    [orphanKey, now - 86400000], [stagingKey, now - 1000], ["duty-evidence/existing.jpg", now - 86400000]]);
  const db = {
    prepare(sql: string) {
      if (sql.startsWith("SELECT")) return { first: async () => ({ payload: JSON.stringify(state), revision: 1 }) };
      return { bind(payload: string) { return { async run() {
        state = JSON.parse(payload);
        return { meta: { changes: 1 } };
      } }; } };
    },
  } as unknown as D1Database;
  const bucket = {
    async list({ prefix }: { prefix: string }) {
      return { truncated: false, objects: [...objects].filter(([key]) => key.startsWith(prefix))
        .map(([key, timestamp]) => ({ key, uploaded: new Date(timestamp) })) };
    },
    async delete(keys: string[]) { for (const key of keys) objects.delete(key); },
  } as unknown as R2Bucket;
  assert.equal(await purgeExpiredEventPhotos(bucket, db, now), true);
  assert.deepEqual([...objects.keys()], [activeKey, stagingKey, "duty-evidence/existing.jpg"]);
  assert.equal(state.activityRegistrations?.find(r => r.id === expiredRow.id)?.evidence, undefined);
  assert.equal(state.activityRegistrations?.find(r => r.id === activeRow.id)?.evidence?.id, activeId);
  assert.equal(activityScoreFor(state, expiredRow.memberId, expiredRow.week, true).activityPoints.event, 6);
});
test("Only BĐH creates events with explicit name, points, ordered valid dates; create is idempotent",()=>{
 const c=fixture();assert.throws(()=>applyAction(c,user,"createEvent",eventData()),/BĐH/);
 for(const points of [-1,NaN,Infinity,100001,1.123,"5"]){assert.throws(()=>applyAction(c,admin,"createEvent",{...eventData(),points}),/Điểm sự kiện/);}
 for(const changes of [{name:" "},{startDate:"2026-02-30"},{startDate:addDays(today(),1)},{endDate:addDays(today(),-1)}])assert.throws(()=>applyAction(c,admin,"createEvent",{...eventData(),...changes}));
 createEvent(c);createEvent(c);assert.equal(c.events?.length,1);assert.equal(c.events![0].createdBy,"a0");
 assert.throws(()=>createEvent(c,eventData("event-test-1",7)),/nội dung khác/);
 createEvent(c,eventData("event-test-2",0));createEvent(c,eventData("event-test-3",2.25));assert.equal(c.events?.length,3);
});
test("An event description is visible to members and can be edited or cleared", () => {
  const club = fixture();
  const data = eventData();
  const description = "Có mặt lúc 8 giờ.\nMang theo thẻ sinh viên.";
  const create = { ...data, description: ` ${description}\n` };
  applyAction(club, admin, "createEvent", create);
  applyAction(club, admin, "createEvent", create);
  assert.equal(club.events?.length, 1);
  assert.equal(workspaceView(club, user, 1).club.events?.[0].description, description);
  assert.throws(() => applyAction(club, admin, "createEvent", { ...create, description: "Khác" }), /nội dung khác/);

  const updatedDescription = "Có mặt lúc 9 giờ.";
  applyAction(club, admin, "editEvent", { ...data, description: updatedDescription });
  applyAction(club, admin, "editEvent", { ...data, name: "Ngày hội cập nhật" });
  assert.equal(club.events?.[0].description, updatedDescription);
  applyAction(club, admin, "editEvent", { ...data, description: " " });
  assert.equal(workspaceView(club, user, 2).club.events?.[0].description, "");

  delete club.events![0].description;
  applyAction(club, admin, "editEvent", { ...data, description });
  assert.equal(club.events?.[0].description, description);
});
test("One registration per member/event, approved once at event points, ignoring spoofed score/owner/date/count",()=>{
 const c=fixture();createEvent(c);
 applyAction(c,user,"registerEvent",{eventId:"event-test-1",memberId:"a2",status:"confirmed",points:999,quantity:999,date:"2099-12-31"});
 const r=register(c);assert.equal(c.activityRegistrations?.length,1);assert.equal(r.memberId,"a1");assert.equal(r.status,"pending");assert.equal(r.quantity,1);assert.equal(r.date,today());
 assert.equal(scoreFor(c,"a1",today().slice(0,7)).points,0);
 applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:true});applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:true});register(c);
 assert.equal(scoreFor(c,"a1",today().slice(0,7)).points,6);assert.equal(scoreFor(c,"a2",today().slice(0,7)).points,0);
 assert.throws(()=>applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:false}),/lý do/);
 applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:false,reason:"Điều chỉnh kết quả"});assert.equal(scoreFor(c,"a1",today().slice(0,7)).points,0);
 applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:true,reason:"Xác nhận lại"});assert.equal(scoreFor(c,"a1",today().slice(0,7)).points,6);
});
test("Member cannot review, create free-form activity, or withdraw another member; own withdraw/rejoin reuses row",()=>{
 const c=fixture();createEvent(c);const r=register(c);
 assert.throws(()=>applyAction(c,user,"reviewActivity",{id:r.id,confirmed:true}),/BĐH/);
 assert.throws(()=>applyAction(c,user,"saveManualActivity",{memberId:"a1"}),/BĐH/);
 assert.throws(()=>applyAction(c,user,"registerActivity",{kind:"lecture",quantity:1000}),/sự kiện do BĐH/);
 assert.throws(()=>applyAction(c,{...user,userId:"other-activity"},"withdrawActivity",{id:r.id}),/của bạn/);
 applyAction(c,user,"withdrawActivity",{id:r.id});assert.throws(()=>applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:true}),/đã rút/);
 assert.equal(register(c).id,r.id);assert.equal(c.activityRegistrations?.length,1);assert.equal(r.status,"pending");
 assert.throws(()=>applyAction(c,user,"registerEvent",{eventId:"missing"}),/Không tìm thấy/);
 c.members[1].needsStudentId=true;assert.throws(()=>register(c),/MSSV/);
});
test("Registration closes after end date in Vietnam; future events are available; no registration means no absence",()=>{
 const c=fixture();const future=createEvent(c,eventData("event-future",5,addDays(today(),5),addDays(today(),10)));
 assert.equal(register(c,future.id).status,"pending");
 c.events!.push({...future,id:"event-ended",startDate:addDays(today(),-3),endDate:addDays(today(),-1)});
 assert.throws(()=>register(c,"event-ended"),/đã kết thúc/);
 assert.equal(activityScoreFor(c,"a2",weekId(),true).activityTotal,0);
});
test("Multiweek, cross-month event is credited once to end-date week/month and independent of settings rates",()=>{
 const c=fixture();const start=today();const nextMonth=new Date(start+"T12:00:00Z");nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);nextMonth.setUTCDate(3);const end=nextMonth.toISOString().slice(0,10);
 const e=createEvent(c,eventData("event-multiweek",12.5,start,end));const r=register(c,e.id);
 applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:true});
 c.rules.push({month:end.slice(0,7),A:99,B:99,C:99,D:99,activities:{event:9999,lecture:999}});
 assert.equal(activityScoreFor(c,"a1",weekId(start),true).activityTotal,0);assert.equal(activityScoreFor(c,"a1",weekId(end),true).activityTotal,12.5);
 assert.equal(scoreFor(c,"a1",start.slice(0,7)).activityTotal,0);assert.equal(scoreFor(c,"a1",end.slice(0,7)).activityTotal,12.5);
 assert.equal(weeklyScoreFor(c,"a1",weekId(end)).activityCounts.event,1);
 const before=structuredClone(c.activityRegistrations);syncWeeks(c,addDays(weekId(end),7));assert.deepEqual(c.activityRegistrations,before);
 assert.equal(activityScoreFor(c,"a1",addDays(weekId(end),7),true).activityTotal,0);
});
test("Editing an event moves existing registrations and updates the credited week, month, and points", () => {
  const c = fixture();
  const event = createEvent(c);
  const confirmed = register(c, event.id);
  const pending = register(c, event.id, { ...user, userId: "other-activity" });
  applyAction(c, admin, "reviewActivity", { id: confirmed.id, confirmed: true });
  const previousDate = event.endDate;
  const endDate = addDays(previousDate, 35);
  const edit = { id: event.id, name: "Ngày hội đổi lịch", startDate: addDays(endDate, -2), endDate, points: 14.25 };

  assert.throws(() => applyAction(c, user, "editEvent", edit), /BĐH/);
  assert.throws(() => applyAction(c, admin, "editEvent", { ...edit, endDate: previousDate }), /Ngày bắt đầu/);
  assert.equal(scoreFor(c, "a1", previousDate.slice(0, 7)).activityTotal, 6);
  applyAction(c, admin, "editEvent", edit);
  applyAction(c, admin, "editEvent", edit);

  assert.equal(c.events?.length, 1);
  assert.equal(event.name, edit.name);
  assert.equal(c.activityRegistrations?.length, 2);
  assert.deepEqual([confirmed.status, pending.status], ["confirmed", "pending"]);
  for (const row of [confirmed, pending]) assert.deepEqual([row.date, row.week], [endDate, weekId(endDate)]);
  assert.equal(weeklyScoreFor(c, "a1", weekId(previousDate)).activityTotal, 0);
  assert.equal(weeklyScoreFor(c, "a1", weekId(endDate)).activityTotal, 14.25);
  assert.equal(scoreFor(c, "a1", previousDate.slice(0, 7)).activityTotal, 0);
  assert.equal(scoreFor(c, "a1", endDate.slice(0, 7)).activityTotal, 14.25);
  assert.equal(scoreFor(c, "a2", endDate.slice(0, 7)).activityTotal, 0);
});
test("Cancelling an event preserves registrations and removes its count and points from reports", async () => {
  const c = fixture();
  const event = createEvent(c);
  const confirmed = register(c, event.id);
  const other = { ...user, userId: "other-activity" };
  const pending = register(c, event.id, other);
  applyAction(c, admin, "reviewActivity", { id: confirmed.id, confirmed: true });
  const registrationHistory = structuredClone(c.activityRegistrations);

  assert.throws(() => applyAction(c, user, "cancelEvent", { id: event.id }), /BĐH/);
  assert.equal(weeklyScoreFor(c, "a1", weekId()).activityTotal, 6);
  applyAction(c, admin, "cancelEvent", { id: event.id });
  const cancelledAt = event.cancelledAt;
  applyAction(c, admin, "cancelEvent", { id: event.id });

  assert.ok(cancelledAt);
  assert.equal(event.cancelledAt, cancelledAt);
  assert.deepEqual(c.activityRegistrations, registrationHistory);
  assert.throws(() => register(c, event.id, admin), /đã hủy/);
  assert.throws(() => applyAction(c, admin, "reviewActivity", { id: pending.id, confirmed: true }), /đã hủy/);
  assert.throws(() => applyAction(c, other, "withdrawActivity", { id: pending.id }), /đã hủy/);
  assert.throws(() => applyAction(c, admin, "editEvent", { ...event, points: 8 }), /đã hủy/);
  assert.equal(weeklyScoreFor(c, "a1", weekId()).activityCounts.event, 0);
  assert.equal(weeklyScoreFor(c, "a1", weekId()).activityTotal, 0);
  assert.equal(workspaceView(c, user, 1).club.events?.[0].cancelledAt, cancelledAt);

  const { buffer, warnings } = await makeReport(c, event.endDate.slice(0, 7));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as any);
  const detail = book.getWorksheet("Chi tiết hoạt động")!;
  assert.ok(!warnings.some(w => w.includes("đăng ký hoạt động")));
  for (const row of [4, 5]) {
    assert.equal(detail.getCell(row, 8).value, 0);
    assert.equal(detail.getCell(row, 9).value, "Sự kiện đã hủy");
  }
});

test("Restoring an event reinstates approved points and unexpired evidence without changing the end date", () => {
  const club = fixture();
  const event = createEvent(club, { ...eventData(), requiresEvidence: true });
  const row = register(club, event.id);
  const photo = crypto.randomUUID();
  row.evidence = { id: photo, submittedAt: Date.now() };
  reviewEventRegistration(club, club.members[0], { id: row.id, confirmed: true }, () => {}, photo);
  const approved = structuredClone(row);
  const score = () => weeklyScoreFor(club, row.memberId, row.week).activityTotal;
  applyAction(club, admin, "cancelEvent", { id: event.id });
  const restore = { id: event.id, cancelledAt: event.cancelledAt };
  assert.equal(score(), 0);
  assert.equal(eventEvidenceTarget(club, club.members[0], row.id), null);
  assert.ok(detachExpiredEventPhotos(club, Date.now()).retained.has(photo));
  assert.throws(() => applyAction(club, user, "restoreEvent", restore), /BĐH/);
  assert.throws(() => applyAction(club, admin, "restoreEvent", { ...restore, cancelledAt: "stale" }), /vừa thay đổi/);
  applyAction(club, admin, "restoreEvent", restore);
  applyAction(club, admin, "restoreEvent", restore);
  assert.deepEqual(row, approved);
  assert.equal(eventEvidenceTarget(club, club.members[1], row.id)?.row.evidence?.id, photo);
  assert.equal(score(), event.points);
  assert.equal(isEventOpen(event, today()), true);
  assert.equal(isEventOpen(event, addDays(event.endDate, 1)), false);

  applyAction(club, admin, "cancelEvent", { id: event.id });
  assert.ok(detachExpiredEventPhotos(club, eventEvidenceExpiry(event)).detached.has(photo));
  applyAction(club, admin, "restoreEvent", { id: event.id, cancelledAt: event.cancelledAt });
  assert.equal(row.evidence, undefined);
  assert.equal(score(), event.points);
});
test("Published event details are visible to members while others' registrations and review notes stay private",()=>{
 const c=fixture();createEvent(c);const r=register(c,"event-test-1",{...user,userId:"other-activity"});applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:true,reason:"private decision"});
 const v=workspaceView(c,user,1);assert.equal(v.club.events?.[0].name,"Ngày hội C2");assert.equal(v.club.activityRegistrations?.length,0);assert.ok(!JSON.stringify(v).includes("private decision"));
 assert.equal(v.weeklyScores.find(s=>s.week===weekId()&&s.memberId==="a2")?.points,6);
 assert.equal(workspaceView(c,admin,1).club.activityRegistrations?.length,1);
});
test("Fractional event scores add without binary decimal artifacts",()=>{
 const c=fixture();for(const [id,points] of [["event-decimal-1",0.1],["event-decimal-2",0.2]] as const){createEvent(c,eventData(id,points));const r=register(c,id);applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:true});}
 assert.equal(scoreFor(c,"a1",today().slice(0,7)).points,0.3);assert.equal(weeklyScoreFor(c,"a1",weekId()).points,0.3);
});
test("Legacy activity registrations stay stored and cannot be reviewed or scored as events",()=>{
 const c=fixture();c.activityRegistrations=[{id:"legacy-1",memberId:"a1",kind:"lecture",quantity:2,week:weekId(),date:today(),note:"old activity",status:"pending",submittedAt:new Date().toISOString()}];
 const original=structuredClone(c.activityRegistrations);
 assert.throws(()=>applyAction(c,admin,"reviewActivity",{id:"legacy-1",confirmed:true}),/Tạo sự kiện/);
 assert.deepEqual(c.activityRegistrations,original);
 c.activityRegistrations[0].status="confirmed";
 assert.equal(activityScoreFor(c,"a1",weekId(),true).activityTotal,0);
});
test("Initiative counts replace the same week value and clear independently from direct points",()=>{
 const c=fixture();const data={week:weekId(),date:today(),memberId:"a1",kind:"initiative",quantity:2};
 applyAction(c,admin,"saveManualActivity",data);applyAction(c,admin,"saveManualActivity",data);
 applyAction(c,admin,"saveManualActivity",{...data,kind:"special",points:3});
 assert.equal(c.manualActivities?.length,2);assert.equal(activityScoreFor(c,"a1",weekId(),true).activityTotal,17);
 applyAction(c,admin,"saveManualActivity",{...data,quantity:0});assert.equal(activityScoreFor(c,"a1",weekId(),true).activityTotal,3);
 assert.throws(()=>applyAction(c,admin,"saveManualActivity",{...data,quantity:1.2}),/số nguyên/);
});
test("Weekly public totals cover both months without double counting and do not expose private activity notes",()=>{
 const c=fixture();const old="2026-10-26";syncWeeks(c,old);if(!c.weeks.some(w=>w.id===old))c.weeks.push({...c.weeks[0],id:old,meetingDate:"",entries:[]});
 c.rules.push({month:"2026-11",A:10,B:10,C:5,D:5,activities:{initiative:10,special:20}});
 applyAction(c,admin,"saveManualActivity",{week:old,date:"2026-10-31",memberId:"a2",kind:"initiative",quantity:2,note:"private note"});
 c.manualActivities!.push({id:"legacy-special",week:old,date:"2026-11-01",memberId:"a2",kind:"special",quantity:3,note:"private special",updatedAt:new Date().toISOString(),updatedBy:"a0"});
 assert.equal(scoreFor(c,"a2","2026-10").activityTotal,14);assert.equal(scoreFor(c,"a2","2026-11").activityTotal,60);assert.equal(weeklyScoreFor(c,"a2",old).points,74);
 const v=workspaceView(c,user,1);assert.equal(v.weeklyScores.find(s=>s.week===old&&s.memberId==="a2")?.points,74);
 assert.equal(v.club.manualActivities?.length,0);assert.ok(!JSON.stringify(v).includes("private note"));assert.ok(!JSON.stringify(v).includes("private special"));
});

test("Settings update initiative and peer educator rates and retain stored legacy rates and event points",()=>{
 const c=fixture(),month=today().slice(0,7);createEvent(c);applyAction(c,admin,"settings",{rule:{month,A:10,B:10,C:5,D:5}});assert.equal(c.rules.at(-1)?.activities?.lecture,3);
 applyAction(c,admin,"settings",{rule:{month,A:10,B:10,C:5,D:5,activities:{...Object.fromEntries(ratedActivityKinds.map(k=>[k,2])),lecture:999,c2:999,project:999,special:999}}});
 assert.deepEqual(c.rules.at(-1)?.activities,{lecture:3,c2:4,ddv:2,project:6,initiative:2,special:8});assert.equal(c.events![0].points,6);
 for(const kind of ratedActivityKinds) assert.throws(()=>applyAction(c,admin,"settings",{rule:{month,A:10,B:10,C:5,D:5,activities:{[kind]:-1}}}),/không âm/);
});
test("Excel and weekly scores agree across all active point kinds and keep private points just before deductions",async()=>{
 const c=fixture();createEvent(c);createEvent(c,eventData("event-pending-2",100));const r=register(c);applyAction(c,admin,"reviewActivity",{id:r.id,confirmed:true});register(c,"event-pending-2");
 const data={week:weekId(),date:today(),memberId:"a1"};
 c.rules[0].E=2.75;
 c.weeks.find(w=>w.id===data.week)!.meetingDate=data.date;
 applyAction(c,admin,"entry",{...data,status:"attending",passed:true});
 applyAction(c,admin,"saveManualActivity",{...data,kind:"initiative",quantity:3});
 applyAction(c,admin,"saveManualActivity",{...data,kind:"ddv",quantity:2});
 applyAction(c,admin,"saveManualActivity",{...data,kind:"committee",committee:"cm",points:3.25});
 applyAction(c,admin,"saveManualActivity",{...data,kind:"special",points:2.5});
 applyAction(c,admin,"deductPoints",{...data,id:"excel-all-kinds",points:1.5,reason:"Điều chỉnh điểm"});
 const {buffer,warnings}=await makeReport(c,today().slice(0,7));const book=new ExcelJS.Workbook();await book.xlsx.load(buffer as any);
 assert.equal(book.worksheets.length,5);assert.ok(warnings.some(w=>w.includes("hoạt động")));
 const sheet=book.getWorksheet("Chi tiết hoạt động")!;assert.equal(sheet.rowCount,10);
 const points=[4,5,6,7,8,9,10].map(r=>Number(sheet.getCell(r,8).value));assert.equal(points.reduce((n,v)=>n+v,0),41.25);assert.ok(points.includes(0));
 assert.equal(sheet.getCell(4,5).value,"Ngày hội C2");assert.equal(sheet.getCell(4,13).value,today());assert.equal(sheet.getCell(4,14).value,today());
 const summary=book.getWorksheet("Tổng hợp tháng")!;
 const headers=summary.getRow(3).values as string[];
 assert.deepEqual(headers.slice(-6),["Sáng kiến (lượt)","Đồng đẳng viên (lượt)","Sự kiện (lượt)","Điểm theo ban","Điểm riêng","Điểm trừ"]);
 assert.equal(summary.getCell("H4").value,1);
 assert.equal(summary.getCell("I4").value,44);
 assert.equal(weeklyScoreFor(c,"a1",weekId()).points,44);
 assert.equal(scoreFor(c,"a1",today().slice(0,7)).points,44);
});
test("Public weekly total uses actual meeting/duty dates, both monthly rates, and excludes drafts/outside week",()=>{
 const c=fixture(),week="2026-10-26";
 c.rules.push({month:"2026-11",A:20,B:15,C:7,D:2,activities:{}});
 c.schedules=[{month:"2026-10",published:true,shifts:[{id:"oct",date:"2026-10-31",period:"am",assignments:[{memberId:"a1",result:"completed"}]}]},
 {month:"2026-11",published:true,shifts:[{id:"nov",date:"2026-11-01",period:"am",assignments:[{memberId:"a1",result:"completed",late:true}]},{id:"draft",date:"2026-11-01",period:"pm",draft:true,assignments:[{memberId:"a1",result:"completed"}]},{id:"next",date:"2026-11-02",period:"am",assignments:[{memberId:"a1",result:"completed"}]}]}];
 c.weeks=[{id:week,meetingDate:"2026-11-01",time:"18:30",location:"C1",closed:true,cancelled:false,entries:[{memberId:"a1",status:"absent",absent:true,excused:false,reason:"",passed:false}]}];
 const score=weeklyScoreFor(c,"a1",week);assert.equal(score.completed,2);assert.equal(score.lateCount,1);assert.equal(score.meetingMissed,1);assert.equal(score.points,21);
 assert.equal(workspaceView(c,user,1).weeklyScores.find(s=>s.memberId==="a1")?.points,21);
});

test("Only BĐH deducts direct points with mandatory reason; same save is idempotent and ignores weights",()=>{
 const c=fixture();const data={id:'deduction-test-1',memberId:'a1',week:weekId(),date:today(),points:3.5,reason:'Không hoàn thành nhiệm vụ'};
 assert.throws(()=>applyAction(c,user,'deductPoints',data),/BĐH/);
 for(const points of [0,-1,NaN,Infinity,100001,1.123,'3'])assert.throws(()=>applyAction(c,admin,'deductPoints',{...data,points}),/Số điểm trừ/);
 assert.throws(()=>applyAction(c,admin,'deductPoints',{...data,reason:' '}),/lý do trừ/);
 assert.throws(()=>applyAction(c,admin,'deductPoints',{...data,date:addDays(weekId(),7)}),/trong tuần/);
 createEvent(c,eventData('event-with-deduction',13.5));const r=register(c,'event-with-deduction');applyAction(c,admin,'reviewActivity',{id:r.id,confirmed:true});
 applyAction(c,admin,'deductPoints',data);applyAction(c,admin,'deductPoints',data);
 assert.equal(c.pointDeductions?.length,1);assert.equal(c.pointDeductions![0].createdBy,'a0');assert.equal(c.pointDeductions![0].reason,data.reason);
 assert.equal(scoreFor(c,'a1',today().slice(0,7)).points,10);assert.equal(weeklyScoreFor(c,'a1',weekId()).activityCounts.deduction,3.5);
 assert.throws(()=>applyAction(c,admin,'deductPoints',{...data,points:9}),/nội dung khác/);
});
test("Multiple deductions accumulate, new week starts at zero, cancellation restores only its own points and retains audit",()=>{
 const c=fixture();const data={id:'deduction-first',memberId:'a1',week:weekId(),date:today(),points:3,reason:'Lý do khoản thứ nhất'};
 applyAction(c,admin,'deductPoints',data);applyAction(c,admin,'deductPoints',{...data,id:'deduction-second',points:2.25,reason:'Lý do khoản thứ hai'});
 assert.equal(activityScoreFor(c,'a1',weekId(),true).activityTotal,-5.25);
 assert.throws(()=>applyAction(c,user,'cancelPointDeduction',{id:data.id,reason:'Nhập nhầm'}),/BĐH/);
 assert.throws(()=>applyAction(c,admin,'cancelPointDeduction',{id:data.id}),/lý do hủy/);
 applyAction(c,admin,'cancelPointDeduction',{id:data.id,reason:'Nhập nhầm khoản này'});applyAction(c,admin,'cancelPointDeduction',{id:data.id,reason:'Nhập nhầm khoản này'});
 assert.equal(activityScoreFor(c,'a1',weekId(),true).activityTotal,-2.25);assert.equal(c.pointDeductions?.length,2);assert.equal(c.pointDeductions![0].reason,data.reason);assert.equal(c.pointDeductions![0].cancelledBy,'a0');
 const before=structuredClone(c.pointDeductions),old=weekId();syncWeeks(c,addDays(old,7));assert.deepEqual(c.pointDeductions,before);assert.equal(activityScoreFor(c,'a1',addDays(old,7),true).activityTotal,0);assert.equal(activityScoreFor(c,'a1',old,true).activityTotal,-2.25);
});
test("Deduction reason is visible only to BĐH and involved member; aggregate weekly deduction is public",()=>{
 const c=fixture();applyAction(c,admin,'deductPoints',{id:'deduction-private',memberId:'a2',week:weekId(),date:today(),points:7,reason:'private deduction reason'});
 const v=workspaceView(c,user,1);assert.equal(v.club.pointDeductions?.length,0);assert.ok(!JSON.stringify(v).includes('private deduction reason'));assert.equal(v.weeklyScores.find(r=>r.memberId==='a2'&&r.week===weekId())?.points,-7);
 assert.equal(workspaceView(c,{...user,userId:'other-activity'},1).club.pointDeductions?.[0].reason,'private deduction reason');assert.equal(workspaceView(c,admin,1).club.pointDeductions?.length,1);
});
test("Monthly Excel exports negative deductions with reasons, cancelled zero, and net total",async()=>{
 const c=fixture();const data={id:'deduction-excel-1',memberId:'a1',week:weekId(),date:today(),points:4,reason:'Lý do xuất Excel'};
 applyAction(c,admin,'deductPoints',data);applyAction(c,admin,'deductPoints',{...data,id:'deduction-excel-2',points:2});applyAction(c,admin,'cancelPointDeduction',{id:'deduction-excel-2',reason:'Điều chỉnh nhập nhầm'});
 const {buffer}=await makeReport(c,today().slice(0,7));const book=new ExcelJS.Workbook();await book.xlsx.load(buffer as any);const detail=book.getWorksheet('Chi tiết hoạt động')!;
 assert.equal(detail.getCell('H4').value,-4);assert.equal(detail.getCell('J4').value,data.reason);assert.equal(detail.getCell('H5').value,0);assert.equal(detail.getCell('L5').value,'Điều chỉnh nhập nhầm');assert.equal(book.getWorksheet('Tổng hợp tháng')!.getCell('I4').value,-4);
});

test("Direct special points ignore quantities and historical rate, replace on retry, clear at zero, and reject invalid inputs",()=>{
 const c=fixture(),data={week:weekId(),date:today(),memberId:"a1",kind:"special",points:7.5,quantity:999};
 assert.throws(()=>applyAction(c,user,"saveManualActivity",data),/BĐH/);
 for(const points of [-1,NaN,Infinity,100001,1.123,"5",undefined])assert.throws(()=>applyAction(c,admin,"saveManualActivity",{...data,points}),/Điểm riêng/);
 applyAction(c,admin,"saveManualActivity",data);applyAction(c,admin,"saveManualActivity",data);
 assert.equal(c.manualActivities?.length,1);assert.equal(c.manualActivities![0].quantity,1);
 assert.equal(activityScoreFor(c,"a1",weekId(),true).activityCounts.special,7.5);
 assert.equal(weeklyScoreFor(c,"a1",weekId()).points,7.5);
 applyAction(c,admin,"saveManualActivity",{...data,points:2.25});assert.equal(scoreFor(c,"a1",today().slice(0,7)).points,2.25);
 applyAction(c,admin,"saveManualActivity",{...data,points:0});assert.equal(weeklyScoreFor(c,"a1",weekId()).points,0);
});
test("Legacy special points keep old value until explicitly replaced with direct points",()=>{
 const c=fixture();c.manualActivities=[{id:"old-special",memberId:"a1",week:weekId(),date:today(),kind:"special",quantity:3,note:"",updatedAt:"",updatedBy:"a0"}];
 assert.equal(activityScoreFor(c,"a1",weekId(),true).activityCounts.special,24);
 const row=c.manualActivities[0];assert.equal(row.quantity*activityUnitPoints(c,row),24);
 applyAction(c,admin,"settings",{rule:{month:today().slice(0,7),A:10,B:10,C:5,D:5}});
 assert.equal(weeklyScoreFor(c,"a1",weekId()).points,24);
 applyAction(c,admin,"saveManualActivity",{memberId:"a1",week:weekId(),date:today(),kind:"special",points:11});
 assert.equal(c.manualActivities.length,1);assert.equal(c.manualActivities[0].id,"old-special");assert.equal(weeklyScoreFor(c,"a1",weekId()).points,11);
});
test("Settings preserve old committee rates without accepting new committee coefficients",()=>{
 const c=fixture(),month=today().slice(0,7),committees={dh:10,cm:8.5,tt:6,sk:4,hc:2};
 c.rules[0].committees=committees;
 const data={rule:{month,A:10,B:10,C:5,D:5,committees}};
 assert.throws(()=>applyAction(c,user,"settings",data));
 applyAction(c,admin,"settings",{rule:{month,A:10,B:10,C:5,D:5,committees:{cm:9}}});
 assert.deepEqual(c.rules.at(-1)?.committees,committees);
 applyAction(c,admin,"settings",{rule:{month:"2099-12",A:10,B:10,C:5,D:5}});
 assert.deepEqual(c.rules.at(-1)?.committees,committees);
});
test("BĐH enters exact committee points once per member/week, replacing or clearing the previous score",()=>{
 const c=fixture(),old=weekId();c.rules[0].committees={dh:10,cm:8.5,tt:6,sk:4,hc:2};
 const data={week:old,date:today(),memberId:"a1",kind:"committee",committee:"cm",points:12.75,quantity:999};
 assert.throws(()=>applyAction(c,user,"saveManualActivity",data),/BĐH/);
 for(const committee of ["unknown","hc","dh",null,undefined,7])assert.throws(()=>applyAction(c,admin,"saveManualActivity",{...data,committee}),/Chọn một trong/);
 for(const points of [undefined,-1,NaN,Infinity,100001,1.123,"5"])assert.throws(()=>applyAction(c,admin,"saveManualActivity",{...data,points}),/Điểm theo ban/);
 for(const committee of committeeKinds){applyAction(c,admin,"saveManualActivity",{...data,committee});assert.equal(weeklyScoreFor(c,"a1",old).activityCounts.committee,12.75);}
 applyAction(c,admin,"saveManualActivity",{...data,points:4.5});applyAction(c,admin,"saveManualActivity",{...data,points:4.5});
 assert.equal(c.manualActivities?.length,1);assert.equal(weeklyScoreFor(c,"a1",old).points,4.5);
 const before=structuredClone(c.manualActivities);syncWeeks(c,addDays(old,7));assert.deepEqual(c.manualActivities,before);assert.equal(activityScoreFor(c,"a1",addDays(old,7),true).activityTotal,0);
 applyAction(c,admin,"saveManualActivity",{...data,committee:""});assert.equal(weeklyScoreFor(c,"a1",old).points,0);
});
test("Legacy committee scores keep their original monthly rates until explicitly updated",()=>{
 const c=fixture(),week="2026-10-26";syncWeeks(c,week);if(!c.weeks.some(w=>w.id===week))c.weeks.push({...c.weeks[0],id:week,meetingDate:"",entries:[]});
 c.rules[0].committees={cm:3};c.rules.push({month:"2026-11",A:10,B:10,C:5,D:5,committees:{cm:9}});
 const note="private committee note";
 c.manualActivities=[
   {id:"old-october",week,date:"2026-10-31",memberId:"a1",kind:"committee",committee:"cm",quantity:1,note,updatedAt:"",updatedBy:"a0"},
   {id:"old-november",week,date:"2026-11-01",memberId:"a2",kind:"committee",committee:"cm",quantity:1,note,updatedAt:"",updatedBy:"a0"},
 ];
 assert.equal(scoreFor(c,"a1","2026-10").activityTotal,3);
 assert.equal(scoreFor(c,"a2","2026-11").activityTotal,9);
 applyAction(c,admin,"saveManualActivity",{week,date:"2026-11-01",memberId:"a2",kind:"committee",committee:"cm",points:5.5,note});
 assert.equal(c.manualActivities[1].id,"old-november");
 assert.equal(scoreFor(c,"a1","2026-10").activityTotal,3);
 assert.equal(scoreFor(c,"a2","2026-11").activityTotal,5.5);
 const v=workspaceView(c,user,1);assert.ok(!JSON.stringify(v).includes("old-november"));assert.equal(v.weeklyScores.find(s=>s.week===week&&s.memberId==="a2")?.points,5.5);
});
test("Retired activity rows are preserved in storage and excluded from weekly scores and Excel",async()=>{
 const c=fixture(),date=today(),week=weekId();
 for(const kind of ["lecture","c2","project"])assert.throws(()=>applyAction(c,admin,"saveManualActivity",{memberId:"a1",kind,quantity:1,date,week}),/hợp lệ/);
 assert.throws(()=>applyAction(c,user,"registerActivity",{kind:"c2",quantity:1,date,week}),/sự kiện do BĐH/);
 c.manualActivities=[{id:"old-project",memberId:"a1",kind:"project",quantity:2,date,week,note:"old entry",updatedAt:"",updatedBy:"a0"}];
 c.activityRegistrations=(["c2","lecture"] as const).map(kind=>({id:"old-"+kind,memberId:"a1",kind,quantity:3,date,week,note:"old registration",status:"confirmed",submittedAt:""}));
 const oldRows=structuredClone([c.manualActivities,c.activityRegistrations]);
 assert.equal(weeklyScoreFor(c,"a1",week).points,0);
 applyAction(c,admin,"settings",{rule:{month:date.slice(0,7),A:10,B:10,C:5,D:5,activities:{c2:0,project:0,lecture:0}}});
 const {buffer}=await makeReport(c,date.slice(0,7)),book=new ExcelJS.Workbook();await book.xlsx.load(buffer as any);
 assert.equal(book.getWorksheet("Chi tiết hoạt động")!.rowCount,3);
 assert.equal(book.getWorksheet("Tổng hợp tháng")!.getCell("I5").value,0);
 assert.deepEqual([c.manualActivities,c.activityRegistrations],oldRows);
 assert.deepEqual(visibleActivityKinds,["initiative","ddv","event","committee","special","deduction"]);
});
test("Retiring a committee keeps its awarded points in weekly, monthly and Excel totals", async () => {
  const c = fixture(), date = today(), week = weekId(), month = date.slice(0, 7);
  c.rules[0].committees = { hc: 2.75 };
  c.manualActivities = [{ id: "historical-award", memberId: "a1", kind: "committee", committee: "hc", week, date, quantity: 1, note: "", updatedAt: "", updatedBy: "a0" }];
  c.logs = [{ at: date, actor: "Admin", text: "Nhập Điểm theo ban: Member, Ban HC · 2.75 điểm, ngày " + date }];
  assert.equal(weeklyScoreFor(c, "a1", week).points, 2.75);
  assert.equal(scoreFor(c, "a1", month).points, 2.75);
  assert.match(workspaceView(c, admin, 1).club.logs[0].text, /Member, 2.75 điểm/);
  const { buffer } = await makeReport(c, month);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as any);
  const row = book.getWorksheet("Chi tiết hoạt động")!.getRow(4);
  assert.equal(row.getCell(5).value, "Điểm theo ban");
  assert.equal(row.getCell(8).value, 2.75);
  assert.equal(c.manualActivities[0].committee, "hc");
});
test("Excel reports direct special and committee points, with the selected ban and no per-visit figures for committee points",async()=>{
 const c=fixture();c.rules[0].committees={dh:10,cm:8.5,tt:6,sk:4,hc:2};const data={memberId:"a1",week:weekId(),date:today()};
 applyAction(c,admin,"saveManualActivity",{...data,kind:"special",points:7.5});applyAction(c,admin,"saveManualActivity",{...data,kind:"committee",committee:"cm",points:13.25});
 const {buffer}=await makeReport(c,today().slice(0,7)),book=new ExcelJS.Workbook();await book.xlsx.load(buffer as any);
 const summary=book.getWorksheet("Tổng hợp tháng")!,detail=book.getWorksheet("Chi tiết hoạt động")!,rules=book.getWorksheet("Quy tắc điểm")!;
 const headers=summary.getRow(3).values as string[];
 assert.equal(summary.getCell(4,headers.indexOf("Điểm riêng")).value,7.5);assert.equal(summary.getCell(4,headers.indexOf("Điểm theo ban")).value,13.25);assert.equal(summary.getCell("I4").value,20.75);
 assert.ok(!headers.some(h=>h?.includes("Hoạt động C2")||h?.includes("Hoạt động dự án")));
 const rows:number[]=[];detail.eachRow((r,i)=>{if(i>3)rows.push(Number(r.getCell(8).value));});assert.deepEqual(rows,[7.5,13.25]);assert.equal(detail.getCell("E5").value,"Chuyên môn");
 assert.equal(detail.getCell("F5").text,"");assert.equal(detail.getCell("G5").text,"");
 const ruleLabels:string[]=[];rules.eachRow((r,i)=>{if(i>3)ruleLabels.push(String(r.getCell(1).value));});
 assert.ok(ruleLabels.includes("Điểm theo ban"));assert.ok(!ruleLabels.includes("Hoạt động C2"));assert.ok(!ruleLabels.includes("Hoạt động dự án"));
});
