import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../lib/actions";
import { committeeKinds, committeeLabels, memberCommittees, matchesCommittee } from "../lib/committees";
import { workspaceView } from "../lib/workspace-view";
import {
  addDays,
  createClub,
  scoreFor,
  syncWeeks,
  today,
  weekId,
  type Club,
} from "../lib/club";

const admin = { userId: "member-qa-owner", email: "", displayName: "BĐH" };
const student = {
  userId: "member-qa-student",
  email: "",
  displayName: "Thành viên",
};
function fixture() {
  const club = createClub(admin.userId);
  applyAction(club, admin, "profile", { name: "BĐH QA", studentId: "BCS_QA" });
  applyAction(club, student, "profile", {
    name: "Thành viên QA",
    studentId: "SV_QA",
  });
  club.rules = [{ month: "2000-01", A: 10, B: 15, C: 5, D: 5 }];
  const week = club.weeks.find((w) => w.id === weekId())!;
  week.meetingDate = today();
  const memberId = club.members.find((m) => m.userId === student.userId)!.id;
  const entry = week.entries.find((e) => e.memberId === memberId)!;
  return { club, week, memberId, entry };
}
function askToReturn(club: Club) {
  applyAction(club, student, "register", {
    status: "absent",
    reason: "Có lịch học bù",
  });
  applyAction(club, student, "register", {
    status: "pending",
    reason: "Đã đổi lịch học, xin tham gia lại",
  });
}

test("BĐH can assign, move, filter and clear committees on existing and new profiles", () => {
  const { club, memberId } = fixture();
  const member = club.members.find(m => m.id === memberId)!;
  assert.deepEqual(committeeKinds.map(kind => committeeLabels[kind]), ["Truyền thông", "Sự kiện", "Chuyên môn", "Điều hành"]);
  assert.ok(matchesCommittee(member, "unassigned"));
  const memberData = { name: "Hồ sơ mới", studentId: "SV_NEW" };
  assert.throws(() => applyAction(club, admin, "member", { ...memberData, committee: "hc" }), /Ban/);
  assert.equal(club.members.length, 2);
  applyAction(club, admin, "member", { ...memberData, committee: "tt" });
  for (const committee of committeeKinds) {
    applyAction(club, admin, "member", { memberId, committee });
    const stored = JSON.parse(JSON.stringify(club)) as Club;
    const profiles = workspaceView(stored, admin, 1).club.members;
    assert.equal(profiles.find(m => m.id === memberId)?.committee, committee);
    assert.equal(profiles.filter(m => matchesCommittee(m, committee)).length, committee === "tt" ? 2 : 1);
    assert.equal(profiles.filter(m => matchesCommittee(m, "all")).length, 3);
  }
  applyAction(club, admin, "member", { memberId, email: "member@example.test" });
  assert.throws(() => applyAction(club, admin, "member", { memberId, committee: "__proto__" }), /Ban/);
  assert.throws(() => applyAction(club, student, "member", { memberId, committee: "cm" }), /BĐH/);
  applyAction(club, student, "profile", { name: member.name, studentId: member.studentId, committee: "cm" });
  assert.equal(member.committee, "cs");
  assert.equal(member.role, "member");
  assert.equal(workspaceView(club, student, 2).isAdmin, false);
  applyAction(club, admin, "member", { memberId, committee: "" });
  assert.ok(matchesCommittee(member, "unassigned"));
  assert.ok(!matchesCommittee(member, "cs"));
});

