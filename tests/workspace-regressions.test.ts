import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../lib/actions";
import { createClub, createDutyShiftSlots, type AvailabilityDataset } from "../lib/club";
import { academicWeekForClub } from "../lib/availability";
import { workspaceView } from "../lib/workspace-view";
import { resolveFont, interfaceFonts } from "../lib/interface-fonts";
import { sidebarTabLabels, sidebarTabs } from "../lib/workspace-navigation";
import { memberPositions, memberRoleLabel } from "../lib/member-positions";
import { bulletinDateInput, bulletinView, parseBulletinDate, pruneBulletinState, pruneExpiredBulletinPosts } from "../lib/bulletin";
import { bulletinInline, toggleBulletinEmphasis } from "../lib/bulletin-format";
import { bulletinByteRange, bulletinMediaIds, bulletinMediaKey, removedBulletinKeys } from "../lib/bulletin-media";
import { displayMessage } from "../lib/display-message";

const owner = {userId:"workspace-regression-owner",displayName:"BĐH",email:""};

test("Displayed notices keep decimal points, domains, file extensions, question marks and ellipses", () => {
  assert.equal(displayMessage("Đã lưu 0.25 điểm. Bạn muốn mở tệp diem.v2.xlsx?"), "Đã lưu 0.25 điểm, bạn muốn mở tệp diem.v2.xlsx?");
  assert.equal(displayMessage("Xem https://example.org/nhom.v2 hoặc lienhe@doi.vn."), "Xem https://example.org/nhom.v2 hoặc lienhe@doi.vn");
  assert.equal(displayMessage("Đang tải..."), "Đang tải...");
  assert.equal(displayMessage("Đã lưu. BĐH có thể xem."), "Đã lưu, BĐH có thể xem");
});

