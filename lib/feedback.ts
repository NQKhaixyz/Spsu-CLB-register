import type { Club, Member } from "./club";

export const feedbackBodyLimit = 2000;

export type FeedbackDraft = {
  id: string;
  recipientIds: string[];
  anonymous: boolean;
  body: string;
};

export type StoredFeedback = FeedbackDraft & { authorId: string; createdAt: number };
export type FeedbackView = FeedbackDraft & { authorId?: string; createdAt: number };

export function sendMemberFeedback(club: Club, author: Member, data: Record<string, unknown>) {
  const { id, anonymous } = data;
  if (typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
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
    const sameRecipients = existing.recipientIds.length === recipientIds.length &&
      existing.recipientIds.every((recipient, index) => recipient === recipientIds[index]);
    if (existing.authorId !== author.id || existing.anonymous !== anonymous || existing.body !== body || !sameRecipients) {
      throw new Error("Feedback này đã được lưu với thông tin khác. Mở mục Feedback để kiểm tra");
    }
    return;
  }
  (club.memberFeedback ??= []).unshift({ id, recipientIds, anonymous, body, authorId: author.id, createdAt: Date.now() });
}

export function memberFeedbackView(club: Club): FeedbackView[] {
  const members = new Set(club.members.map(member => member.id));
  return (club.memberFeedback ?? []).flatMap(item => {
    const recipientIds = item.recipientIds.filter(id => members.has(id));
    if (!recipientIds.length || !members.has(item.authorId)) return [];
    const { id, body, anonymous, createdAt } = item;
    return [{ id, recipientIds, body, anonymous, createdAt, ...(anonymous ? {} : { authorId: item.authorId }) }];
  });
}

export function eraseFeedbackMembers(club: Club, removed: ReadonlySet<string>) {
  if (!club.memberFeedback || !removed.size) return;
  club.memberFeedback = club.memberFeedback.flatMap(item => {
    if (removed.has(item.authorId)) return [];
    const recipientIds = item.recipientIds.filter(id => !removed.has(id));
    return recipientIds.length ? [{ ...item, recipientIds }] : [];
  });
}
