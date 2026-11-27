import type { Club, Member } from "./club";
import { addFeedbackNotification, clearFeedbackConsentNotifications, type StoredFeedbackNotification } from "./feedback-notifications";

export const feedbackBodyLimit = 2000;
export const feedbackActionWindow = 24 * 60 * 60 * 1000;
const feedbackId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type FeedbackDraft = {
  id: string;
  recipientIds: string[];
  anonymous: boolean;
  body: string;
};

export type FeedbackEdit = { id: string; body: string; previousEditedAt?: number };
export type FeedbackReplyDraft = { feedbackId: string; id: string; body: string };
export type FeedbackConsentDraft = { feedbackId: string; approved: boolean; version: number };
type FeedbackReply = { id: string; memberId: string; body: string; createdAt: number };
export type FeedbackReplyView = Omit<FeedbackReply, "memberId"> & { anonymous: boolean; authorId?: string };
export type StoredFeedback = FeedbackDraft & {
  authorId: string;
  createdAt: number;
  editedAt?: number;
  recalledAt?: number;
  replies?: FeedbackReply[];
  approvedBy?: string[];
  notifications?: StoredFeedbackNotification[];
  version?: number;
  deliveryId?: string;
};
export type FeedbackView = FeedbackDraft & {
  authorId?: string;
  createdAt: number;
  editedAt?: number;
  actionsUntil: number;
  isPublic: boolean;
  replies: FeedbackReplyView[];
  canEdit?: true;
  canReply?: true;
  consent?: { approved: boolean; version: number };
  approvalCount?: number;
  approvalTotal?: number;
};
export type FeedbackResetReceipt = { id: string; at: number; removed: number; visibleBefore: number };
export const requestedFeedbackResetId = "reset-feedback-2026-11-27";

export function applyRequestedFeedbackReset(club: Club, now = Date.now()): FeedbackResetReceipt {
  if (club.feedbackResetReceipt?.id === requestedFeedbackResetId) return club.feedbackResetReceipt;
  const entries = club.memberFeedback ?? [];
  const receipt = {
    id: requestedFeedbackResetId, at: now, removed: entries.length,
    visibleBefore: entries.filter(entry => entry.recalledAt === undefined).length,
  };
  delete club.memberFeedback;
  club.feedbackResetReceipt = receipt;
  club.logs.unshift({ at: new Date(now).toISOString(), actor: "Chủ quản trị",
    text: `Đặt lại dữ liệu Feedback · Đã xóa ${receipt.visibleBefore} feedback hiển thị` });
  if (club.logs.length > 2000) club.logs.length = 2000;
  return receipt;
}

function feedbackBody(value: unknown) {
  const body = typeof value === "string" ? value.trim() : "";
  if (!body || body.length > feedbackBodyLimit) {
    throw new Error(`Nhập feedback từ 1 đến ${feedbackBodyLimit.toLocaleString("vi-VN")} ký tự`);
  }
  return body;
}

function splitFeedback(item: StoredFeedback): StoredFeedback[] {
  if (item.recipientIds.length < 2) return [item];
  return item.recipientIds.map((recipientId, index) => ({
    ...item,
    id: index === 0 ? item.id : `${item.id}:${recipientId}`,
    recipientIds: [recipientId],
    deliveryId: item.deliveryId ?? item.id,
    approvedBy: undefined,
    notifications: undefined,
    replies: item.replies?.filter(reply => reply.memberId === item.authorId || reply.memberId === recipientId),
  }));
}

function storedFeedbackConversations(club: Club) {
  if (club.memberFeedback?.some(item => item.recipientIds.length > 1)) {
    club.memberFeedback = club.memberFeedback.flatMap(splitFeedback);
  }
  return club.memberFeedback ?? [];
}