test("Members and admins save independent typefaces that follow their own account", () => {
  const { c, pending } = fixture();
  pending.userId = "font-test-member";
  const member = { userId: pending.userId, displayName: pending.name, email: "" };
  const saved = (user: typeof owner) => workspaceView(JSON.parse(JSON.stringify(c)), user, 1);
  assert.equal(resolveFont(saved(member).me?.fontPreference), "inter");
  assert.equal(resolveFont("obsolete"), "inter");
  assert.deepEqual(interfaceFonts.map(font => font.name), ["Inter", "Nunito", "Lexend", "Spectral"]);
  const rules = structuredClone(c.rules);
  const logs = c.logs.length;
  applyAction(c, owner, "setMyFont", { font: "nunito" });
  for (const { id } of interfaceFonts) {
    applyAction(c, member, "setMyFont", { font: id });
    assert.equal(saved(member).me?.fontPreference, id);
    assert.equal(saved(owner).me?.fontPreference, "nunito");
    assert.ok(saved(owner).club.members.every(m => m.fontPreference === undefined));
  }
  assert.deepEqual(c.rules, rules);
  assert.equal(c.logs.length, logs);
  assert.throws(() => applyAction(c, owner, "setMyFont", { memberId: pending.id, font: "inter" }), /tài khoản của mình/);
  for (const font of [null, false, "__proto__", "Arial", {}]) assert.throws(() => applyAction(c, member, "setMyFont", { font }), /Phông chữ/);
  applyAction(c, owner, "settings", { name: "Đội kiểm thử" });
  assert.equal(saved(member).me?.fontPreference, "spectral");
  applyAction(c, owner, "setMyFont", { font: "inter" });
  assert.equal(saved(owner).me?.fontPreference, "inter");
  assert.equal(saved(member).me?.fontPreference, "spectral");
});
function fixture() {
  const c=createClub(owner.userId);
  applyAction(c,owner,"profile",{name:"BĐH",studentId:"BCS001"});
  applyAction(c,owner,"member",{name:"Mai Lan",studentId:"TEMP001"});
  const pending=c.members[1]; pending.studentId=""; pending.needsStudentId=true;
  const dataset: AvailabilityDataset = {filename:"source.xlsx",importedAt:"2026-10-31",importedBy:"BĐH",rows:[{sourceRow:2,name:"Mai Lan",day:"Thứ 2",period:"Sáng",weeks:"11-18",note:"Thông tin lịch rảnh"}],memberLinks:{"mai lan":pending.id}};
  c.availabilityDataset=structuredClone(dataset);
  c.activeAvailabilityDataset=structuredClone(dataset);
  return {c,pending};
}
test("The sidebar uses one fixed order and member positions do not grant BĐH permissions", () => {
  const { c, pending } = fixture();
  pending.userId = "sidebar-order-reader";
  const member = { userId: pending.userId, displayName: pending.name, email: "" };
  const admin = c.members.find(m => m.userId === owner.userId)!;
  pending.sidebarOrder = ["members", "personal"];
  admin.sidebarOrder = ["overview", "scoreboard"];
  assert.deepEqual(sidebarTabs.map(tab => sidebarTabLabels[tab]), ["Bảng tin", "Hoạt động", "Bảng điểm", "Feedback", "Trò chơi", "Góc của tôi", "Thành viên"]);
  for (const identity of [owner, member]) {
    const view = workspaceView(c, identity, 1);
    assert.equal(view.me?.sidebarOrder, undefined);
    assert.ok(view.club.members.every(profile => profile.sidebarOrder === undefined));
  }
  assert.equal(memberPositions.length, 9);
  assert.equal(memberRoleLabel({ role: "member", position: "secretary" }), "Thư ký");
  for (const position of memberPositions) {
    applyAction(c, owner, "member", { memberId: pending.id, role: "member", position });
    const view = workspaceView(c, member, 1);
    assert.equal(view.isAdmin, false);
    assert.equal(view.me?.position, position);
    assert.equal(view.club.members.find(profile => profile.id === pending.id)?.position, position);
    assert.throws(() => applyAction(c, member, "member", { memberId: pending.id, role: "admin" }), /Chỉ BĐH/);
  }
  assert.throws(() => applyAction(c, owner, "member", { memberId: pending.id, role: "admin", position: "captain" }), /tài khoản thành viên/);
  applyAction(c, owner, "member", { memberId: pending.id, position: "" });
  assert.equal(memberRoleLabel(pending), "Thành viên");
});
test("BĐH can assign a week number from a chosen date and keep prior calendar weeks", () => {
  const { c, pending } = fixture();
  pending.userId = "academic-week-reader";
  const member = { userId: pending.userId, displayName: pending.name, email: "" };
  const draft = { date: "2027-01-06", weekNumber: "1" };
  assert.equal(academicWeekForClub(c, "2027-01-01"), 18);
  assert.throws(() => applyAction(c, member, "setAcademicWeekAnchor", draft), /Chỉ BĐH/);
  assert.throws(() => applyAction(c, owner, "setAcademicWeekAnchor", { ...draft, date: "2027-02-30" }), /ngày hợp lệ/);
  assert.throws(() => applyAction(c, owner, "setAcademicWeekAnchor", { ...draft, weekNumber: true }), /Số tuần học/);
  applyAction(c, owner, "setAcademicWeekAnchor", draft);
  assert.deepEqual(c.academicWeekAnchors, [{ anchorDate: "2027-01-04", anchorWeek: 1 }]);
  assert.equal(academicWeekForClub(c, "2027-01-03"), 18);
  assert.equal(academicWeekForClub(c, "2027-01-10"), 1);
  assert.equal(academicWeekForClub(c, "2027-01-11"), 2);
  c.days = [1];
  assert.equal(createDutyShiftSlots(c, "2027-01", 2).find(shift => shift.date === "2027-01-11")?.academicWeek, 2);
  applyAction(c, owner, "setAcademicWeekAnchor", { date: "2027-01-09", weekNumber: 3 });
  assert.deepEqual(c.academicWeekAnchors, [{ anchorDate: "2027-01-04", anchorWeek: 3 }]);
  assert.deepEqual(workspaceView(c, member, 1).club.academicWeekAnchors, c.academicWeekAnchors);
});

