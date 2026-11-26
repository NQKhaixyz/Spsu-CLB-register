import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../lib/actions";
import { personKey } from "../lib/availability";
import { createClub, isShiftPublished, newEntry, reportMembers, scoreFor, type Member, type Shift } from "../lib/club";
import { canDeleteMember, eraseMemberData, scrubWeekArchive } from "../lib/member-deletion";
import { workspaceView } from "../lib/workspace-view";

const owner = { userId: "owner", displayName: "Điều hành", email: "" };
const viewer = { userId: "viewer", displayName: "Người thử nghiệm", email: "" };
const applier = { userId: "someone-else", displayName: "Thành viên khác", email: "" };

function fixture() {
  const club = createClub(owner.userId);
  club.rules[0].A = 0.75;
  club.members = [owner, viewer, applier].map((user, index): Member => ({
    id: "profile-" + index, userId: user.userId, name: user.displayName, studentId: "QA000" + index,
    role: index ? "member" : "admin", active: true, joined: "2026-12-08", availability: [], extraDuties: false,
  }));
  const shift = (date: string): Shift => ({
    id: date + "-am", date, period: "am", capacity: 1, assignments: [{ memberId: club.members[0].id, result: "unverified" }],
  });
  club.schedules = [
    { month: "2026-11", published: false, shifts: [shift("2026-11-27"), shift("2026-11-30")] },
    { month: "2026-12", published: false, shifts: [shift("2026-12-01"), shift("2026-12-07")] },
  ];
  club.weeks = [{ id: "2026-11-30", meetingDate: "", time: "", location: "", cancelled: false, closed: false, entries: [] }];
  return club;
}

test("Publishing or withdrawing a selected duty week includes both months and preserves other weeks and points", () => {
  const club = fixture();
  const scope = { week: "2026-11-30" };
  const [admin, member] = club.members;
  const [nov, dec] = club.schedules;
  assert.throws(() => applyAction(club, owner, "publish", { month: nov.month }), /tuần cần công bố/);
  assert.throws(() => applyAction(club, viewer, "publish", scope), /BĐH/);
  applyAction(club, owner, "publish", scope);
  assert.deepEqual(nov.shifts.map(shift => isShiftPublished(nov, shift)), [false, true]);
  assert.deepEqual(dec.shifts.map(shift => isShiftPublished(dec, shift)), [true, false]);
  applyAction(club, owner, "publish", { week: "2026-12-07" });
  const shift = dec.shifts[0];
  applyAction(club, owner, "addDutyMember", { month: dec.month, shiftId: shift.id, memberId: member.id });
  assert.throws(() => applyAction(club, owner, "addDutyMember", { month: dec.month, shiftId: shift.id, memberId: member.id }), /đã có/);
  const update = { month: dec.month, shiftId: shift.id, position: 1, assignmentMemberId: member.id, result: "completed" };
  assert.throws(() => applyAction(club, owner, "shift", { ...update, assignmentMemberId: admin.id }), /vừa thay đổi/);
  applyAction(club, owner, "shift", update);
  const points = scoreFor(club, member.id, dec.month).points;
  assert.ok(points > 0);
  applyAction(club, owner, "withdrawDutyWeek", scope);
  assert.deepEqual(nov.shifts.map(shift => isShiftPublished(nov, shift)), [false, false]);
  assert.deepEqual(dec.shifts.map(shift => isShiftPublished(dec, shift)), [false, true]);
  const view = workspaceView(club, viewer, 1);
  assert.deepEqual(view.club.schedules.flatMap(schedule => schedule.shifts.map(shift => shift.date)), ["2026-12-07"]);
  assert.equal(view.weeklyScores.find(score => score.memberId === member.id && score.week === scope.week)?.points, points);
  assert.equal(view.personalMonthlyScores?.[dec.month].points, points);
  assert.ok(reportMembers(club, nov.month).every(item => item.id !== member.id));
  applyAction(club, owner, "publish", scope);
  assert.equal(scoreFor(club, member.id, dec.month).completed, 1);
  assert.equal(scoreFor(club, member.id, dec.month).points, points);
});

