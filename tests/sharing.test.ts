import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, type Identity } from "../lib/actions";
import { createClub, newEntry, scoreFor, weekId, weeklyScoreFor, type Club, type Member } from "../lib/club";
import { makeReport } from "../lib/excel";
import { markMemberNotificationRead, memberNotificationsFor } from "../lib/feedback-notifications";
import { eraseMemberData } from "../lib/member-deletion";
import { semesterScores } from "../lib/semester-scores";
import { applySharingAction, endSharingForMember, sharingViewFor } from "../lib/sharing";
import { sharingScoreBook } from "../lib/sharing-scores";
import { activeSharingPeriod, sharingConsentVersion, type SharingGroup } from "../lib/sharing-types";
import { monthlyScoreboard, workspaceView } from "../lib/workspace-view";

const time = (date: string, clock = "12:00") => Date.parse(`${date}T${clock}:00+07:00`);
const consent = { consentVersion: sharingConsentVersion, acceptedGuide: true };
const identity = (member: Member): Identity => ({ userId: member.userId!, displayName: member.name, email: "" });
function fixture() {
  const [admin, a, b, c, observer] = ["owner", "a", "b", "c", "observer"].map((id, index): Member => ({
    id, name: id.toUpperCase(), studentId: "SPSU-" + id, role: index ? "member" : "admin", userId: "account-" + id,
    active: true, joined: "2026-01-01", availability: [], extraDuties: false,
  }));
  const club = createClub(admin.userId!);
  club.members = [admin, a, b, c, observer];
  club.rules = [{ month: "2026-10", A: 1, B: 1, C: 0.5, D: 0.25, E: 0.5 },
    { month: "2026-11", A: 2, B: 1, C: 0.75, D: 0.5, E: 0.25 }];
  const doAs = (member: Member, action: string, data: Record<string, unknown>, at = time("2026-10-29")) =>
    applySharingAction(club, member, action, data, at);
  const create = () => {
    doAs(a, "createGuild", { name: "Đội C1", code: "#c1", ...consent });
    return club.sharing!.groups[0];
  };
  const invite = (group: SharingGroup, member: Member) => {
    doAs(a, "inviteGuild", { groupId: group.id, memberId: member.id });
    return club.sharing!.invites.find(item => item.groupId === group.id && item.toId === member.id)!;
  };
  const join = (group: SharingGroup, member: Member, at = time("2026-10-29", "13:00")) => {
    const invitation = invite(group, member);
    doAs(member, "answerSharingInvite", { id: invitation.id, accept: true, groupPeriodId: activeSharingPeriod(group)!.id, ...consent }, at);
  };
  return { club, admin, a, b, c, observer, doAs, create, invite, join };
}

function award(club: Club, member: Member, id: string, date: string, points: number, hour?: string, individual?: true) {
  (club.manualActivities ??= []).push({
    id, week: weekId(date), date, time: hour, kind: "special", memberId: member.id, quantity: 1,
    points, note: "", individual, updatedBy: club.members[0].id, updatedAt: new Date(time(date)).toISOString(),
  });
}
function deduct(club: Club, member: Member, id: string, date: string, points: number, hour: string) {
  (club.pointDeductions ??= []).push({
    id, week: weekId(date), date, time: hour, memberId: member.id, points, reason: "Lý do riêng",
    createdBy: club.members[0].id, createdAt: new Date(time(date)).toISOString(),
  });
}

