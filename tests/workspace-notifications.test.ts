import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, type Identity } from "../lib/actions";
import { activityScoreFor } from "../lib/activity";
import { bulletinDateInput } from "../lib/bulletin";
import { bulletinDocumentName, bulletinDocumentType, bulletinMediaByteLimit, validBulletinDocumentPrefix } from "../lib/bulletin-media";
import { addDays, createClub, syncWeeks, today, weekId, type Club, type Member } from "../lib/club";
import { dismissMemberNotification, memberNotificationsFor, markMemberNotificationRead, markMemberNotificationsRead, visibleMemberNotifications } from "../lib/feedback-notifications";
import { removeEventNotices, workspaceNotificationsFor, markWorkspaceNotificationRead } from "../lib/workspace-notifications";
import { workspaceView } from "../lib/workspace-view";
import { settleRoundEventNotices } from "../lib/round-event-notifications";

function fixture() {
  const [admin, minh, other] = ["admin", "minh", "other"].map((id, index): Member => ({
    id, name: id, studentId: "NOTIFY-" + index, userId: "account-" + id, role: index === 0 ? "admin" : "member",
    active: true, joined: "2020-01-01", availability: [], extraDuties: false,
  }));
  const club = createClub(admin.userId!);
  club.members = [admin, minh, other];
  syncWeeks(club);
  const identity = (member: Member): Identity => ({ userId: member.userId!, email: "", displayName: member.name });
  const run = (member: Member, action: string, data: Record<string, unknown>) => applyAction(club, identity(member), action, data);
  return { club, admin, minh, other, run, identity };
}
const eventDecisions = (club: Club, memberId: string) => workspaceNotificationsFor(club, memberId)
  .filter(item => item.kind === "activity").filter(item => item.target.area === "event" && !item.title.startsWith("Sự kiện mới · "));

test("A post announces once when published and only the reader's receipt changes", () => {
  const { club, admin, minh, other, run, identity } = fixture();
  const publishAt = bulletinDateInput(Date.now() + 4 * 60_000);
  const post = { id: "news-notification", title: "Lịch sinh hoạt", content: "Đọc tài liệu trước buổi họp", publishAt };
  run(admin, "saveBulletinPost", post);
  const stored = club.bulletinPosts![0];
  const initial = stored.notice!;
  assert.deepEqual(workspaceNotificationsFor(club, minh.id, initial.appearsAt - 1), []);
  assert.equal(markWorkspaceNotificationRead(club, minh.id, initial.id, initial.appearsAt - 1), false);
  assert.deepEqual(workspaceNotificationsFor(club, admin.id, initial.appearsAt), []);
  const [published] = workspaceNotificationsFor(club, minh.id, initial.appearsAt);
  assert.equal(published.kind, "bulletin");
  assert.equal(published.id, initial.id);
  assert.equal(markWorkspaceNotificationRead(club, minh.id, initial.id, initial.appearsAt), true);
  assert.equal(workspaceNotificationsFor(club, minh.id, initial.appearsAt)[0].read, true);
  assert.equal(workspaceNotificationsFor(club, other.id, initial.appearsAt)[0].read, undefined);
  assert.equal("notice" in workspaceView(club, identity(admin), 1).bulletin!.posts[0], false);

  run(admin, "saveBulletinPost", { ...post, revision: 1, title: "Lịch sinh hoạt mới", publishAt: "" });
  const updated = memberNotificationsFor(club, other.id);
  assert.deepEqual(updated.map(item => item.id), [initial.id]);
  assert.equal(updated[0].kind === "bulletin" && updated[0].postTitle, "Lịch sinh hoạt mới");
  assert.deepEqual(memberNotificationsFor(club, other.id, false), []);
  run(admin, "deleteBulletinPost", { id: post.id, revision: 2 });
  assert.deepEqual(memberNotificationsFor(club, other.id), []);
});

