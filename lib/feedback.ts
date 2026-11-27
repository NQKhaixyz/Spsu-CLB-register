import type { Club, Member } from "./club";

export const feedbackBodyLimit = 2000;
export const feedbackRecallWindow = 30 * 60 * 1000;
const feedbackId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type FeedbackDraft = {
  id: string;
  recipientIds: string[];
  anonymous: boolean;
  body: string;
};

export type StoredFeedback = FeedbackDraft & { authorId: string; createdAt: number; recalledAt?: number };
export type FeedbackView = FeedbackDraft & { authorId?: string; createdAt: number; recallUntil?: number };
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

export function sendMemberFeedback(club: Club, author: Member, data: Record<string, unknown>) {
  const { id, anonymous } = data;
  if (typeof id !== "string" || !feedbackId.test(id)) {
    throw new Error("Mã feedback không hợp lệ. Mở lại phần gửi feedback rồi thử lại");
  }
  if (typeof anonymous !== "boolean") throw new Error("Chọn cách hiển thị tên người gửi");
  const body = typeof data.body === "string" ? data.body.trim() : "";
  if (!body || body.length > feedbackBodyLimit) {
    throw new Error(`Nhập feedback từ 1 đến ${feedbackBodyLimit.toLocaleString("vi-VN")} ký tự`);
  }
  const roster = new Set(club.members.map(member => member.id));
  const targets = data.recipientIds;
  if (!Array.isArray(targets) || !targets.length || targets.length > roster.size ||
    targets.some(target => typeof target !== "string" || !roster.has(target))) {
    throw new Error("Chọn ít nhất một người nhận còn trong danh sách thành viên");
  }
  const recipientIds = [...new Set<string>(targets)].sort();
  const existing = club.memberFeedback?.find(item => item.id === id);
  if (existing) {
    if (existing.recalledAt !== undefined && existing.authorId === author.id) return;
    const sameRecipients = existing.recipientIds.length === recipientIds.length &&
      existing.recipientIds.every((recipient, index) => recipient === recipientIds[index]);
    if (existing.authorId !== author.id || existing.anonymous !== anonymous || existing.body !== body || !sameRecipients) {
      throw new Error("Feedback này đã được lưu với thông tin khác. Mở mục Feedback để kiểm tra");
    }
    return;
  }
  (club.memberFeedback ??= []).unshift({ id, recipientIds, anonymous, body, authorId: author.id, createdAt: Date.now() });
}

export function recallMemberFeedback(club: Club, author: Member, id: unknown, now = Date.now()) {
  const item = club.memberFeedback?.find(entry => entry.id === id && entry.authorId === author.id);
  if (!item) throw new Error("Chỉ người gửi mới có thể thu hồi feedback của mình");
  if (item.recalledAt !== undefined) return;
  if (now >= item.createdAt + feedbackRecallWindow) throw new Error("Đã hết 30 phút để thu hồi feedback");
  // Keep the request ID so retrying the send cannot restore recalled content.
  item.body = "";
  item.recipientIds = [];
  item.recalledAt = now;
}

export function memberFeedbackView(club: Club, viewerId: string, now = Date.now()): FeedbackView[] {
  const members = new Set(club.members.map(member => member.id));
  return (club.memberFeedback ?? []).flatMap(item => {
    if (item.recalledAt !== undefined) return [];
    const recipientIds = item.recipientIds.filter(id => members.has(id));
    if (!recipientIds.length || !members.has(item.authorId)) return [];
    const { id, body, anonymous, createdAt } = item;
    const recallUntil = createdAt + feedbackRecallWindow;
    return [{ id, recipientIds, body, anonymous, createdAt,
      ...(anonymous ? {} : { authorId: item.authorId }),
      ...(viewerId === item.authorId && now < recallUntil ? { recallUntil } : {}),
    }];
  });
}

export function eraseFeedbackMembers(club: Club, removed: ReadonlySet<string>) {
  if (!club.memberFeedback || !removed.size) return;
  club.memberFeedback = club.memberFeedback.flatMap(item => {
    if (removed.has(item.authorId)) return [];
    if (item.recalledAt !== undefined) return [item];
    const recipientIds = item.recipientIds.filter(id => !removed.has(id));
    return recipientIds.length ? [{ ...item, recipientIds }] : [];
  });
}