test("Guide confirmation, current roster and a single role are verified before membership is written", () => {
  const { club, admin, a, b, c, doAs, create, invite } = fixture();
  assert.throws(() => doAs(a, "createGuild", { name: "Đội C1", code: "C1" }), /Đọc hướng dẫn/);
  assert.throws(() => doAs(a, "inviteCupid", { memberId: b.id }), /Đọc hướng dẫn/);
  assert.throws(() => doAs(admin, "createGuild", { name: "Quản trị", code: "AD", ...consent }), /tài khoản thành viên/);
  const guild = create();
  const pendingB = invite(guild, b);
  const pendingC = invite(guild, c);
  const solo = activeSharingPeriod(guild)!;
  doAs(c, "inviteCupid", { memberId: b.id, cupidTag: "CùngNhịp", ...consent });
  const relationship = club.sharing!.invites.find(invite => invite.kind === "cupid")!;
  assert.deepEqual(solo.memberIds, [a.id]);
  assert.throws(() => doAs(b, "answerSharingInvite", { id: pendingB.id, accept: true, groupPeriodId: solo.id }), /Đọc hướng dẫn/);
  assert.throws(() => doAs(c, "answerSharingInvite", { id: pendingB.id, accept: true, groupPeriodId: solo.id, ...consent }), /hết hiệu lực/);
  doAs(b, "answerSharingInvite", { id: pendingB.id, accept: true, groupPeriodId: solo.id, ...consent });
  assert.throws(() => doAs(b, "answerSharingInvite", { id: relationship.id, accept: true, ...consent }), /hết hiệu lực/);
  assert.throws(() => doAs(c, "answerSharingInvite", { id: pendingC.id, accept: true, groupPeriodId: solo.id, ...consent }), /Danh sách bang/);
  doAs(c, "answerSharingInvite", { id: pendingC.id, accept: true, groupPeriodId: activeSharingPeriod(guild)!.id, ...consent });
  assert.deepEqual(activeSharingPeriod(guild)?.memberIds, [a.id, b.id, c.id]);
  assert.equal(guild.code, "C1");
  assert.throws(() => doAs(b, "editGuild", { groupId: guild.id, name: "Khác", code: "X" }), /thủ lĩnh/);
  assert.throws(() => doAs(a, "inviteCupid", { memberId: b.id, ...consent }), /một Cupid hoặc Bang hội/);
  assert.throws(() => doAs(a, "editGuild", { groupId: guild.id, name: "Đội SPSU", code: "#spsu" }), /đã được chốt/);
  doAs(a, "editGuild", { groupId: guild.id, name: "Đội SPSU" });
  const [publicGuild] = sharingViewFor(club, b, sharingScoreBook(club)).groups;
  assert.equal(publicGuild.name, "Đội SPSU");
  assert.equal(publicGuild.hashtag, "C1");
});

test("Three-member signed shares reconcile across months, ranks and Excel and stay locked through later changes", async () => {
  const { club, a, b, c, observer, doAs, create, join } = fixture();
  const guild = create();
  join(guild, b);
  join(guild, c, time("2026-10-29", "14:00"));
  award(club, a, "manual-start-day", "2026-10-29", 2); // no clock at a roster boundary
  award(club, a, "manual-in-period", "2026-10-31", 4, "08:00");
  deduct(club, b, "deduct-in-period", "2026-10-31", 1, "09:00");
  const week = weekId("2026-10-31");
  club.weeks.push({ id: week, meetingDate: "2026-11-01", time: "18:30", location: "C1",
    cancelled: false, closed: true, entries: [{ ...newEntry(c.id), status: "attending", passed: true }] });
  const live = sharingScoreBook(club, time("2026-11-02", "08:00")).index;
  assert.deepEqual([a, b, c].map(member => scoreFor(club, member.id, "2026-10", undefined, live).points), [3, 1, 1]);
  assert.deepEqual([a, b, c].map(member => weeklyScoreFor(club, member.id, week, live).points), [3.0833333333, 1.0833333333, 1.0833333333]);
  doAs(a, "removeGuildMember", { groupId: guild.id, memberId: c.id, confirm: c.id }, time("2026-11-02", "09:00"));
  assert.equal(club.sharing!.locked.length, 3);
  club.manualActivities![1].points = 9;
  club.pointDeductions![0].cancelledAt = new Date(time("2026-11-04")).toISOString();
  club.weeks[0].entries[0].passed = false;
  award(club, b, "late-approval", "2026-11-01", 2, "16:00");
  deduct(club, a, "two-person-amount", "2026-11-02", 2, "15:00");
  award(club, c, "solo-after-kick", "2026-11-02", 1, "16:00");
  const asOf = "2026-11-04";
  const book = sharingScoreBook(club, time(asOf));
  assert.deepEqual([a, b, c].map(member => scoreFor(club, member.id, "2026-10", undefined, book.index).points), [3, 1, 1]);
  const monthly = monthlyScoreboard(club, "2026-11", asOf, book.index);
  assert.deepEqual([a, b, c].map(member => monthly.find(row => row.memberId === member.id)?.points), [-0.9166666667, 1.0833333333, 1.0833333333]);
  const semester = semesterScores(club, "2026-10", "2026-11", asOf, book.index);
  assert.equal(semester.rows.find(row => row.memberId === a.id)?.points, 2.0833333333);
  assert.equal(semester.rows.find(row => row.memberId === b.id)?.points, 2.0833333333);

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const { buffer } = await makeReport(club, "2026-11", asOf, book.index);
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Tổng hợp tháng")!;
  const titles = Array.from({ length: sheet.columnCount }, (_, index) => sheet.getCell(3, index + 1).text);
  const totalColumn = titles.indexOf("Tổng điểm") + 1;
  const adjustmentColumn = titles.indexOf("Điều chỉnh Bang hội") + 1;
  assert.ok(adjustmentColumn > 0);
  for (let row = 4; row <= sheet.rowCount; row++) {
    const score = monthly.find(item => item.name === sheet.getCell(row, 3).text)!;
    assert.equal(sheet.getCell(row, totalColumn).value, score.points);
    assert.equal(sheet.getCell(row, adjustmentColumn).value, Number((score.sharingAdjustment?.guild ?? 0).toFixed(10)));
  }
  assert.ok(sharingViewFor(club, c, book).mine?.history.some(period => period.contributions.length === 3));
  assert.equal(sharingViewFor(club, observer, book).mine?.history.length, 0);
  assert.equal("sharing" in workspaceView(club, identity(observer), 1).club, false);
});