export function sendMemberFeedback(club: Club, author: Member, data: Record<string, unknown>) {
  const { id, anonymous } = data;
  if (typeof id !== "string" || !feedbackId.test(id)) {
    throw new Error("Mã feedback không hợp lệ. Mở lại phần gửi feedback rồi thử lại");
  }
  if (typeof anonymous !== "boolean") throw new Error("Chọn cách hiển thị tên người gửi");
  const body = feedbackBody(data.body);
  const roster = new Set(club.members.map(member => member.id));
  const targets = data.recipientIds;
  if (!Array.isArray(targets) || !targets.length || targets.length > roster.size ||
    targets.some(target => typeof target !== "string" || !roster.has(target))) {
    throw new Error("Chọn ít nhất một người nhận còn trong danh sách thành viên");
  }
  const recipientIds = [...new Set<string>(targets)].sort();
  const existing = storedFeedbackConversations(club).filter(item => (item.deliveryId ?? item.id) === id);
  if (existing.length) {
    if (existing.length !== recipientIds.length || existing.some(item =>
      item.authorId !== author.id || item.anonymous !== anonymous ||
      (item.recalledAt === undefined && (!recipientIds.includes(item.recipientIds[0]) ||
        (item.editedAt === undefined && item.body !== body))))) {
      throw new Error("Feedback này đã được lưu với thông tin khác. Mở mục Feedback để kiểm tra");
    }
    return;
  }
  const createdAt = Date.now();
  const conversations = recipientIds.map((recipientId, index) => {
    const item: StoredFeedback = {
      id: index === 0 ? id : crypto.randomUUID(), deliveryId: id,
      recipientIds: [recipientId], anonymous, body, authorId: author.id, createdAt,
    };
    addFeedbackNotification(item, author.id, "received", createdAt);
    return item;
  });
  (club.memberFeedback ??= []).unshift(...conversations);
}

export function editMemberFeedback(club: Club, author: Member, data: Record<string, unknown>, now = Date.now()) {
  const item = storedFeedbackConversations(club).find(entry => entry.id === data.id && entry.authorId === author.id);
  if (!item) throw new Error("Chỉ người gửi mới có thể sửa feedback của mình");
  if (item.recalledAt !== undefined) throw new Error("Feedback này đã được thu hồi");
  requireOpenFeedback(item, now);
  const body = feedbackBody(data.body);
  if (item.body === body) return;
  if (item.editedAt !== data.previousEditedAt) {
    throw new Error("Feedback vừa được chỉnh sửa. Cập nhật dữ liệu rồi mở lại để sửa");
  }
  item.body = body;
  item.editedAt = Math.max(now, (item.editedAt ?? item.createdAt) + 1);
  resetFeedbackConsent(item);
}

export function recallMemberFeedback(club: Club, author: Member, id: unknown, now = Date.now()) {
  const item = storedFeedbackConversations(club).find(entry => entry.id === id && entry.authorId === author.id);
  if (!item) throw new Error("Chỉ người gửi mới có thể thu hồi feedback của mình");
  if (item.recalledAt !== undefined) return;
  requireOpenFeedback(item, now);
  // Keep the request ID so retrying the send cannot restore recalled content.
  item.body = "";
  item.recipientIds = [];
  delete item.replies;
  delete item.approvedBy;
  delete item.notifications;
  item.recalledAt = now;
}

function requireOpenFeedback(item: StoredFeedback, now: number) {
  if (now >= item.createdAt + feedbackActionWindow) throw new Error("Đã hết 24 giờ để thao tác với feedback này");
}

function resetFeedbackConsent(item: StoredFeedback) {
  delete item.approvedBy;
  clearFeedbackConsentNotifications(item);
  item.version = (item.version ?? 0) + 1;
}

