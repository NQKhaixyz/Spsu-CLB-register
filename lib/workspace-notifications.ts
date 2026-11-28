import { bulletinAuthorId, isBulletinPublished, type BulletinPost } from "./bulletin";
import { isRosterMember, isShiftPublished, today, weekId, type Club, type Member } from "./club";
import {
  canReceiveDirectNotice, isNoticeId, noticeBodyLimit, noticeTitleLimit,
  type ActivityNoticeDraft, type WorkspaceNotification,
} from "./notification-types";

export function workspaceNotificationsFor(club: Club, viewerId: string, now = Date.now()): WorkspaceNotification[] {
  const viewer = club.members.find(member => member.id === viewerId && member.active);
  if (!viewer) return [];
  const notifications: WorkspaceNotification[] = [];
  for (const post of club.bulletinPosts ?? []) {
    const notice = post.notice;
    if (!notice || notice.appearsAt > now || !isBulletinPublished(post, now) ||
      viewer.joined > today(new Date(notice.appearsAt))) continue;
    const actorId = bulletinAuthorId(club, post);
    if (actorId === viewerId) continue;
    const confirmed = notice.confirmedBy?.includes(viewerId) || post.likedBy?.includes(viewerId) ? true : undefined;
    notifications.push({ id: notice.id, createdAt: notice.appearsAt, actorId, confirmed,
      read: confirmed || notice.readBy?.includes(viewerId) ? true : undefined, kind: "bulletin", postId: post.id, postTitle: post.title });
  }
  for (const { recipients, readBy, audience: _audience, ...notice } of club.directNotices ?? []) {
    if (!recipients.includes(viewerId)) continue;
    notifications.push({ ...notice, kind: "direct", read: readBy?.includes(viewerId) ? true : undefined });
  }
  if (!isRosterMember(viewer)) return notifications;
  for (const { memberId, ...notice } of club.activityNotices ?? []) {
    if (memberId !== viewerId) continue;
    if (notice.kind !== "duty") {
      notifications.push(notice);
      continue;
    }
    const { month, hours, ...details } = notice;
    const schedule = club.schedules.find(item => item.month === month);
    const shift = schedule?.shifts.find(item => item.id === details.shiftId);
    // Earlier assignments did not store a time snapshot.
    const entry = hours ?? (schedule && shift && !shift.cancelled && isShiftPublished(schedule, shift) &&
      shift.assignments.some(item => item.memberId === viewerId && item.result !== "cancelled") ? shift : undefined);
    if (!entry) continue;
    const { date, period, startTime, endTime } = entry;
    notifications.push({ ...details, week: weekId(date), date, period, startTime, endTime });
  }
  return notifications;
}

function withReader(readBy: string[] | undefined, memberId: string) {
  return readBy?.includes(memberId) ? readBy : [...(readBy ?? []), memberId];
}

export function confirmBulletinNotice(post: BulletinPost, memberId: string) {
  if (!post.notice) return;
  post.notice.confirmedBy = withReader(post.notice.confirmedBy, memberId);
  post.notice.readBy = withReader(post.notice.readBy, memberId);
}

export function readWorkspaceNotifications(club: Club, viewerId: string, ids: ReadonlySet<string>) {
  for (const { notice } of club.bulletinPosts ?? []) {
    if (notice && ids.has(notice.id)) notice.readBy = withReader(notice.readBy, viewerId);
  }
  for (const notice of club.directNotices ?? []) {
    if (ids.has(notice.id) && notice.recipients.includes(viewerId)) notice.readBy = withReader(notice.readBy, viewerId);
  }
  for (const notice of club.activityNotices ?? []) {
    if (ids.has(notice.id) && notice.memberId === viewerId) notice.read = true;
  }
}

export function markWorkspaceNotificationRead(club: Club, viewerId: string, id: string, now = Date.now()) {
  if (!workspaceNotificationsFor(club, viewerId, now).some(item => item.id === id)) return false;
  readWorkspaceNotifications(club, viewerId, new Set([id]));
  return true;
}

export function appendActivityNotices(club: Club, actorId: string, items: ActivityNoticeDraft[], createdAt: number) {
  if (!items.length) return;
  (club.activityNotices ??= []).unshift(...items.map(item => ({ ...item, id: crypto.randomUUID(), actorId, createdAt })));
}

export function sendDirectNotice(club: Club, admin: Member, data: Record<string, unknown>, createdAt = Date.now()) {
  if (!admin.active || admin.role !== "admin") throw new Error("Chỉ BĐH được gửi thông báo trực tiếp");
  if (!isNoticeId(data.id)) throw new Error("Mã thông báo không hợp lệ");
  const id = data.id.toLowerCase();
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const body = typeof data.body === "string" ? data.body.trim() : "";
  const audience = data.audience;
  if (!title || title.length > noticeTitleLimit || !body || body.length > noticeBodyLimit)
    throw new Error("Nhập tiêu đề và nội dung trong giới hạn cho phép");
  if (audience !== "all" && audience !== "members") throw new Error("Chọn người nhận thông báo");
  const requested: unknown[] = audience === "members" && Array.isArray(data.recipientIds) ? data.recipientIds : [];
  if (audience === "members" && (!requested.length || requested.some(id => typeof id !== "string")))
    throw new Error("Chọn ít nhất một người nhận hợp lệ");
  const recipientIds = [...new Set(requested as string[])].sort();
  const existing = club.directNotices?.find(item => item.id === id);
  if (existing) {
    const sameRecipients = audience === "all" || existing.recipients.every(memberId => recipientIds.includes(memberId)) &&
      existing.recipients.length === recipientIds.length;
    if (existing.actorId !== admin.id || existing.title !== title || existing.body !== body || existing.audience !== audience || !sameRecipients)
      throw new Error("Thông báo này đã được lưu với nội dung khác");
    return;
  }
  const available = new Set(club.members.filter(member => canReceiveDirectNotice(member, admin.id)).map(member => member.id));
  const recipients = audience === "all" ? [...available] : recipientIds;
  if (!recipients.length || recipients.some(memberId => !available.has(memberId)))
    throw new Error("Người nhận phải là tài khoản đang hoạt động");
  (club.directNotices ??= []).push({ id, actorId: admin.id, title, body, audience, recipients, createdAt });
}