test("Multiple committees round-trip with old profiles and never multiply weekly or monthly points", () => {
  const { club, memberId, week } = fixture();
  const member = club.members.find(m => m.id === memberId)!;
  member.committee = "cm";
  applyAction(club, admin, "saveManualActivity", { memberId, week: week.id, date: today(), kind: "committee", committee: "cm", points: 2.75 });
  const month = today().slice(0, 7);
  const before = scoreFor(club, memberId, month);
  const scores = workspaceView(club, admin, 1).weeklyScores.filter(s => s.memberId === memberId && s.week === week.id);
  assert.equal(scores.length, 1);
  assert.equal(scores[0].activityCounts.committee, 2.75);
  const set = (committees: unknown) => applyAction(club, admin, "member", { memberId, committees });

  set(["cs", "tt", "cm", "tt"]);
  applyAction(club, admin, "member", { memberId, email: "member@example.test" });
  assert.throws(() => applyAction(club, admin, "member", { memberId, committee: "" }), /nhiều ban/);
  for (const invalid of [null, "cm", ["tt", "hc"], [2], {}, ["__proto__"]]) {
    assert.throws(() => set(invalid), /Ban/);
  }
  assert.throws(() => applyAction(club, student, "member", { memberId, committees: ["sk"] }), /BĐH/);
  applyAction(club, student, "profile", { name: member.name, studentId: member.studentId, committees: [] });
  const view = workspaceView(JSON.parse(JSON.stringify(club)), admin, 2);
  const saved = view.club.members.find(m => m.id === memberId)!;
  assert.deepEqual(memberCommittees(saved), ["tt", "cm", "cs"]);
  for (const kind of committeeKinds) assert.equal(matchesCommittee(saved, kind), kind !== "sk");
  assert.ok(!matchesCommittee(saved, "unassigned"));
  assert.equal(view.club.members.filter(m => m.id === memberId && matchesCommittee(m, "all")).length, 1);
  assert.deepEqual(view.weeklyScores.filter(s => s.memberId === memberId && s.week === week.id), scores);
  assert.deepEqual(scoreFor(club, memberId, month), before);

  set(["sk"]);
  assert.deepEqual(memberCommittees(member), ["sk"]);
  set([]);
  assert.ok(matchesCommittee(member, "unassigned"));
  assert.deepEqual(scoreFor(club, memberId, month), before);
  applyAction(club, admin, "member", { name: "Thành viên mới", studentId: "SV_MULTI", committees: committeeKinds });
  assert.deepEqual(memberCommittees(club.members.find(m => m.studentId === "SV_MULTI")!), committeeKinds);
});

test("Rút yêu cầu trở về vắng có phép với ô Vắng và điểm thống nhất", () => {
  const { club, week, memberId, entry } = fixture();
  askToReturn(club);
  assert.equal(entry.status, "pending");
  assert.equal(entry.absent, undefined);
  applyAction(club, student, "register", { status: "withdraw" });
  assert.equal(entry.status, "absent");
  assert.equal(entry.absent, true);
  assert.equal(entry.excused, true);
  assert.equal(entry.decision, "Thành viên rút yêu cầu");
  applyAction(club, admin, "close", { week: week.id });
  assert.equal(scoreFor(club, memberId, week.meetingDate.slice(0, 7)).points, 0);
});

test("BĐH xác minh vắng người chưa đăng ký: thành viên không tự xóa khoản trừ", () => {
  const { club, week, memberId, entry } = fixture();
  applyAction(club, admin, "entry", {
    week: week.id,
    memberId,
    absent: true,
    excused: false,
  });
  assert.equal(entry.status, "absent");
  assert.equal(entry.attendanceVerified, true);
  const verified = structuredClone(entry);
  for (const status of ["attending", "absent", "pending", "withdraw"])
    assert.throws(
      () => applyAction(club, student, "register", { status, reason: "Tự sửa" }),
      /BĐH ghi nhận/,
    );
  assert.deepEqual(entry, verified);
  applyAction(club, admin, "close", { week: week.id });
  assert.equal(scoreFor(club, memberId, week.meetingDate.slice(0, 7)).points, -5);
});

test("Người đã đăng ký không thể tự xin phép sau khi BĐH xác minh vắng", () => {
  const { club, week, memberId, entry } = fixture();
  applyAction(club, student, "register", { status: "attending" });
  applyAction(club, admin, "entry", {
    week: week.id,
    memberId,
    absent: true,
    excused: false,
  });
  assert.throws(
    () =>
      applyAction(club, student, "register", {
        status: "absent",
        reason: "Lý do gửi sau khi đã điểm danh",
      }),
    /BĐH ghi nhận/,
  );
  assert.equal(entry.excused, false);
  // BĐH vẫn sửa được kết quả đã xác minh.
  applyAction(club, admin, "entry", {
    week: week.id,
    memberId,
    absent: false,
    passed: true,
  });
  assert.equal(entry.status, "attending");
  assert.equal(entry.absent, false);
  assert.equal(entry.passed, true);
});