export function replyToFeedback(club: Club, member: Member, data: Record<string, unknown>, now = Date.now()) {
  const item = storedFeedbackConversations(club).find(entry => entry.id === data.feedbackId && entry.recalledAt === undefined);
  if (!item || (item.authorId !== member.id && !item.recipientIds.includes(member.id))) {
    throw new Error("Chỉ người gửi và người nhận có thể phản hồi trong cuộc trao đổi");
  }
  requireOpenFeedback(item, now);
  const { id } = data;
  if (typeof id !== "string" || !feedbackId.test(id)) throw new Error("Mã phản hồi không hợp lệ");
  const body = feedbackBody(data.body);
  const previous = item.replies?.find(reply => reply.id === id);
  if (previous) {
    if (previous.memberId !== member.id || previous.body !== body) throw new Error("Phản hồi đã được lưu với nội dung khác");
    return;
  }
  (item.replies ??= []).push({ id, memberId: member.id, body, createdAt: now });
  resetFeedbackConsent(item);
  addFeedbackNotification(item, member.id, "reply", now);
}

export function setFeedbackConsent(club: Club, member: Member, data: Record<string, unknown>, now = Date.now()) {
  const item = storedFeedbackConversations(club).find(entry => entry.id === data.feedbackId && entry.recalledAt === undefined);
  if (!item || (item.authorId !== member.id && !item.recipientIds.includes(member.id))) {
    throw new Error("Chỉ người gửi và người nhận mới được quyết định công khai feedback");
  }
  requireOpenFeedback(item, now);
  if (item.recipientIds[0] === item.authorId) throw new Error("Cần hai người khác nhau để công khai feedback");
  if (typeof data.approved !== "boolean") throw new Error("Lựa chọn công khai không hợp lệ");
  if (data.approved && data.version !== (item.version ?? 0)) {
    throw new Error("Cuộc trao đổi vừa thay đổi. Cập nhật dữ liệu rồi xem lại trước khi đồng ý công khai");
  }
  const approvals = new Set(item.approvedBy);
  if (approvals.has(member.id) === data.approved) return;
  if (data.approved) {
    approvals.add(member.id);
    addFeedbackNotification(item, member.id, "consent", now);
  } else {
    approvals.delete(member.id);
    clearFeedbackConsentNotifications(item, member.id);
  }
  item.approvedBy = [...approvals];
}

export function memberFeedbackView(club: Club, viewerId: string, now = Date.now()): FeedbackView[] {
  const members = new Set(club.members.map(member => member.id));
  return (club.memberFeedback ?? []).flatMap(splitFeedback).flatMap(item => {
    if (item.recalledAt !== undefined) return [];
    const [recipientId] = item.recipientIds;
    if (!members.has(recipientId) || !members.has(item.authorId)) return [];
    const own = viewerId === item.authorId;
    const receiving = recipientId === viewerId;
    const participant = own || receiving;
    const approvals = new Set(item.approvedBy);
    const canPublish = item.authorId !== recipientId;
    const approvalCount = Number(approvals.has(item.authorId)) + Number(approvals.has(recipientId));
    const isPublic = canPublish && approvalCount === 2;
    if (!participant && !isPublic) return [];
    const { id, body, anonymous, createdAt, editedAt } = item;
    const actionsUntil = createdAt + feedbackActionWindow;
    const canAct = now < actionsUntil;
    const replies = (item.replies ?? []).filter(reply => members.has(reply.memberId)).map(({ memberId, ...reply }) => {
      const hidden = anonymous && memberId === item.authorId;
      return { ...reply, anonymous: hidden, ...(hidden ? {} : { authorId: memberId }) };
    });
    return [{ id, recipientIds: [recipientId], body, anonymous, createdAt, editedAt, actionsUntil, isPublic, replies,
      ...(anonymous ? {} : { authorId: item.authorId }),
      ...(own && canAct ? { canEdit: true as const } : {}),
      ...(participant && canPublish ? { approvalCount, approvalTotal: 2 } : {}),
      ...(participant && canAct ? { canReply: true as const } : {}),
      ...(participant && canAct && canPublish ? {
        consent: { approved: approvals.has(viewerId), version: item.version ?? 0 },
      } : {}),
    }];
  });
}

export function eraseFeedbackMembers(club: Club, removed: ReadonlySet<string>) {
  if (!club.memberFeedback || !removed.size) return;
  club.memberFeedback = storedFeedbackConversations(club).filter(item =>
    !removed.has(item.authorId) && !item.recipientIds.some(id => removed.has(id)));
}