test("Entering, repeating, and correcting points sends only real weekly changes to the recipient", () => {
  const { club, admin, minh, other, run, identity } = fixture();
  const points = { week: weekId(), date: today(), memberId: minh.id, kind: "special", points: 0.25 };
  run(admin, "saveManualActivity", points);
  run(admin, "saveManualActivity", points);
  const received = memberNotificationsFor(club, minh.id);
  assert.equal(received.length, 1);
  assert.equal(received[0].kind === "score" && received[0].change, 0.25);
  assert.deepEqual(received[0].kind === "score" && received[0].changes?.map(({ operation, category, change }) =>
    [operation, category, change]), [["add", "Điểm riêng", 0.25]]);
  assert.equal(received[0].kind === "score" && received[0].week, points.week);
  assert.equal(markMemberNotificationRead(club, other.id, received[0].id), false);
  assert.equal(markMemberNotificationRead(club, minh.id, received[0].id), true);
  assert.equal(memberNotificationsFor(club, minh.id)[0].read, true);
  assert.deepEqual(memberNotificationsFor(club, other.id), []);
  assert.equal("activityNotices" in workspaceView(club, identity(other), 1).club, false);
  const id = "notice-deduction-test";
  run(admin, "deductPoints", { ...points, id, reason: "Lý do riêng", points: 0.5 });
  run(admin, "cancelPointDeduction", { id, reason: "Sửa khoản trừ" });
  run(admin, "saveManualActivity", { ...points, kind: "initiative", quantity: 1 });
  assert.equal(memberNotificationsFor(club, minh.id).filter(item => item.kind === "score").length, 1);
  run(admin, "saveManualActivity", { ...points, points: 0 });
  const revoked = memberNotificationsFor(club, minh.id).find(item => item.kind === "score" && item.change < 0);
  assert.ok(revoked?.kind === "score");
  assert.deepEqual(revoked.changes?.map(({ operation, category, change }) => [operation, category, change]),
    [["revoke", "Điểm riêng", -0.25]]);
  assert.ok(!JSON.stringify(memberNotificationsFor(club, minh.id)).includes("Lý do riêng"));
});

test("Duty scores update without an additional score notice", () => {
  const { club, admin, minh, other, run } = fixture();
  const date = today();
  const month = date.slice(0, 7);
  const shiftId = "notice-duty-zero";
  club.rules.push({ month, A: 0.5, B: 1, C: 0.5, D: 0.5, E: 0.25 });
  club.schedules = [{ month, published: true, shifts: [{
    id: shiftId, date, period: "am", startTime: "09:00", endTime: "11:00",
    assignments: [{ memberId: minh.id, result: "unverified" }],
  }] }];
  run(admin, "shift", { month, shiftId, position: 0, result: "completed", late: true });
  assert.equal(memberNotificationsFor(club, minh.id).some(item => item.kind === "score"), false);
  assert.ok(memberNotificationsFor(club, minh.id).some(item => item.kind === "activity"));
  assert.deepEqual(memberNotificationsFor(club, other.id), []);
  run(admin, "shift", { month, shiftId, position: 0, result: "completed", late: true });
  assert.equal(memberNotificationsFor(club, minh.id).filter(item => item.kind === "activity").length, 1);
});

test("Duty notices start at publication and retain a separate update for cancellation and restoration", () => {
  const { club, admin, minh, other, run } = fixture();
  const week = addDays(weekId(), 7);
  const month = week.slice(0, 7);
  const shiftId = "duty-notices-shift";
  club.schedules = [{ month, published: false, shifts: [{
    id: shiftId, date: week, period: "am", startTime: "09:00", endTime: "11:00", assignments: [],
  }] }];
  run(admin, "addDutyMember", { month, shiftId, memberId: minh.id });
  assert.deepEqual(memberNotificationsFor(club, minh.id), []);
  run(admin, "publish", { week });
  const [published] = memberNotificationsFor(club, minh.id);
  assert.equal(published.kind === "duty" && published.week, week);
  assert.equal(published.kind === "duty" && published.startTime, "09:00");
  assert.deepEqual(memberNotificationsFor(club, other.id), []);
  run(admin, "addDutyMember", { month, shiftId, memberId: other.id });
  assert.equal(memberNotificationsFor(club, other.id).length, 1);
  assert.equal(memberNotificationsFor(club, minh.id).length, 1);
  run(admin, "cancelShift", { month, shiftId });
  const cancelled = memberNotificationsFor(club, minh.id).filter(item => item.kind === "duty");
  assert.deepEqual(cancelled.map(item => item.dutyChange), ["cancelled", "assigned"]);
  assert.equal(cancelled[1].id, published.id);
  run(admin, "restoreShift", { month, shiftId });
  const restored = memberNotificationsFor(club, minh.id).filter(item => item.kind === "duty");
  assert.equal(restored.length, 3);
  assert.notEqual(restored[0].id, published.id);
  assert.equal(restored[0].dutyChange, "assigned");
});