test("Replanning a full ca keeps a manual assignment even without compatible availability", () => {
  const club = fixture();
  const [admin, member, other] = club.members;
  admin.joined = member.joined = other.joined = "2026-11-01";
  admin.availability = other.availability = ["1-am"];
  const [schedule] = club.schedules;
  const shift = schedule.shifts[1];
  applyAction(club, owner, "addDutyMember", { month: schedule.month, shiftId: shift.id, memberId: member.id });
  assert.equal(shift.assignments.length, 2);
  applyAction(club, owner, "schedule", { week: "2026-11-30", peoplePerShift: 2 });
  assert.equal(shift.assignments.filter(a => a.memberId === member.id && a.manual).length, 1);
  assert.equal(shift.assignments.length, 2);
});

test("The order changed by BĐH is used for members, and a stale neighbor cannot move the wrong link", () => {
  const club = fixture();
  for (const title of ["Một", "Hai", "Ba"]) {
    applyAction(club, owner, "saveSharedLink", { title, url: "https://example.org" });
  }
  const [top, next] = club.links!;
  const move = { id: top.id, offset: 1, neighborId: next.id };
  assert.throws(() => applyAction(club, viewer, "moveSharedLink", move), /BĐH/);
  applyAction(club, owner, "moveSharedLink", move);
  assert.deepEqual(workspaceView(club, viewer, 1).club.links?.map(link => link.title), ["Hai", "Ba", "Một"]);
  assert.throws(() => applyAction(club, owner, "moveSharedLink", move), /vừa thay đổi/);
});

test("Member deletion scrubs current and archived participation, preserves other members, and removes photo references", () => {
  const club = fixture();
  const [admin, removed, other] = club.members;
  assert.equal(canDeleteMember(club, removed, other), false);
  assert.equal(canDeleteMember(club, admin, admin), false);
  assert.equal(canDeleteMember(club, admin, removed), true);
  const week = club.weeks[0];
  week.entries = [newEntry(removed.id), newEntry(other.id)];
  week.closingSnapshot = { before: structuredClone(week.entries), after: structuredClone(week.entries) };
  const shift = club.schedules[0].shifts[1];
  shift.assignments = [{ memberId: removed.id, result: "completed" }, { memberId: other.id, originalId: removed.id, result: "completed" }];
  shift.cancellationSnapshot = structuredClone(shift.assignments);
  const photo = crypto.randomUUID();
  club.activityRegistrations = [{
    id: "test-registration", memberId: removed.id, kind: "event", eventId: "test-event", date: week.id, week: week.id,
    status: "confirmed", quantity: 1, note: "", submittedAt: "", evidence: { id: photo, submittedAt: 1234 },
  }];
  club.availabilityDataset = {
    filename: "QA.xlsx", importedAt: "", importedBy: admin.name,
    rows: [removed, other].map((member, index) => ({ sourceRow: index, name: member.name, day: "Thứ hai", period: "Sáng", weeks: "", note: "" })),
    memberLinks: { [personKey(removed.name)]: removed.id, [personKey(other.name)]: other.id },
  };
  club.logs = [
    { at: "", actor: admin.name, text: `Cập nhật thành viên ${removed.name}` },
    { at: "", actor: other.name, text: "Ghi nhận ca trực", actorId: other.id },
  ];
  club.demoArchive = {
    archivedAt: "", members: [structuredClone(removed)], weeks: structuredClone([week]), schedules: structuredClone(club.schedules),
  };
  const archive = { active: { weeks: structuredClone([week]) }, shifts: [structuredClone(shift)], registrations: structuredClone(club.activityRegistrations) };
  const photos = eraseMemberData(club, admin, removed);
  scrubWeekArchive(archive, removed.id, photos);
  assert.deepEqual([...photos], [photo]);
  assert.doesNotMatch(JSON.stringify({ club, archive }), /profile-1|Người thử nghiệm/);
  assert.deepEqual(week.entries.map(entry => entry.memberId), [other.id]);
  assert.deepEqual(shift.assignments.map(assignment => assignment.memberId), [other.id]);
  assert.equal(club.availabilityDataset.rows[0].name, other.name);
  assert.ok(club.logs.some(log => log.actorId === other.id));
});
