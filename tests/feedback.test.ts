import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, type Identity } from "../lib/actions";
import { createClub, today, uid, type Member } from "../lib/club";
import { applyRequestedFeedbackReset, editMemberFeedback, feedbackActionWindow, feedbackBodyLimit, memberFeedbackView, recallMemberFeedback } from "../lib/feedback";
import { feedbackNotificationsFor, markFeedbackNotificationRead } from "../lib/feedback-notifications";
import { eraseMemberData } from "../lib/member-deletion";
import { workspaceView } from "../lib/workspace-view";

const account = (id: string, role: Member["role"] = "member"): Member => ({
  id, name: id, studentId: id, userId: "account-" + id, role, joined: today(),
  active: true, availability: [], extraDuties: false,
});
const identity = (member: Member): Identity => ({ userId: member.userId!, displayName: member.name, email: "" });

function fixture() {
  const admin = account("admin", "admin");
  const sender = account("sender");
  const first = account("first");
  const second = account("second");
  const reader = account("reader");
  const club = createClub(admin.userId!);
  club.members = [admin, sender, first, second, reader];
  return { club, admin, sender, first, second, reader };
}

test("Feedback sent to multiple members creates one private conversation per recipient", () => {
  const { club, admin, sender, first, second, reader } = fixture();
  const draft = { id: uid(), body: "  Góp ý cho cả hai  ", recipientIds: [second.id, first.id], anonymous: true };
  applyAction(club, identity(sender), "sendFeedback", draft);
  applyAction(club, identity(sender), "sendFeedback", { ...draft, recipientIds: [...draft.recipientIds].reverse() });
  assert.equal(club.memberFeedback?.length, 2);
  assert.equal(club.memberFeedback?.[0].authorId, sender.id);
  assert.equal(club.memberFeedback?.[1].id.startsWith(draft.id), false);
  assert.equal(club.logs.length, 0);
  const signedDraft = { ...draft, id: uid(), anonymous: false, authorId: first.id };
  applyAction(club, identity(sender), "sendFeedback", signedDraft);
  for (const person of [sender, first, second]) {
    const view = workspaceView(club, identity(person), 1);
    assert.equal("memberFeedback" in view.club, false);
    const hidden = view.feedback?.filter(item => item.anonymous) ?? [];
    assert.deepEqual(hidden.map(item => item.recipientIds), person === sender ? [[first.id], [second.id]] : [[person.id]]);
    for (const item of hidden) {
      assert.equal(item.body, "Góp ý cho cả hai");
      assert.equal("authorId" in item, false);
      assert.equal("deliveryId" in item, false);
      assert.equal(item.isPublic, false);
    }
    assert.equal(view.feedback?.find(item => !item.anonymous)?.authorId, sender.id);
  }
  for (const person of [admin, reader]) {
    const view = workspaceView(club, identity(person), 1);
    assert.deepEqual(view.feedback, []);
    assert.equal("memberFeedback" in view.club, false);
  }
  assert.throws(() => applyAction(club, identity(reader), "sendFeedback", draft), /đã được lưu/);
  assert.throws(() => applyAction(club, identity(sender), "sendFeedback", { ...draft, anonymous: false }), /đã được lưu/);
  sender.active = false;
  assert.equal(workspaceView(club, identity(sender), 2).feedback, undefined);
  assert.throws(() => applyAction(club, identity(sender), "sendFeedback", { ...draft, id: uid() }), /ngừng hoạt động/);
});