test("Bulletin posts are readable by members, with author editing, safe retries and stale edit checks", () => {
  const { c, pending } = fixture();
  pending.userId = "bulletin-reader";
  const reader = { userId: pending.userId, displayName: pending.name, email: "" };
  const post = { id: "bulletin-test-one", title: "  Lịch sinh hoạt  ", content: "  Họp vào thứ Hai\nMang theo tài liệu  " };
  const save = (data: Record<string, unknown>) => applyAction(c, owner, "saveBulletinPost", data);
  assert.throws(() => applyAction(c, reader, "saveBulletinPost", { ...post, deleteAt: "" }), /Chỉ BĐH được hẹn giờ/);
  assert.throws(() => save({ ...post, title: "  " }), /tiêu đề/);
  assert.throws(() => save({ ...post, content: "  " }), /nội dung/);
  assert.equal(c.bulletinPosts, undefined);

  save(post);
  save(post);
  const published = { id: post.id, title: post.title.trim(), content: post.content.trim(), revision: 1 };
  assert.equal(workspaceView(c, reader, 1).club.bulletinPosts, undefined);
  assert.equal(workspaceView(c, reader, 1).bulletin?.posts[0].content, published.content);
  assert.equal(workspaceView(c, reader, 1).bulletin?.posts[0].author.name, c.members[0].name);
  const second = { id: "bulletin-test-two", title: "Nhắc lịch trực", content: "Kiểm tra lịch tuần này" };
  save(second);
  assert.deepEqual(c.bulletinPosts!.map(item => item.id), [second.id, post.id]);

  const edit = { ...published, content: "Chuyển lịch sang thứ Tư\nXem giờ trong Lịch trực C1" };
  assert.throws(() => applyAction(c, reader, "saveBulletinPost", edit), /bản tin của mình/);
  save(edit);
  save(edit);
  assert.throws(() => save({ ...published, content: "Không ghi đè được" }), /vừa được cập nhật/);
  assert.equal(workspaceView(c, reader, 2).bulletin?.posts[1].content, edit.content);
  assert.equal(workspaceView(c, reader, 2).bulletin?.posts[1].revision, 2);
});
test("Publication and expiry use Vietnam time, with private drafts and idempotent social actions", () => {
  const { c, pending } = fixture();
  pending.userId = "bulletin-interaction";
  const reader = { userId: pending.userId, displayName: pending.name, email: "" };
  const input = bulletinDateInput(Date.now() + 86400000);
  const publishAt = parseBulletinDate(input)!;
  const deleteAt = publishAt + 3600000;
  const future = { id: "future-post", title: "Tin hẹn đăng", content: "Tin dành cho cả Đội", publishAt: input, deleteAt: bulletinDateInput(deleteAt) };
  assert.equal(parseBulletinDate("2026-11-28T07:30"), Date.parse("2026-11-28T00:30:00Z"));
  assert.ok(Number.isNaN(parseBulletinDate("2026-02-30T10:00")));
  assert.throws(() => applyAction(c, owner, "saveBulletinPost", { ...future, deleteAt: input }), /Giờ xóa/);
  applyAction(c, owner, "saveBulletinPost", future);
  assert.equal(bulletinView(c, pending, publishAt - 1).posts.length, 0);
  assert.equal(bulletinView(c, c.members[0], publishAt - 1).posts[0].published, false);
  assert.equal(bulletinView(c, pending, publishAt).posts[0].published, true);
  assert.equal(bulletinView(c, pending, deleteAt).posts.length, 0);
  assert.ok(!JSON.stringify(workspaceView(c, reader, 2)).includes(future.title));
  const like = { postId: future.id, liked: true };
  assert.throws(() => applyAction(c, reader, "setBulletinLike", like), /chưa đăng/);
  applyAction(c, owner, "saveBulletinPost", { ...future, revision: 1, publishAt: "" });
  applyAction(c, reader, "setBulletinLike", like);
  applyAction(c, reader, "setBulletinLike", like);
  const comment = { id: "comment-same-attempt", postId: future.id, content: "Đã rõ giờ họp" };
  applyAction(c, reader, "commentOnBulletin", comment);
  applyAction(c, reader, "commentOnBulletin", comment);
  const publicPost = workspaceView(c, reader, 3).bulletin?.posts[0];
  assert.equal(publicPost?.likeCount, 1);
  assert.equal(publicPost?.liked, true);
  assert.equal(publicPost?.comments.length, 1);
  assert.equal(publicPost?.comments[0].author.name, pending.name);
  assert.equal(publicPost?.comments[0].author.memberId, pending.id);
  applyAction(c, reader, "setBulletinSaved", { postId: future.id, saved: true });
  assert.equal(bulletinView(c, pending).posts[0].saved, true);
  assert.equal(bulletinView(c, c.members[0]).posts[0].saved, false);
  const answer = { ...comment, id: "comment-a-reply", replyTo: comment.id, content: "Cảm ơn bạn" };
  assert.throws(() => applyAction(c, owner, "commentOnBulletin", { ...answer, replyTo: future.id }), /Không tìm thấy bình luận/);
  applyAction(c, owner, "commentOnBulletin", answer);
  applyAction(c, owner, "commentOnBulletin", answer);
  applyAction(c, reader, "setBulletinCommentLike", { postId: future.id, commentId: answer.id, liked: true });
  const replies = bulletinView(c, pending).posts[0].comments;
  assert.equal(replies.length, 2);
  assert.equal(replies[1].replyTo, comment.id);
  assert.equal(replies[1].likeCount, 1);
  assert.equal(replies[1].liked, true);
  assert.ok(!("likedBy" in replies[1]));
  applyAction(c, reader, "setBulletinLike", { ...like, liked: false });
  assert.equal(bulletinView(c, pending).posts[0].likeCount, 0);
  assert.throws(() => applyAction(c, reader, "deleteBulletinPost", { id: future.id, revision: 2 }), /bản tin của mình/);
  assert.throws(() => applyAction(c, owner, "deleteBulletinPost", { id: future.id, revision: 1 }), /vừa được cập nhật/);
  const copy = structuredClone(c);
  applyAction(copy, owner, "deleteBulletinPost", { id: future.id, revision: 2 });
  assert.deepEqual(copy.bulletinPosts, []);
  assert.equal(pruneExpiredBulletinPosts(c, deleteAt), true);
  assert.deepEqual(c.bulletinPosts, []);
});
test("Legacy bulletin authors come from matching creation logs and survive later title edits", () => {
  const { c, pending } = fixture();
  const author = c.members[0];
  author.avatarId = "test-avatar";
  const createdAt = Date.now() - 60_000;
  c.bulletinPosts = [
    { id: "legacy-post", title: "Tin cũ", content: "Nội dung", revision: 1, createdAt },
    { id: "legacy-unknown", title: "Tin khác", content: "Nội dung", revision: 1 },
  ];
  c.logs.push({ at: new Date(createdAt).toISOString(), actor: author.name, actorId: author.id, text: "Đăng bản tin Tin cũ" });
  const initial = bulletinView(c, pending).posts;
  assert.deepEqual(initial[0].author, { memberId: author.id, name: author.name, avatarId: author.avatarId });
  assert.equal(initial[1].author.name, "Ban điều hành");
  assert.equal(initial[1].author.memberId, undefined);
  applyAction(c, owner, "saveBulletinPost", { id: "legacy-post", title: "Tiêu đề mới", content: "Nội dung", revision: 1 });
  assert.equal(bulletinView(c, pending).posts[0].author.name, author.name);
  assert.ok(!("createdBy" in bulletinView(c, pending).posts[0]));
});

