import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, type Identity } from "../lib/actions";
import { createClub, today, uid, type Member } from "../lib/club";
import { feedbackBodyLimit } from "../lib/feedback";
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

test("Feedback for multiple members is published once and anonymized even in the BĐH view", () => {
  const { club, admin, sender, first, second, reader } = fixture();
  const draft = { id: uid(), body: "  Góp ý cho cả hai  ", recipientIds: [second.id, first.id], anonymous: true };
  applyAction(club, identity(sender), "sendFeedback", draft);
  applyAction(club, identity(sender), "sendFeedback", { ...draft, recipientIds: [...draft.recipientIds].reverse() });
  assert.equal(club.memberFeedback?.length, 1);
  assert.equal(club.memberFeedback?.[0].authorId, sender.id);
  assert.equal(club.logs.length, 0);
  const publicDraft = { ...draft, id: uid(), anonymous: false, authorId: first.id };
  applyAction(club, identity(sender), "sendFeedback", publicDraft);
  for (const person of [admin, sender, first, second, reader]) {
    const view = workspaceView(club, identity(person), 1);
    assert.equal("memberFeedback" in view.club, false);
    const hidden = view.feedback?.find(item => item.id === draft.id);
    assert.ok(hidden);
    assert.deepEqual(hidden.recipientIds, [first.id, second.id]);
    assert.equal(hidden.body, "Góp ý cho cả hai");
    assert.equal("authorId" in hidden, false);
    assert.equal(view.feedback?.find(item => item.id === publicDraft.id)?.authorId, sender.id);
  }
  assert.throws(() => applyAction(club, identity(reader), "sendFeedback", draft), /đã được lưu/);
  assert.throws(() => applyAction(club, identity(sender), "sendFeedback", { ...draft, anonymous: false }), /đã được lưu/);
  sender.active = false;
  assert.equal(workspaceView(club, identity(sender), 2).feedback, undefined);
  assert.throws(() => applyAction(club, identity(sender), "sendFeedback", { ...draft, id: uid() }), /ngừng hoạt động/);
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