test("Feedback notifications reach only the other participant in that copy and preserve anonymity", () => {
  const { club, admin, sender, first, second, reader } = fixture();
  const draft = { id: uid(), body: "Góp ý cần xem", recipientIds: [first.id, second.id], anonymous: true };
  const notices = (member: Member) => feedbackNotificationsFor(club, member.id);
  applyAction(club, identity(sender), "sendFeedback", draft);
  applyAction(club, identity(sender), "sendFeedback", draft);
  const [delivered] = notices(first);
  const [secondDelivery] = notices(second);
  assert.equal(delivered.kind, "received");
  assert.equal(notices(first).length, 1);
  assert.equal(delivered.actorId, undefined);
  assert.equal("body" in delivered, false);
  assert.notEqual(secondDelivery.feedbackId, delivered.feedbackId);
  assert.deepEqual(notices(sender), []);
  assert.deepEqual(notices(admin), []);
  assert.equal(markFeedbackNotificationRead(club, second.id, delivered.id), false);
  assert.equal(markFeedbackNotificationRead(club, first.id, delivered.id), true);
  applyAction(club, identity(sender), "sendFeedback", draft);
  assert.equal(notices(first)[0].read, true);

  const feedbackId = delivered.feedbackId;
  const reply = { id: uid(), feedbackId, body: "Cảm ơn góp ý" };
  applyAction(club, identity(first), "replyToFeedback", reply);
  applyAction(club, identity(first), "replyToFeedback", reply);
  assert.deepEqual(notices(sender).map(item => [item.kind, item.actorId, item.feedbackId]), [["reply", first.id, feedbackId]]);
  assert.deepEqual(notices(second), [secondDelivery]);

  const consent = { feedbackId, approved: true, version: 1 };
  applyAction(club, identity(first), "setFeedbackConsent", consent);
  applyAction(club, identity(first), "setFeedbackConsent", consent);
  assert.equal(notices(sender).filter(item => item.kind === "consent").length, 1);
  applyAction(club, identity(sender), "setFeedbackConsent", consent);
  const consentNotice = notices(first).find(item => item.kind === "consent");
  assert.equal(consentNotice?.feedbackId, feedbackId);
  assert.equal(consentNotice?.actorId, undefined);
  assert.equal(memberFeedbackView(club, reader.id)[0].isPublic, true);
  assert.deepEqual(notices(reader), []);
  applyAction(club, identity(sender), "setFeedbackConsent", { ...consent, approved: false });
  assert.equal(notices(first).some(item => item.kind === "consent"), false);
  assert.equal(notices(sender).some(item => item.kind === "consent"), true);

  applyAction(club, identity(sender), "replyToFeedback", { id: uid(), feedbackId, body: "Trả lời ẩn danh" });
  const anonymousReply = notices(first).find(item => item.kind === "reply");
  assert.equal(anonymousReply?.feedbackId, feedbackId);
  assert.equal(anonymousReply?.actorId, undefined);
  assert.equal(notices(sender).some(item => item.kind === "consent"), false);
  applyAction(club, identity(sender), "recallFeedback", { id: feedbackId });
  assert.deepEqual(notices(first), []);
  assert.deepEqual(notices(sender), []);
  assert.deepEqual(notices(second), [secondDelivery]);
});

test("Feedback validates recipients and mode before saving and follows member deletion", () => {
  const { club, admin, sender, first, second, reader } = fixture();
  const draft = { id: uid(), body: "Góp ý", recipientIds: [first.id, second.id], anonymous: true };
  const send = (data: Record<string, unknown>) => applyAction(club, identity(sender), "sendFeedback", data);
  assert.throws(() => send({ ...draft, recipientIds: [] }), /người nhận/);
  assert.throws(() => send({ ...draft, recipientIds: [first.id, "missing-member"] }), /người nhận/);
  assert.throws(() => send({ ...draft, anonymous: undefined }), /hiển thị tên/);
  assert.throws(() => send({ ...draft, body: " ".repeat(8) }), /nội dung|ký tự/);
  assert.throws(() => send({ ...draft, body: "x".repeat(feedbackBodyLimit + 1) }), /ký tự/);
  assert.equal(club.memberFeedback?.length ?? 0, 0);
  send(draft);
  const otherId = uid();
  applyAction(club, identity(reader), "sendFeedback", { ...draft, id: otherId, recipientIds: [first.id], anonymous: false });
  eraseMemberData(club, admin, first);
  assert.equal(club.memberFeedback?.find(item => item.id === otherId), undefined);
  assert.deepEqual(club.memberFeedback?.[0].recipientIds, [second.id]);
  eraseMemberData(club, admin, sender);
  assert.equal(club.memberFeedback?.length, 0);
});