test("Reading a bulletin and confirming it with a reaction persist independently for each account", () => {
  const { club, admin, minh, other, run } = fixture();
  const postId = "separate-confirmation";
  run(admin, "saveBulletinPost", { id: postId, title: "Tin mới", content: "Lịch họp tuần này" });
  const id = memberNotificationsFor(club, minh.id)[0].id;
  assert.equal(markMemberNotificationRead(club, minh.id, id), true);
  const [readOnly] = memberNotificationsFor(club, minh.id);
  assert.equal(readOnly.read, true);
  assert.equal(readOnly.kind === "bulletin" && readOnly.confirmed, undefined);
  run(minh, "setBulletinLike", { postId, liked: true });
  run(minh, "setBulletinLike", { postId, liked: false });
  const [confirmed] = memberNotificationsFor(club, minh.id);
  assert.equal(confirmed.kind === "bulletin" && confirmed.confirmed, true);
  assert.equal(confirmed.id, id);
  const [untouched] = memberNotificationsFor(club, other.id);
  assert.equal(untouched.read, undefined);
  assert.equal(untouched.kind === "bulletin" && untouched.confirmed, undefined);
});

test("Direct notices authorize BĐH, deduplicate retries, and keep recipients and bulk-read state private", () => {
  const { club, admin, minh, other, run, identity } = fixture();
  const privateDraft = { id: crypto.randomUUID(), title: "Trao đổi riêng", body: "Hẹn trao đổi sau giờ họp",
    audience: "members", recipientIds: [minh.id] };
  assert.throws(() => run(minh, "sendDirectNotice", privateDraft), /Chỉ BĐH/);
  run(admin, "sendDirectNotice", privateDraft);
  run(admin, "sendDirectNotice", privateDraft);
  assert.throws(() => run(admin, "sendDirectNotice", { ...privateDraft, body: "Nội dung khác" }), /nội dung khác/);
  assert.equal(memberNotificationsFor(club, minh.id).length, 1);
  assert.equal(markMemberNotificationRead(club, other.id, privateDraft.id), false);
  assert.deepEqual(memberNotificationsFor(club, other.id), []);
  assert.deepEqual(memberNotificationsFor(club, admin.id), []);
  const teamDraft = { ...privateDraft, id: crypto.randomUUID(), audience: "all", title: "Gửi cả Đội" };
  run(admin, "sendDirectNotice", teamDraft);
  assert.equal(markMemberNotificationsRead(club, minh.id, "all", "all"), 2);
  assert.ok(memberNotificationsFor(club, minh.id).every(item => item.read && !("recipients" in item)));
  assert.deepEqual(memberNotificationsFor(club, other.id).map(item => [item.id, item.read]), [[teamDraft.id, undefined]]);
  assert.deepEqual(visibleMemberNotifications(club, minh.id, "workspace"), []);
  assert.equal("directNotices" in workspaceView(club, identity(other), 1).club, false);
  assert.equal(club.bulletinPosts?.length ?? 0, 0);
});

