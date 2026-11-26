import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../lib/actions";
import { createClub, type AvailabilityDataset } from "../lib/club";
import { workspaceView } from "../lib/workspace-view";
import { resolveFont, interfaceFonts } from "../lib/interface-fonts";
import { defaultSidebarOrder, resolveSidebarOrder } from "../lib/workspace-navigation";
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
test("Sidebar order persists privately with per-role defaults and rejects unavailable or duplicate tabs", () => {
  const { c, pending } = fixture();
  pending.userId = "sidebar-order-reader";
  const member = { userId: pending.userId, displayName: pending.name, email: "" };
  const adminDefaults = defaultSidebarOrder(true);
  const memberDefaults = defaultSidebarOrder(false);
  const admin = c.members.find(m => m.userId === owner.userId)!;
  const originalLogs = c.logs.length;
  assert.deepEqual(resolveSidebarOrder(true, admin.sidebarOrder), adminDefaults);
  assert.deepEqual(resolveSidebarOrder(false, pending.sidebarOrder), memberDefaults);
  assert.ok(adminDefaults.includes("overview"));
  assert.ok(!memberDefaults.includes("overview"));

  const memberOrder = [...memberDefaults].reverse();
  const adminOrder = [...adminDefaults].reverse();
  applyAction(c, member, "setMySidebarOrder", { order: memberOrder });
  applyAction(c, owner, "setMySidebarOrder", { order: adminOrder });
  for (const order of [null, "members", ["members"], memberOrder.map(tab => tab === "links" ? "overview" : tab),
    memberOrder.map(tab => tab === "links" ? "members" : tab)]) {
    assert.throws(() => applyAction(c, member, "setMySidebarOrder", { order }), /Danh sách tab/);
  }
  assert.throws(() => applyAction(c, owner, "setMySidebarOrder", { memberId: pending.id, order: adminOrder }), /tài khoản của mình/);

  const restored = JSON.parse(JSON.stringify(c)) as typeof c;
  for (const [identity, expected] of [[owner, adminOrder], [member, memberOrder]] as const) {
    const view = workspaceView(restored, identity, 1);
    assert.deepEqual(view.me?.sidebarOrder, expected);
    assert.ok(view.club.members.every(m => m.sidebarOrder === undefined));
  }
  assert.deepEqual(resolveSidebarOrder(true, memberOrder), [...memberOrder, "overview"]);
  assert.deepEqual(resolveSidebarOrder(false, adminOrder), adminOrder.filter(tab => tab !== "overview"));
  assert.deepEqual(resolveSidebarOrder(false, ["members", "overview", "members", "saved-old-tab"]),
    ["members", ...memberDefaults.filter(tab => tab !== "members")]);
  const savedBeforeBulletin = adminOrder.filter(tab => tab !== "bulletin");
  assert.deepEqual(resolveSidebarOrder(true, savedBeforeBulletin), [...savedBeforeBulletin, "bulletin"]);
  assert.equal(c.logs.length, originalLogs);
});
test("Bulletin posts are readable by members, with BĐH-only writes, safe retries and stale edit checks", () => {
  const { c, pending } = fixture();
  pending.userId = "bulletin-reader";
  const reader = { userId: pending.userId, displayName: pending.name, email: "" };
  const post = { id: "bulletin-test-one", title: "  Lịch sinh hoạt  ", content: "  Họp vào thứ Hai\nMang theo tài liệu  " };
  const save = (data: Record<string, unknown>) => applyAction(c, owner, "saveBulletinPost", data);
  assert.throws(() => applyAction(c, reader, "saveBulletinPost", post), /Chỉ BĐH/);
  assert.throws(() => save({ ...post, title: "  " }), /tiêu đề/);
  assert.throws(() => save({ ...post, content: "  " }), /nội dung/);
  assert.equal(c.bulletinPosts, undefined);

  save(post);
  save(post);
  const published = { id: post.id, title: post.title.trim(), content: post.content.trim(), revision: 1 };
  assert.deepEqual(workspaceView(c, reader, 1).club.bulletinPosts, [published]);
  const second = { id: "bulletin-test-two", title: "Nhắc lịch trực", content: "Kiểm tra lịch tuần này" };
  save(second);
  assert.deepEqual(c.bulletinPosts!.map(item => item.id), [second.id, post.id]);

  const edit = { ...published, content: "Chuyển lịch sang thứ Tư\nXem giờ trong Lịch trực C1" };
  assert.throws(() => applyAction(c, reader, "saveBulletinPost", edit), /Chỉ BĐH/);
  save(edit);
  save(edit);
  assert.throws(() => save({ ...published, content: "Không ghi đè được" }), /vừa được cập nhật/);
  assert.deepEqual(workspaceView(c, reader, 2).club.bulletinPosts?.[1], { ...edit, revision: 2 });
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