test("Only the sender can delete feedback during the first 24 hours, without reviving it on retry", () => {
  const { club, admin, sender, first, second } = fixture();
  const draft = { id: uid(), body: "Góp ý cần thu hồi", recipientIds: [first.id], anonymous: true };
  applyAction(club, identity(sender), "sendFeedback", draft);
  const stored = club.memberFeedback![0];
  const deadline = stored.createdAt + feedbackActionWindow;
  for (const viewer of [admin, first, second]) {
    const visible = memberFeedbackView(club, viewer.id, deadline - 1)[0];
    assert.equal(visible?.authorId, undefined);
    assert.equal(visible?.canEdit, undefined);
    assert.throws(() => applyAction(club, identity(viewer), "recallFeedback", { id: draft.id }), /Chỉ người gửi/);
  }
  assert.equal(memberFeedbackView(club, sender.id, deadline - 1)[0].actionsUntil, deadline);
  assert.equal(memberFeedbackView(club, sender.id, deadline - 1)[0].canEdit, true);
  assert.equal(memberFeedbackView(club, sender.id, deadline)[0].canEdit, undefined);
  assert.throws(() => recallMemberFeedback(club, sender, draft.id, deadline), /hết 24 giờ/);
  applyAction(club, identity(sender), "recallFeedback", { id: draft.id });
  applyAction(club, identity(sender), "recallFeedback", { id: draft.id });
  applyAction(club, identity(sender), "sendFeedback", draft);
  assert.deepEqual(stored.recipientIds, []);
  assert.equal(stored.body, "");
  assert.equal(club.logs.length, 0);
  for (const viewer of [admin, sender, first, second]) {
    assert.deepEqual(workspaceView(club, identity(viewer), 1).feedback, []);
  }
});

test("The requested feedback reset clears public and anonymous entries once and keeps feedback sent after it", () => {
  const { club, admin, sender, first, second } = fixture();
  const initialMembers = club.members.map(member => member.id);
  for (const anonymous of [true, false]) {
    applyAction(club, identity(sender), "sendFeedback", {
      id: uid(), body: "Góp ý trước khi đặt lại", anonymous, recipientIds: [first.id, second.id],
    });
  }
  const receipt = applyRequestedFeedbackReset(club);
  assert.equal(receipt.visibleBefore, 4);
  assert.equal(club.memberFeedback, undefined);
  assert.deepEqual(club.members.map(member => member.id), initialMembers);
  for (const viewer of [first, second, admin]) {
    const view = workspaceView(club, identity(viewer), 1);
    assert.deepEqual(view.feedback, []);
    assert.equal("feedbackResetReceipt" in view.club, false);
  }
  applyAction(club, identity(sender), "sendFeedback", {
    id: uid(), body: "Góp ý sau khi đặt lại", anonymous: true, recipientIds: [first.id],
  });
  assert.equal(applyRequestedFeedbackReset(club), receipt);
  assert.equal(memberFeedbackView(club, first.id)[0].body, "Góp ý sau khi đặt lại");
});

test("Only the sender can edit feedback and the same recipients see the revised content with anonymity intact", () => {
  const { club, admin, sender, first, second } = fixture();
  const draft = { id: uid(), body: "Góp ý trước khi sửa", recipientIds: [first.id], anonymous: true };
  applyAction(club, identity(sender), "sendFeedback", draft);
  const item = club.memberFeedback![0];
  const createdAt = item.createdAt;
  const newBody = { id: draft.id, body: "  Góp ý đã sửa  ", anonymous: false, recipientIds: [admin.id] };
  for (const viewer of [first, second, admin]) {
    assert.throws(() => applyAction(club, identity(viewer), "editFeedback", newBody), /Chỉ người gửi/);
  }
  assert.throws(() => applyAction(club, identity(sender), "editFeedback", { ...newBody, body: " " }), /ký tự/);
  assert.throws(() => applyAction(club, identity(sender), "editFeedback", { ...newBody, body: "x".repeat(feedbackBodyLimit + 1) }), /ký tự/);
  const late = createdAt + 60 * 60 * 1000;
  editMemberFeedback(club, sender, newBody, late);
  applyAction(club, identity(sender), "sendFeedback", draft);
  applyAction(club, identity(sender), "editFeedback", newBody);
  assert.equal(item.body, "Góp ý đã sửa");
  assert.equal(item.editedAt, late);
  assert.equal(club.logs.length, 0);
  for (const viewer of [first, sender]) {
    const [view] = memberFeedbackView(club, viewer.id, late);
    assert.deepEqual(view.recipientIds, [first.id]);
    assert.equal(view.authorId, undefined);
    assert.equal(view.anonymous, true);
    assert.equal(view.canEdit, viewer.id === sender.id ? true : undefined);
    assert.equal(view.body, "Góp ý đã sửa");
    assert.equal(view.createdAt, createdAt);
    assert.equal(view.editedAt, late);
    assert.equal(view.actionsUntil, createdAt + feedbackActionWindow);
  }
  assert.deepEqual(memberFeedbackView(club, admin.id, late), []);
  const repeat = { id: draft.id, body: "Góp ý đã chỉnh lần nữa" };
  assert.throws(() => applyAction(club, identity(sender), "editFeedback", repeat), /vừa được chỉnh sửa/);
  editMemberFeedback(club, sender, { ...repeat, previousEditedAt: late }, late);
  assert.equal(item.editedAt, late + 1);
});