test("An individual score change notifies the account scored even when Cupid affects another total", () => {
  const { club, admin, minh, other, run } = fixture();
  club.sharing = { invites: [], locked: [], notices: [], groups: [{
    id: "notice-pair", kind: "cupid", name: "Cupid",
    periods: [{ id: "notice-period", memberIds: [minh.id, other.id], startedAt: Date.now() - 172_800_000 }],
  }] };
  run(admin, "saveManualActivity", { week: weekId(), date: today(), time: "00:00", memberId: minh.id, kind: "special", points: 4 });
  const [notice] = memberNotificationsFor(club, minh.id);
  assert.equal(notice.kind === "score" && notice.change, 4);
  assert.deepEqual(memberNotificationsFor(club, other.id), []);
});

test("An ordinary event decision creates one status notice for the participant", () => {
  const { club, admin, minh, other, run } = fixture();
  const eventId = "status-event-test";
  run(admin, "createEvent", { id: eventId, name: "Sinh hoạt đầu tuần", points: 1.25, startDate: today(), endDate: today() });
  run(minh, "registerEvent", { eventId });
  const id = club.activityRegistrations![0].id;
  run(admin, "reviewActivity", { id, confirmed: true });
  run(admin, "reviewActivity", { id, confirmed: true });
  const notices = eventDecisions(club, minh.id);
  assert.equal(notices.length, 1);
  const activity = notices[0];
  assert.deepEqual(activity.target, { area: "event", eventId });
  assert.equal(activity.title, "Sự kiện đã duyệt");
  assert.deepEqual(activity.eventScore, { eventName: "Sinh hoạt đầu tuần", points: 1.25, rounds: undefined });
  assert.match(activity.body, /1 lượt được duyệt/);
  assert.deepEqual(eventDecisions(club, other.id), []);
  run(admin, "reviewActivity", { id, confirmed: false, reason: "Cập nhật kết quả duyệt" });
  const revoked = eventDecisions(club, minh.id).find(item => item.id !== activity.id);
  assert.equal(revoked?.title, "Kết quả sự kiện đã cập nhật");
  assert.deepEqual(revoked?.eventScore, { eventName: "Sinh hoạt đầu tuần", points: 0, change: -1.25, rounds: undefined });
  assert.equal(activity.eventScore?.points, 1.25);
});

test("Event approval snapshots the member's awarded contribution points", () => {
  const { club, admin, minh, other, run } = fixture();
  const eventId = "notice-event-contribution";
  const date = today();
  run(admin, "createEvent", { id: eventId, name: "Hỗ trợ tuyển sinh", scoringMode: "contribution", startDate: date, endDate: date });
  run(admin, "addEventParticipant", { eventId, memberId: minh.id, contributionPoints: 2.35 });
  const [notice] = eventDecisions(club, minh.id);
  assert.ok(notice?.kind === "activity");
  assert.equal(notice.title, "Sự kiện đã duyệt");
  assert.equal(notice.eventScore?.points, activityScoreFor(club, minh.id, weekId(date), true).activityPoints.event);
  assert.deepEqual(eventDecisions(club, other.id), []);
  const id = club.activityRegistrations![0].id;
  run(admin, "saveEventContribution", { id, contributionPoints: 3.5 });
  const [original] = eventDecisions(club, minh.id);
  assert.equal(original.kind === "activity" && original.eventScore?.points, 2.35);
});

test("Earlier event approvals display current points only when their decision matches the current registration", () => {
  const { club, admin, minh, other, run } = fixture();
  const eventId = "legacy-event-notice";
  const date = today();
  run(admin, "createEvent", { id: eventId, name: "Tập huấn", scoringMode: "perRound", points: 0.25, startDate: date, endDate: date });
  run(admin, "addEventParticipant", { eventId, memberId: minh.id, quantity: 20, previousQuantity: 0 });
  const stored = club.activityNotices![0];
  assert.ok(stored.kind === "activity");
  stored.title = "Kết quả sự kiện đã cập nhật";
  stored.read = true;
  delete stored.eventScore;
  club.activityNotices!.push({ ...stored, id: crypto.randomUUID(), body: "Tập huấn · 2 lượt được duyệt" });
  const [matching, earlier] = eventDecisions(club, minh.id);
  assert.ok(matching.kind === "activity" && earlier.kind === "activity");
  assert.equal(matching.title, "Sự kiện đã duyệt");
  assert.equal(matching.read, true);
  assert.deepEqual(matching.eventScore, { eventName: "Tập huấn", points: 5, rounds: 20, current: true });
  assert.equal(earlier.title, "Kết quả sự kiện đã cập nhật");
  assert.equal(earlier.eventScore, undefined);
  assert.deepEqual(eventDecisions(club, other.id), []);
});