test("Cupid shares one fixed hashtag after consent, uses recorded hours, and keeps the two halves after a breakup", () => {
  const { club, a, b, c, observer, doAs } = fixture();
  assert.throws(() => doAs(a, "inviteCupid", { memberId: b.id, cupidTag: "#Trực C1", ...consent }), /Hashtag Cupid/);
  doAs(a, "inviteCupid", { memberId: b.id, cupidTag: " #TrựcC1CóNhau ", ...consent });
  const invitation = club.sharing!.invites[0];
  const before = sharingScoreBook(club);
  const outsider = sharingViewFor(club, observer, before);
  assert.deepEqual(outsider.groups, []);
  assert.deepEqual(outsider.mine?.invited, []);
  assert.equal(sharingViewFor(club, b, before).mine?.invited[0].cupidTag, "TrựcC1CóNhau");
  assert.equal(memberNotificationsFor(club, observer.id).length, 0);
  const incoming = memberNotificationsFor(club, b.id)[0];
  assert.equal(incoming.kind, "cupidInvite");
  assert.equal(markMemberNotificationRead(club, c.id, incoming.id), false);
  assert.equal(markMemberNotificationRead(club, b.id, incoming.id), true);
  doAs(b, "answerSharingInvite", { id: invitation.id, accept: true, ...consent }, time("2026-10-29", "14:05"));
  const group = club.sharing!.groups[0];
  const [publicCup] = sharingViewFor(club, observer, sharingScoreBook(club)).groups;
  assert.equal(publicCup.hashtag, "TrựcC1CóNhau");
  assert.deepEqual(publicCup.memberIds, [a.id, b.id]);
  assert.throws(() => doAs(a, "proposeCupidTag", { groupId: group.id, text: "#tag2" }), /đã được chốt/);

  club.schedules.push({ month: "2026-10", published: true, shifts: [{
    id: "shift-before", date: "2026-10-29", period: "am", startTime: "08:00",
    assignments: [{ memberId: a.id, result: "completed" }],
  }, {
    id: "shift-after", date: "2026-10-29", period: "pm", startTime: "14:30",
    assignments: [{ memberId: a.id, result: "completed", late: true }],
  }] });
  const event = { id: "event", name: "Sự kiện", points: 0.25, startDate: "2026-10-29", endDate: "2026-10-29",
    endTime: "18:00", createdBy: "owner", createdAt: "2026-10-29T02:00:00Z" };
  club.events = [event];
  club.activityRegistrations = [a, b].map(member => ({
    id: "event-" + member.id, kind: "event", eventId: "event", memberId: member.id, week: weekId(event.endDate), date: event.endDate,
    quantity: 1, note: "", status: "confirmed", submittedAt: event.createdAt,
  }));
  award(club, a, "whole-day", "2026-10-30", 0.25);
  award(club, a, "before-day", "2026-10-29", 1);
  const pendingDay = sharingScoreBook(club, time("2026-10-30", "20:00"));
  assert.equal(scoreFor(club, b.id, "2026-10", undefined, pendingDay.index).points, 0.625);
  const later = sharingScoreBook(club, time("2026-11-06"));
  assert.equal(scoreFor(club, b.id, "2026-10", undefined, later.index).points, 0.75);
  const card = sharingViewFor(club, observer, later, time("2026-11-06")).groups[0];
  assert.ok(card.jointEvent && card.sevenDays);
  doAs(b, "leaveSharingGroup", { groupId: group.id, confirm: group.id }, time("2026-11-06"));
  club.events[0].cancelledAt = "2026-11-07T00:00:00Z";
  assert.equal(scoreFor(club, b.id, "2026-10").points, 0.75);
  assert.equal(scoreFor(club, a.id, "2026-10").points, 2.75);
  assert.equal(sharingViewFor(club, observer, sharingScoreBook(club)).groups.length, 0);
  assert.equal(sharingViewFor(club, observer, sharingScoreBook(club)).mine?.history.length, 0);
  assert.equal(sharingViewFor(club, b, sharingScoreBook(club)).mine?.history.length, 1);
});