test("Editing a recalled feedback cannot restore it", () => {
  const { club, sender, first } = fixture();
  const draft = { id: uid(), body: "Góp ý cần thu hồi", recipientIds: [first.id], anonymous: false };
  applyAction(club, identity(sender), "sendFeedback", draft);
  applyAction(club, identity(sender), "recallFeedback", { id: draft.id });
  assert.throws(() => applyAction(club, identity(sender), "editFeedback", { id: draft.id, body: "Nội dung mới" }), /đã được thu hồi/);
  assert.deepEqual(memberFeedbackView(club, first.id), []);
});

test("Only the two participants may publish their own copy of a forwarded feedback", () => {
  const { club, admin, sender, first, second, reader } = fixture();
  const draft = { id: uid(), body: "Nội dung riêng", recipientIds: [first.id, second.id], anonymous: true };
  applyAction(club, identity(sender), "sendFeedback", draft);
  const [toFirst, toSecond] = memberFeedbackView(club, sender.id);
  const reply = { feedbackId: toFirst.id, id: uid(), body: "Phản hồi riêng" };
  const consent = { feedbackId: toFirst.id, approved: true, version: 0 };
  assert.throws(() => applyAction(club, identity(admin), "replyToFeedback", reply), /người gửi và người nhận/);
  assert.throws(() => applyAction(club, identity(second), "setFeedbackConsent", consent), /người gửi và người nhận/);
  applyAction(club, identity(first), "replyToFeedback", reply);
  applyAction(club, identity(first), "replyToFeedback", reply);
  applyAction(club, identity(sender), "replyToFeedback", { ...reply, id: uid(), body: "Trả lời ẩn danh" });
  const [owned] = memberFeedbackView(club, sender.id);
  assert.equal(owned.replies.length, 2);
  assert.equal(owned.replies[0].authorId, first.id);
  assert.equal(owned.replies[1].anonymous, true);
  assert.ok(!("authorId" in owned.replies[1]));
  assert.deepEqual(memberFeedbackView(club, second.id)[0].replies, []);
  assert.throws(() => applyAction(club, identity(first), "setFeedbackConsent", consent), /vừa thay đổi/);
  const agree = { ...consent, version: 2 };
  applyAction(club, identity(sender), "setFeedbackConsent", agree);
  assert.deepEqual(workspaceView(club, identity(admin), 2).feedback, []);
  applyAction(club, identity(first), "setFeedbackConsent", agree);
  const publicCopy = workspaceView(club, identity(reader), 3).feedback!;
  assert.equal(publicCopy.length, 1);
  const [visible] = publicCopy;
  assert.deepEqual(visible.recipientIds, [first.id]);
  assert.equal(visible.isPublic, true);
  assert.equal(visible.authorId, undefined);
  assert.equal(visible.replies[1].authorId, undefined);
  assert.equal(visible.canReply, undefined);
  assert.equal(visible.consent, undefined);
  assert.equal(memberFeedbackView(club, sender.id).find(item => item.id === toSecond.id)?.isPublic, false);
  assert.throws(() => applyAction(club, identity(reader), "replyToFeedback", reply), /người gửi và người nhận/);
  applyAction(club, identity(first), "setFeedbackConsent", { ...agree, approved: false });
  assert.deepEqual(memberFeedbackView(club, reader.id), []);
  applyAction(club, identity(first), "setFeedbackConsent", agree);
  applyAction(club, identity(sender), "editFeedback", { id: toFirst.id, body: "Nội dung đã thay đổi" });
  assert.deepEqual(memberFeedbackView(club, reader.id), []);
  assert.equal(memberFeedbackView(club, first.id)[0].approvalCount, 0);
  assert.throws(() => applyAction(club, identity(first), "setFeedbackConsent", agree), /vừa thay đổi/);
  for (const participant of [sender, first]) {
    applyAction(club, identity(participant), "setFeedbackConsent", { ...agree, version: 3 });
  }
  assert.equal(memberFeedbackView(club, reader.id)[0].isPublic, true);
  applyAction(club, identity(first), "replyToFeedback", { ...reply, id: uid() });
  assert.deepEqual(memberFeedbackView(club, reader.id), []);
  applyAction(club, identity(sender), "recallFeedback", { id: toFirst.id });
  const remaining = memberFeedbackView(club, sender.id);
  assert.deepEqual(remaining.map(item => [item.id, item.body]), [[toSecond.id, draft.body]]);
});