test("Creating an event announces it once to the entire team with separate read and dismiss states", () => {
  const { club, admin, minh, other, run, identity } = fixture();
  const extra = { ...other, id: "paused", active: false };
  club.members.push(extra);
  const day = today();
  const event = { id: "notice-new-event", name: "Tiếp sức mùa thi", points: 0.25,
    startDate: day, endDate: day, startTime: "08:00", endTime: "10:00", location: "Cơ sở C1" };
  run(admin, "createEvent", event);
  run(admin, "createEvent", event);
  assert.equal(club.eventAnnouncements?.length, 1);
  for (const person of [admin, minh, other]) {
    const [notice] = memberNotificationsFor(club, person.id);
    assert.ok(notice.kind === "activity");
    assert.equal(notice.title, "Sự kiện mới · Tiếp sức mùa thi");
    assert.match(notice.body, /08:00 – 10:00\nCơ sở C1/);
    assert.deepEqual(notice.target, { area: "event", eventId: event.id });
    assert.equal("eventAnnouncements" in workspaceView(club, identity(person), 1).club, false);
  }
  const [shared] = memberNotificationsFor(club, minh.id);
  assert.deepEqual(memberNotificationsFor(club, extra.id), []);
  assert.equal(markMemberNotificationRead(club, minh.id, shared.id), true);
  assert.equal(memberNotificationsFor(structuredClone(club), minh.id)[0].read, true);
  assert.equal(memberNotificationsFor(club, other.id)[0].read, undefined);
  assert.equal(dismissMemberNotification(club, minh.id, shared.id), true);
  assert.equal(memberNotificationsFor(club, other.id)[0].id, shared.id);
  removeEventNotices(club, event.id);
  assert.deepEqual(memberNotificationsFor(club, other.id), []);
  assert.equal(club.dismissedNoticeIds?.[minh.id].includes(shared.id), false);
});

test("Dismissing a shared notice only removes it for that account and a deleted event clears its notices", () => {
  const { club, admin, minh, other, run } = fixture();
  const directId = crypto.randomUUID();
  run(admin, "sendDirectNotice", { id: directId, title: "Tin chung", body: "Lịch tuần này", audience: "all" });
  assert.equal(dismissMemberNotification(club, minh.id, directId), true);
  assert.equal(dismissMemberNotification(club, minh.id, directId), true);
  assert.deepEqual(memberNotificationsFor(structuredClone(club), minh.id), []);
  assert.equal(memberNotificationsFor(club, other.id)[0]?.id, directId);
  assert.equal(dismissMemberNotification(club, admin.id, directId), false);
  const eventId = "notice-event-delete";
  run(admin, "createEvent", { id: eventId, name: "Sinh hoạt chung", points: 1, startDate: today(), endDate: today() });
  run(minh, "registerEvent", { eventId });
  run(admin, "reviewActivity", { id: club.activityRegistrations![0].id, confirmed: true });
  const [eventNotice] = eventDecisions(club, minh.id);
  assert.equal(eventNotice?.kind, "activity");
  club.events = [];
  assert.deepEqual(memberNotificationsFor(club, minh.id), []);
  removeEventNotices(club, eventId);
  assert.equal(club.activityNotices?.some(item => item.id === eventNotice.id), false);
  assert.equal(memberNotificationsFor(club, other.id)[0]?.id, directId);
});