test("BĐH chấm quy chế khóa kết quả có mặt khỏi thay đổi đăng ký của thành viên", () => {
  const { club, week, memberId, entry } = fixture();
  applyAction(club, student, "register", { status: "attending" });
  applyAction(club, admin, "entry", { week: week.id, memberId, passed: true });
  assert.throws(
    () =>
      applyAction(club, student, "register", {
        status: "absent",
        reason: "Đổi sang vắng sau khi đã chấm",
      }),
    /BĐH ghi nhận/,
  );
  assert.equal(entry.passed, true);
});

test("Đơn vắng mới sau khi được duyệt không hiển thị lời nhắn và quyết định cũ", () => {
  const { club, week, memberId, entry } = fixture();
  askToReturn(club);
  applyAction(club, admin, "review", { week: week.id, memberId, approved: true });
  assert.equal(entry.decision, "BĐH chấp thuận");
  applyAction(club, student, "register", {
    status: "absent",
    reason: "Có việc đột xuất mới",
  });
  assert.equal(entry.status, "absent");
  assert.equal(entry.reason, "Có việc đột xuất mới");
  assert.equal(entry.request, undefined);
  assert.equal(entry.decision, undefined);
  assert.equal(entry.excused, true);
});

test("Từ chối yêu cầu giữ vắng có phép; thành viên có thể gửi yêu cầu mới", () => {
  const { club, week, memberId, entry } = fixture();
  askToReturn(club);
  assert.throws(
    () => applyAction(club, admin, "review", { week: week.id, memberId, approved: false }),
    /lý do từ chối/,
  );
  applyAction(club, admin, "review", {
    week: week.id,
    memberId,
    approved: false,
    reason: "Đã chốt danh sách chuẩn bị",
  });
  assert.equal(entry.status, "absent");
  assert.equal(entry.absent, true);
  assert.equal(entry.excused, true);
  applyAction(club, student, "register", {
    status: "pending",
    reason: "BĐH có thể xem xét lại không?",
  });
  assert.equal(entry.status, "pending");
  assert.equal(entry.decision, "");
});

test("Tuần tự chốt thiếu ngày được bổ sung có lý do, tính đúng tháng, không mở lại", () => {
  const { club, week, memberId, entry } = fixture();
  // This member belonged to the club before the retroactively dated meeting.
  club.members.find((m) => m.id === memberId)!.joined = week.id;
  week.meetingDate = "";
  syncWeeks(club, addDays(week.id, 7));
  assert.equal(week.closed, true);
  assert.equal(entry.absent, true);
  const month = week.id.slice(0, 7);
  assert.equal(scoreFor(club, memberId, month).meetingMissed, 0);
  assert.throws(
    () => applyAction(club, admin, "meeting", { week: week.id, meetingDate: week.id }),
    /lý do/,
  );
  assert.throws(
    () =>
      applyAction(club, admin, "meeting", {
        week: week.id,
        meetingDate: addDays(week.id, 7),
        note: "Bổ sung ngày còn thiếu",
      }),
    /nằm trong tuần/,
  );
  applyAction(club, admin, "meeting", {
    week: week.id,
    meetingDate: week.id,
    note: "Bổ sung ngày còn thiếu sau khi đối chiếu BĐH",
    cancelled: true,
    time: "12:00",
    location: "Không được thay đổi khi bổ sung ngày",
  });
  assert.equal(week.closed, true);
  assert.equal(week.cancelled, false);
  assert.equal(week.time, "18:30");
  assert.equal(week.location, "Phòng sinh hoạt Đội");
  assert.equal(scoreFor(club, memberId, month).meetingMissed, 1);
  assert.equal(scoreFor(club, memberId, month).points, -5);
  assert.match(club.logs[0].text, /Bổ sung ngày còn thiếu sau khi đối chiếu BĐH/);
  assert.throws(
    () =>
      applyAction(club, admin, "meeting", {
        week: week.id,
        meetingDate: addDays(week.id, 1),
        note: "Không được đổi lần nữa",
      }),
    /chỉ được bổ sung/,
  );
});