test("Feedback delivered before this change is split into stable conversations on read and write", () => {
  const { club, sender, first, second, reader } = fixture();
  const id = uid();
  club.memberFeedback = [{ id, authorId:sender.id, recipientIds:[first.id, second.id], anonymous:false, body:"Góp ý trước đây", createdAt:Date.now() }];
  const [firstCopy] = memberFeedbackView(club, first.id);
  const [secondCopy] = memberFeedbackView(club, second.id);
  assert.equal(firstCopy.id, id);
  assert.notEqual(secondCopy.id, id);
  assert.deepEqual(firstCopy.recipientIds, [first.id]);
  assert.deepEqual(secondCopy.recipientIds, [second.id]);
  assert.deepEqual(memberFeedbackView(club, reader.id), []);
  applyAction(club, identity(sender), "editFeedback", { id: secondCopy.id, body: "Sửa cho một người" });
  assert.equal(memberFeedbackView(club, first.id)[0].body, "Góp ý trước đây");
  assert.equal(memberFeedbackView(club, second.id)[0].body, "Sửa cho một người");
});

test("Feedback to oneself stays private because it requires agreement from two people", () => {
  const { club, sender, reader } = fixture();
  const draft = { id: uid(), body: "Ghi chú riêng", recipientIds: [sender.id], anonymous: false };
  applyAction(club, identity(sender), "sendFeedback", draft);
  assert.throws(() => applyAction(club, identity(sender), "setFeedbackConsent", {
    feedbackId: draft.id, approved: true, version: 0,
  }), /hai người khác nhau/);
  const [view] = memberFeedbackView(club, sender.id);
  assert.equal(view.consent, undefined);
  assert.equal(view.isPublic, false);
  assert.deepEqual(memberFeedbackView(club, reader.id), []);
});

test("After 24 hours a feedback conversation is read only for every participant", () => {
  const { club, sender, first } = fixture();
  const draft = { id: uid(), body: "Góp ý sau một ngày", recipientIds: [first.id], anonymous: false };
  applyAction(club, identity(sender), "sendFeedback", draft);
  const entry = club.memberFeedback![0];
  const approve = { feedbackId: draft.id, approved: true, version: 0 };
  applyAction(club, identity(sender), "setFeedbackConsent", approve);
  applyAction(club, identity(first), "setFeedbackConsent", approve);
  entry.createdAt -= feedbackActionWindow;
  const edits = [
    [sender, "editFeedback", { id: draft.id, body: "Sửa" }],
    [sender, "recallFeedback", { id: draft.id }],
    [first, "replyToFeedback", { feedbackId: draft.id, id: uid(), body: "Phản hồi" }],
    [first, "setFeedbackConsent", { ...approve, approved: false }],
  ] as const;
  for (const [actor, action, data] of edits) {
    assert.throws(() => applyAction(club, identity(actor), action, data), /hết 24 giờ/);
    const [view] = memberFeedbackView(club, actor.id);
    assert.equal(view.canEdit, undefined);
    assert.equal(view.canReply, undefined);
    assert.equal(view.consent, undefined);
    assert.equal(view.isPublic, true);
  }
});