test("Per-round events deliver one private notice on closure with the actual confirmed rounds and points", () => {
  const { club, admin, minh, other, run } = fixture();
  const day = today();
  const close = Date.parse(addDays(day, 1) + "T00:00:00+07:00");
  const eventId = "event-round-result-test";
  run(admin, "createEvent", { id: eventId, name: "Tập huấn C1", scoringMode: "perRound", points: 0.25, startDate: day, endDate: day });
  run(minh, "registerEvent", { eventId });
  run(admin, "saveEventRounds", { eventId, memberId: minh.id, quantity: 3, previousQuantity: 0 });
  const [approval] = eventDecisions(club, minh.id);
  assert.ok(approval?.kind === "activity");
  assert.equal(approval.title, "Sự kiện đã duyệt");
  assert.deepEqual(approval.eventScore, { eventName: "Tập huấn C1", points: 0.75, rounds: 3 });
  const results = (memberId: string) => workspaceNotificationsFor(club, memberId, close + 100)
    .filter(item => item.kind === "activity").filter(item => item.roundEventResult);
  assert.equal(settleRoundEventNotices(club, close - 1000), true);
  assert.equal(settleRoundEventNotices(club, close - 1), false);
  assert.deepEqual(results(minh.id), []);
  assert.equal(settleRoundEventNotices(club, close), true);
  const [notice] = results(minh.id);
  assert.equal(notice?.body, "Bạn đã nhận 0,75 điểm vì tham gia sự kiện Tập huấn C1 3 lần");
  assert.deepEqual(notice.eventScore, approval.eventScore);
  assert.equal(notice.createdAt, close);
  assert.equal(markWorkspaceNotificationRead(club, minh.id, notice.id, close + 11), true);
  assert.equal(settleRoundEventNotices(club, close + 20), false);
  assert.deepEqual(results(other.id), []);
  assert.equal(results(minh.id)[0]?.read, true);
  const oldReceipt = club.activityNotices?.find(item => item.id === notice.id);
  assert.ok(oldReceipt?.kind === "activity");
  delete oldReceipt.eventScore;
  assert.equal(settleRoundEventNotices(club, close + 21), true);
  assert.equal(results(minh.id)[0]?.read, true);
  assert.equal(results(minh.id)[0]?.createdAt, close);
  assert.deepEqual(results(minh.id)[0]?.eventScore, approval.eventScore);
  club.activityRegistrations!.find(row => row.eventId === eventId)!.quantity = 4;
  assert.equal(settleRoundEventNotices(club, close + 30), true);
  assert.deepEqual(results(minh.id).map(item => item.id), [notice.id]);
  assert.equal(results(minh.id)[0]?.body, "Bạn đã nhận 1 điểm vì tham gia sự kiện Tập huấn C1 4 lần");
  assert.deepEqual(results(minh.id)[0]?.eventScore, { eventName: "Tập huấn C1", points: 1, rounds: 4 });
});

test("Document uploads keep their sanitized filename when attached to a bulletin", () => {
  const { club, minh, run, identity } = fixture();
  const name = bulletinDocumentName("folder/Quy chế.PDF");
  const type = bulletinDocumentType(name);
  assert.equal(name, "Quy chế.PDF");
  assert.equal(type, "application/pdf");
  assert.equal(bulletinDocumentType("noi-dung.html"), undefined);
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  for (const filename of ["BanCu.doc", "DiemCu.xls", "TrinhChieu.ppt"]) {
    assert.equal(validBulletinDocumentPrefix(ole, bulletinDocumentType(filename)!), true);
    assert.equal(validBulletinDocumentPrefix(new TextEncoder().encode("%PDF-1.7"), bulletinDocumentType(filename)!), false);
  }
  assert.equal(bulletinMediaByteLimit(type!), 20 * 1024 * 1024);
  const postId = "document-test-post";
  const media = { id: crypto.randomUUID(), type: type!, name, bytes: 123 };
  club.bulletinUploads = [{ ...media, postId, uploaderId: minh.id, expiresAt: Date.now() + 60_000 }];
  run(minh, "saveBulletinPost", { id: postId, title: "Tài liệu Bảng tin", content: "", mediaIds: [media.id] });
  assert.deepEqual(workspaceView(club, identity(minh), 1).bulletin!.posts[0].media, [media]);
});