test("Authors can edit and delete their bulletin comments while existing replies remain visible", () => {
  const { c, pending } = fixture();
  pending.userId = "comment-editor";
  const reader = { userId: pending.userId, displayName: pending.name, email: "" };
  const postId = "comment-edit-post";
  applyAction(c, owner, "saveBulletinPost", { id: postId, title: "Bản tin", content: "Cùng trao đổi" });
  const original = { id: "comment-original", postId, content: "Nội dung gốc" };
  applyAction(c, reader, "commentOnBulletin", original);
  const answer = { id: "comment-reply-1", postId, replyTo: original.id, content: "Cảm ơn bạn" };
  applyAction(c, owner, "commentOnBulletin", answer);
  const edit = { postId, commentId: original.id, content: "  Nội dung đã sửa  " };
  assert.throws(() => applyAction(c, owner, "editBulletinComment", edit), /bình luận của mình/);
  assert.throws(() => applyAction(c, owner, "deleteBulletinComment", edit), /bình luận của mình/);
  applyAction(c, reader, "editBulletinComment", edit);
  applyAction(c, reader, "commentOnBulletin", original);
  const [updated, reply] = bulletinView(c, pending).posts[0].comments;
  assert.equal(updated.canManage, true);
  assert.equal(reply.canManage, false);
  assert.equal(updated.content, "Nội dung đã sửa");
  assert.ok(updated.editedAt && updated.editedAt > updated.createdAt);
  assert.throws(() => applyAction(c, reader, "deleteBulletinComment", edit), /vừa được chỉnh sửa/);
  const deletion = { ...edit, previousEditedAt: updated.editedAt };
  applyAction(c, reader, "deleteBulletinComment", deletion);
  applyAction(c, reader, "deleteBulletinComment", deletion);
  applyAction(c, reader, "commentOnBulletin", original);
  assert.deepEqual(bulletinView(c, pending).posts[0].comments.map(item => [item.id, item.replyTo]), [[answer.id, original.id]]);
  assert.throws(() => applyAction(c, owner, "commentOnBulletin", { ...answer, id: "comment-new-reply" }), /Không tìm thấy bình luận/);
  assert.throws(() => applyAction(c, reader, "editBulletinComment", deletion), /đã bị xóa/);
  assert.equal(c.bulletinPosts?.[0].comments?.[0].content, "");
});

