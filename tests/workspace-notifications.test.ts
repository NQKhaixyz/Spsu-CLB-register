import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, type Identity } from "../lib/actions";
import { bulletinDateInput } from "../lib/bulletin";
import { bulletinDocumentName, bulletinDocumentType, bulletinMediaByteLimit } from "../lib/bulletin-media";
import { addDays, createClub, syncWeeks, today, weekId, type Member } from "../lib/club";
import { memberNotificationsFor, markMemberNotificationRead } from "../lib/feedback-notifications";
import { workspaceNotificationsFor, markWorkspaceNotificationRead } from "../lib/workspace-notifications";
import { workspaceView } from "../lib/workspace-view";

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
  assert.equal(received[0].kind === "score" && received[0].week, points.week);
  assert.equal(markMemberNotificationRead(club, other.id, received[0].id), false);
  assert.equal(markMemberNotificationRead(club, minh.id, received[0].id), true);
  assert.equal(memberNotificationsFor(club, minh.id)[0].read, true);
  assert.deepEqual(memberNotificationsFor(club, other.id), []);
  assert.equal("activityNotices" in workspaceView(club, identity(other), 1).club, false);
  const id = "notice-deduction-test";
  run(admin, "deductPoints", { ...points, id, reason: "Lý do riêng", points: 0.5 });
  assert.ok(memberNotificationsFor(club, minh.id).some(item => item.kind === "score" && item.change === -0.5));
  run(admin, "cancelPointDeduction", { id, reason: "Sửa khoản trừ" });
  assert.ok(memberNotificationsFor(club, minh.id).some(item => item.kind === "score" && item.change === 0.5));
  assert.ok(!JSON.stringify(memberNotificationsFor(club, minh.id)).includes("Lý do riêng"));
});

test("Duty notices start at publication, reach new assignments, and retire when a shift is cancelled", () => {
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
  assert.deepEqual(memberNotificationsFor(club, minh.id), []);
  run(admin, "restoreShift", { month, shiftId });
  const restored = memberNotificationsFor(club, minh.id);
  assert.equal(restored.length, 1);
  assert.notEqual(restored[0].id, published.id);
});

test("Document uploads keep their sanitized filename when attached to a bulletin", () => {
  const { club, minh, run, identity } = fixture();
  const name = bulletinDocumentName("folder/Quy chế.PDF");
  const type = bulletinDocumentType(name);
  assert.equal(name, "Quy chế.PDF");
  assert.equal(type, "application/pdf");
  assert.equal(bulletinDocumentType("noi-dung.html"), undefined);
  assert.equal(bulletinMediaByteLimit(type!), 20 * 1024 * 1024);
  const postId = "document-test-post";
  const media = { id: crypto.randomUUID(), type: type!, name, bytes: 123 };
  club.bulletinUploads = [{ ...media, postId, uploaderId: minh.id, expiresAt: Date.now() + 60_000 }];
  run(minh, "saveBulletinPost", { id: postId, title: "Tài liệu Bảng tin", content: "", mediaIds: [media.id] });
  assert.deepEqual(workspaceView(club, identity(minh), 1).bulletin!.posts[0].media, [media]);
});
