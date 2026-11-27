import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, type Identity } from "../lib/actions";
import { createClub, type Member, type Shift } from "../lib/club";
import { evidenceExpiry, evidenceSubmissionOpen, findEvidenceAssignment } from "../lib/duty-evidence";
import { dutyPhotoKey, purgeExpiredDutyPhotos } from "../lib/duty-photo-storage";
import { workspaceView } from "../lib/workspace-view";

const adminIdentity: Identity = { userId: "admin", displayName: "BĐH", email: "" };
const memberIdentity: Identity = { userId: "member", displayName: "Thành viên", email: "" };
const admin: Member = { id: "a", userId: "admin", name: "BĐH", studentId: "ADMIN01", role: "admin", active: true, joined: "2026-01-01", availability: [], extraDuties: false };
const member: Member = { ...admin, id: "m", userId: "member", name: "Thành viên", studentId: "MEMBER01", role: "member" };

test("Minh chứng mở khi bắt đầu ca và hết hạn đúng đầu tuần theo giờ Việt Nam", () => {
  const shift: Shift = { id: "2026-11-15-am", date: "2026-11-15", period: "am", startTime: "08:00", assignments: [] };
  assert.equal(evidenceExpiry(shift.date), Date.parse("2026-11-15T17:00:00Z"));
  assert.equal(evidenceSubmissionOpen(shift, new Date("2026-11-15T00:59:59Z")), false);
  assert.equal(evidenceSubmissionOpen(shift, new Date("2026-11-15T01:00:00Z")), true);
  assert.equal(evidenceSubmissionOpen(shift, new Date("2026-11-15T16:59:59Z")), true);
  assert.equal(evidenceSubmissionOpen(shift, new Date("2026-11-15T17:00:00Z")), false);
});

test("Chỉ BĐH hoặc người trực được mở minh chứng của ca đã công bố", () => {
  const club = createClub(adminIdentity.userId);
  club.members = [admin, member];
  const shift: Shift = { id: "2026-11-14-am", date: "2026-11-14", period: "am", assignments: [{ memberId: member.id, result: "unverified" }] };
  club.schedules = [{ month: "2026-11", published: true, shifts: [shift] }];
  const target = { month: "2026-11", shiftId: shift.id, memberId: member.id };
  assert.equal(findEvidenceAssignment(club, admin, target), shift);
  assert.equal(findEvidenceAssignment(club, member, target), shift);
  assert.equal(findEvidenceAssignment(club, { ...member, id: "other" }, target), null);
  assert.equal(findEvidenceAssignment(club, { ...admin, active: false }, target), null);
  shift.assignments.push({ memberId: admin.id, result: "unverified" });
  assert.equal(findEvidenceAssignment(club, admin, { ...target, memberId: admin.id }), null);
  shift.draft = true;
  assert.equal(findEvidenceAssignment(club, admin, target), null);
  shift.draft = false;
  shift.cancelled = true;
  assert.equal(findEvidenceAssignment(club, member, target), null);
  shift.cancelled = false;
  shift.assignments[0].memberId = "replacement";
  assert.equal(findEvidenceAssignment(club, member, target), null);
});

test("Dọn ảnh qua nhiều trang chỉ xóa ảnh từ tuần trước", async () => {
  const expired = dutyPhotoKey("2026-11-15", "11111111-1111-4111-8111-111111111111");
  const current = dutyPhotoKey("2026-11-16", "22222222-2222-4222-8222-222222222222");
  const unrelated = "other-picture.jpg";
  const deleted: string[] = [];
  let cursorSeen: string | undefined;
  const bucket = {
    list: async ({ cursor }: { cursor?: string }) => {
      cursorSeen = cursor;
      return cursor
        ? { objects: [{ key: expired }], truncated: false }
        : { objects: [{ key: current }, { key: unrelated }], truncated: true, cursor: "next" };
    },
    delete: async (keys: string[]) => deleted.push(...keys),
  } as unknown as R2Bucket;
  let cutoff: number | undefined;
  const db = {
    prepare: (query: string) => {
      assert.match(query, /DELETE FROM duty_evidence.*status='pending'/);
      return { bind: (timestamp: number) => ({ run: async () => { cutoff = timestamp; } }) };
    },
  } as unknown as D1Database;
  const now = new Date("2026-11-15T17:00:00Z");
  assert.equal(await purgeExpiredDutyPhotos(bucket, db, now), true);
  assert.equal(cursorSeen, "next");
  assert.deepEqual(deleted, [expired]);
  assert.equal(cutoff, +now);
});

test("BĐH quản lý link, thành viên đọc được nguyên văn và yêu cầu cũ không ghi đè được", () => {
  const club = createClub(adminIdentity.userId);
  club.members = [admin, member];
  const data = { title: "Tài liệu", description: "Mô tả gốc", url: "https://example.org/tailieu" };
  assert.throws(() => applyAction(club, memberIdentity, "saveSharedLink", data), /Chỉ BĐH/);
  assert.throws(() => applyAction(club, adminIdentity, "saveSharedLink", { ...data, url: "javascript:alert(1)" }), /https/);
  applyAction(club, adminIdentity, "saveSharedLink", data);
  const link = { ...club.links![0] };
  const published = workspaceView(club, memberIdentity, 1).club.links![0];
  assert.equal(published.description, data.description);
  assert.equal(published.url, data.url);
  assert.throws(() => applyAction(club, memberIdentity, "deleteSharedLink", link), /Chỉ BĐH/);
  assert.throws(() => applyAction(club, adminIdentity, "deleteSharedLink", { ...link, updatedAt: "stale" }), /vừa được cập nhật/);
  applyAction(club, adminIdentity, "saveSharedLink", { ...link, description: "Đã sửa" });
  assert.equal(club.links![0].description, "Đã sửa");
  applyAction(club, adminIdentity, "deleteSharedLink", club.links![0]);
  assert.deepEqual(club.links, []);
});