test("Bulletin formatting supports nested emphasis and preserves literal text in an older post", () => {
  const raw = "Đội *2026* và phần cần nhấn";
  const start = raw.indexOf("phần");
  const bold = toggleBulletinEmphasis(raw, start, raw.length, "**", false);
  const both = toggleBulletinEmphasis(bold.value, bold.start, bold.end, "_", true);
  assert.deepEqual(bulletinInline(both.value), [
    "Đội ", "*", "2026", "*", " và ",
    { marker: "**", children: [{ marker: "_", children: ["phần cần nhấn"] }] },
  ]);
  const italic = toggleBulletinEmphasis(both.value, both.start, both.end, "**", true);
  assert.deepEqual(bulletinInline(italic.value).at(-1), { marker: "_", children: ["phần cần nhấn"] });
  assert.deepEqual(bulletinInline("**<img src=x onerror=bad>**\n_đang viết"), [
    { marker: "**", children: ["<img src=x onerror=bad>"] }, "\n", "_", "đang viết",
  ]);
});
test("Members can post and manage their own attachments, with one-time draft ownership and cleanup", () => {
  const { c, pending } = fixture();
  pending.userId = "media-member";
  const user = { userId: pending.userId, displayName: pending.name, email: "" };
  const post = { id: "member-post-media", title: "Ảnh buổi họp", content: "" };
  const now = Date.now();
  const own = { id: crypto.randomUUID(), type: "image/jpeg" as const, bytes: 156, postId: post.id, uploaderId: pending.id, expiresAt: now + 30_000 };
  const foreign = { ...own, id: crypto.randomUUID(), uploaderId: c.members[0].id };
  const wrongPost = { ...own, id: crypto.randomUUID(), postId: "different-post" };
  c.bulletinUploads = [own, foreign, wrongPost];
  assert.throws(() => applyAction(c, user, "saveBulletinPost", { ...post, mediaIds: [foreign.id] }), /không còn dùng được/);
  assert.throws(() => applyAction(c, user, "saveBulletinPost", { ...post, mediaIds: [wrongPost.id] }), /không còn dùng được/);
  assert.throws(() => applyAction(c, user, "saveBulletinPost", { ...post, mediaIds: [own.id, own.id] }), /Danh sách tệp/);
  const initial = bulletinMediaIds(c);
  applyAction(c, user, "saveBulletinPost", { ...post, mediaIds: [own.id] });
  applyAction(c, user, "saveBulletinPost", { ...post, mediaIds: [own.id] });
  const view = workspaceView(c, user, 1);
  const published = view.bulletin!.posts[0];
  assert.equal(published.author.name, pending.name);
  assert.equal(published.canManage, true);
  assert.equal(published.revision, 1);
  assert.deepEqual(published.media, [{ id: own.id, type: own.type, bytes: own.bytes }]);
  assert.equal(view.club.bulletinUploads, undefined);
  assert.deepEqual(c.bulletinUploads.map(upload => upload.id), [foreign.id, wrongPost.id]);
  assert.deepEqual(removedBulletinKeys(initial, c), []);
  applyAction(c, user, "saveBulletinPost", { ...post, content: "Thêm chú thích", revision: 1 });
  assert.equal(c.bulletinPosts?.[0].media?.[0].id, own.id);
  applyAction(c, user, "saveBulletinPost", { ...post, content: "Chỉ giữ chữ", revision: 2, mediaIds: [] });
  assert.deepEqual(removedBulletinKeys(initial, c), [bulletinMediaKey(own.id)]);
  assert.throws(() => applyAction(c, user, "saveBulletinPost", { ...post, revision: 3, mediaIds: [own.id] }), /không còn dùng được/);
  applyAction(c, user, "deleteBulletinPost", { id: post.id, revision: 3 });
  assert.deepEqual(c.bulletinPosts, []);
  assert.equal(pruneBulletinState(c, own.expiresAt), true);
  assert.deepEqual(removedBulletinKeys(initial, c).sort(), [...initial].map(bulletinMediaKey).sort());
});
test("Bulletin video ranges support playback seeking, suffixes and invalid offsets", () => {
  assert.deepEqual(bulletinByteRange("bytes=0-1", 400), { offset: 0, length: 2 });
  assert.deepEqual(bulletinByteRange("bytes=300-", 400), { offset: 300, length: 100 });
  assert.deepEqual(bulletinByteRange("bytes=-25", 400), { offset: 375, length: 25 });
  assert.deepEqual(bulletinByteRange("bytes=300-1000", 400), { offset: 300, length: 100 });
  for (const invalid of ["bytes=400-", "bytes=20-10", "bytes=-0", "bytes=-", "bytes=0-1,10-11", "bytes=999999999999999999-"])
    assert.equal(bulletinByteRange(invalid, 400), null);
});
test("Member response removes both staged and active source datasets without modifying admin state",()=>{
  const {c,pending}=fixture(); pending.userId="workspace-member";
  const before=JSON.stringify(c);
  const member=workspaceView(c,{userId:pending.userId,displayName:pending.name,email:""},5);
  assert.equal(member.club.availabilityDataset,undefined);
  assert.equal(member.club.activeAvailabilityDataset,undefined);
  assert.equal(member.club.ownerId,"");
  assert.deepEqual(member.club.logs,[]);
  assert.equal(JSON.stringify(c),before);
  assert.ok(workspaceView(c,owner,5).club.activeAvailabilityDataset);
});
test("Signed-in members see peer profiles and applied availability with overrides, without administrative or private scoring data", () => {
  const { c, pending } = fixture();
  const observer = { userId: "directory-reader", displayName: "Người xem lịch", email: "" };
  applyAction(c, observer, "profile", { name: observer.displayName, studentId: "VIEW001" });
  Object.assign(pending, {
    email: "mai@example.test", loginName: "mai-lan", committees: ["cm", "sk"], extraDuties: true,
    availability: ["2-am"], availabilityOverrides: { "1-am": false, "3-pm": true }, userId: "native:private-peer", fontPreference: "nunito",
  });
  const dataset = c.activeAvailabilityDataset!;
  dataset.settings = { anchorDate: "2026-11-09", anchorWeek: 11, startDate: "2026-11-09", amStart: "07:00", amEnd: "11:00", pmStart: "13:00", pmEnd: "17:00", allowedLateMinutes: 5, ignoreSourceNotes: true };
  dataset.rows.push(
    { ...dataset.rows[0], day: "Thứ 5", period: "13:30–16:45", weeks: "12-14", note: "Rảnh sau giờ học" },
    { ...dataset.rows[0], name: "Chưa khớp", note: "Dòng chưa khớp riêng tư" },
  );
  c.availabilityDataset!.rows[0].note = "Bản nháp chưa áp dụng";
  c.pointDeductions = [{ id: "d", memberId: pending.id, date: "2026-11-09", week: "2026-11-09", points: 2, reason: "Lý do nội bộ", createdAt: "", createdBy: "owner" }];
  const before = JSON.stringify(c);
  const view = workspaceView(c, observer, 2);
  const profile = view.club.members.find(m => m.id === pending.id)!;
  assert.equal(view.isAdmin, false);
  assert.equal(profile.email, pending.email);
  assert.equal(profile.loginName, pending.loginName);
  assert.equal(profile.extraDuties, true);
  assert.deepEqual(profile.committees, pending.committees);
  assert.deepEqual(profile.availability, ["2-am", "3-pm", "4-pm"]);
  assert.equal(view.club.members[0].role, "admin");
  assert.equal(view.club.members[0].studentId, "BCS001");
  assert.equal(profile.userId, undefined);
  assert.equal(profile.fontPreference, undefined);
  assert.deepEqual(view.directoryAvailability?.[pending.id][1], { day: "Thứ 5", period: "13:30–16:45", weeks: "12-14", note: "Rảnh sau giờ học" });
  const json = JSON.stringify(view);
  for (const secret of ["native:private-peer", "Dòng chưa khớp riêng tư", "Bản nháp chưa áp dụng", "Lý do nội bộ", "source.xlsx"])
    assert.ok(!json.includes(secret));
  assert.equal(JSON.stringify(c), before);
  const guest = workspaceView(c, { ...observer, userId: "unlinked" }, 2);
  assert.equal(guest.directoryAvailability, undefined);
  assert.ok(!JSON.stringify(guest).includes(pending.email!));
});
test("BĐH roster imports and manual additions cannot duplicate a source profile pending MSSV",()=>{
  const {c,pending}=fixture();
  assert.throws(()=>applyAction(c,owner,"import",{kind:"members",rows:[{name:"MAI   LAN",studentId:"REAL001"}]}),/đang chờ MSSV/);
  assert.throws(()=>applyAction(c,owner,"member",{name:"Mai Lan",studentId:"REAL001"}),/hồ sơ chờ MSSV/);
  assert.equal(c.members.length,2);
  applyAction(c,owner,"member",{memberId:pending.id,studentId:"REAL001"});
  applyAction(c,owner,"import",{kind:"members",rows:[{name:"Mai Lan",studentId:"REAL001"}]});
  assert.equal(c.members.length,2);
  assert.equal(c.activeAvailabilityDataset?.memberLinks?.["mai lan"],pending.id);
});
test("BĐH cannot enter reserved logins as MSSVs for pending or new members",()=>{
  const {c,pending}=fixture();
  for(const studentId of ["admin","MEMBER"]){
    assert.throws(()=>applyAction(c,owner,"member",{memberId:pending.id,studentId}),/dành riêng/);
    assert.throws(()=>applyAction(c,owner,"import",{kind:"members",rows:[{name:"New Person",studentId}]}),/dành riêng/);
  }
  assert.equal(pending.studentId,"");
});