test("Existing Cupid pairs with multiple hashtags keep the first approved one for both people", () => {
  const { club, a, b, observer, doAs } = fixture();
  club.sharing = { invites: [], locked: [], notices: [], groups: [{
    id: "legacy-cupid", kind: "cupid", name: "Cupid",
    periods: [{ id: "legacy-period", memberIds: [a.id, b.id], startedAt: time("2026-10-29") }],
    tags: [
      { id: "pending", authorId: a.id, memberId: b.id, text: "ChưaDuyệt", approved: false },
      { id: "first", authorId: b.id, memberId: a.id, text: "CùngNhịp", approved: true },
      { id: "second", authorId: a.id, memberId: b.id, text: "TrựcC1", approved: true },
    ],
  }] };
  const book = sharingScoreBook(club);
  const [group] = sharingViewFor(club, observer, book).groups;
  assert.equal(group.hashtag, "CùngNhịp");
  assert.deepEqual(group.hashtags, [a.id, b.id].map(memberId => ({ memberId, text: "CùngNhịp" })));
  assert.deepEqual(sharingViewFor(club, b, book).mine?.tags, []);
  assert.throws(() => doAs(b, "removeCupidTag", { groupId: group.id, tagId: "first" }), /đã được chốt/);
});

test("An older Cupid invitation can establish a single hashtag with the recipient's approval", () => {
  const { club, a, b, observer, doAs } = fixture();
  doAs(a, "inviteCupid", { memberId: b.id, cupidTag: "CùngNhịp", ...consent });
  const invite = club.sharing!.invites[0];
  delete invite.cupidTag;
  doAs(b, "answerSharingInvite", { id: invite.id, accept: true, ...consent });
  const group = club.sharing!.groups[0];
  doAs(a, "proposeCupidTag", { groupId: group.id, text: "CùngNhịp" });
  const pending = group.tags![0];
  const book = sharingScoreBook(club);
  assert.equal(sharingViewFor(club, observer, book).groups[0].hashtag, undefined);
  assert.deepEqual(sharingViewFor(club, observer, book).mine?.tags, []);
  assert.deepEqual(sharingViewFor(club, b, book).mine?.tags, [pending]);
  assert.throws(() => doAs(b, "proposeCupidTag", { groupId: group.id, text: "TagKhác" }), /đang chờ duyệt/);
  assert.throws(() => doAs(a, "approveCupidTag", { groupId: group.id, tagId: pending.id }), /người nhận đề xuất/);
  doAs(b, "removeCupidTag", { groupId: group.id, tagId: pending.id });
  doAs(b, "proposeCupidTag", { groupId: group.id, text: "TrựcC1" });
  doAs(a, "approveCupidTag", { groupId: group.id, tagId: group.tags![0].id });
  assert.equal(sharingViewFor(club, observer, book).groups[0].hashtag, "TrựcC1");
  assert.equal(group.tags, undefined);
});

test("Leader permissions, automatic succession and member deletion keep historical payouts private and usable", () => {
  const { club, admin, a, b, c, observer, doAs, create, join } = fixture();
  const guild = create();
  join(guild, b);
  join(guild, c);
  award(club, a, "before-role-change", "2026-10-31", 3, "11:00");
  assert.throws(() => doAs(a, "leaveSharingGroup", { groupId: guild.id, confirm: guild.id }), /Chuyển quyền/);
  assert.throws(() => doAs(b, "removeGuildMember", { groupId: guild.id, memberId: c.id, confirm: c.id }), /thủ lĩnh/);
  doAs(a, "transferGuildLeader", { groupId: guild.id, memberId: c.id }, time("2026-11-01"));
  assert.equal(guild.leaderId, c.id);
  endSharingForMember(club, c.id, time("2026-11-01", "13:00"));
  c.active = false;
  assert.equal(guild.leaderId, a.id);
  assert.equal(scoreFor(club, b.id, "2026-10").points, 1);
  eraseMemberData(club, admin, a);
  assert.equal(guild.leaderId, b.id);
  assert.deepEqual(activeSharingPeriod(guild)?.memberIds, [b.id]);
  assert.equal(scoreFor(club, b.id, "2026-10").points, 1);
  assert.equal(memberNotificationsFor(club, observer.id).length, 0);
  assert.ok(!club.sharing!.locked.some(row => row.sourceMemberId === a.id || row.memberIds.includes(a.id)));
  applyAction(club, identity(admin), "member", { memberId: b.id, active: false });
  assert.equal(activeSharingPeriod(guild), undefined);
});