test("Legacy organization and role wording updates for display while identifiers and stored records stay intact",()=>{
  const {c}=fixture();
  c.name="Nhịp CLB";
  c.weeks[0].location="Phòng sinh hoạt CLB";
  c.members[0].name="Ban cán sự";
  c.members[0].loginName="BCS";
  c.logs=[{at:"2026-10-31",actor:"Ban cán sự",text:"BCS chấp thuận"}];
  c.weeks[0].entries[0].decision="BCS chấp thuận";
  const before=JSON.stringify(c);
  const view=workspaceView(c,{...owner,displayName:"Ban cán sự"},5);
  assert.equal(view.club.name,"Nhịp Đội");
  assert.equal(view.club.weeks[0].location,"Phòng sinh hoạt Đội");
  assert.equal(view.me?.name,"Ban điều hành");
  assert.equal(view.identity.name,"Ban điều hành");
  assert.equal(view.me?.loginName,"BCS");
  assert.equal(view.me?.studentId,"BCS001");
  assert.equal(view.club.logs[0].text,"BĐH chấp thuận");
  assert.equal(view.club.logs[0].actor,"Ban điều hành");
  assert.equal(view.club.weeks[0].entries[0].decision,"BĐH chấp thuận");
  assert.equal(JSON.stringify(c),before);
});
