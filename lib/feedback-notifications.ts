import type { Club } from "./club";
import type { StoredFeedback } from "./feedback";
import type { SharingNotice } from "./sharing-types";
import type { WorkspaceNotification } from "./notification-types";
import { readWorkspaceNotifications, workspaceNotificationsFor } from "./workspace-notifications";

export type FeedbackNotificationKind = "received" | "reply" | "consent";
export type StoredFeedbackNotification = {
  id: string;
  memberId: string;
  kind: FeedbackNotificationKind;
  createdAt: number;
  read?: true;
};
type FeedbackNotification = Omit<StoredFeedbackNotification, "memberId"> & {
  feedbackId: string;
  actorId?: string;
};
export type InboxNotification = FeedbackNotification | Omit<SharingNotice, "memberId"> | WorkspaceNotification;
export type MemberNotificationInbox = { revision: number; notifications: InboxNotification[] };
export type NotificationFormat = "feedback" | "workspace" | "all";

export function memberNotificationsFor(club: Club, viewerId: string, includeWorkspace = true, now = Date.now()): InboxNotification[] {
  return [...feedbackNotificationsFor(club, viewerId),
    ...(club.sharing?.notices ?? []).flatMap(({ memberId, ...notice }) => memberId === viewerId ? [notice] : []),
    ...(includeWorkspace ? workspaceNotificationsFor(club, viewerId, now) : []),
  ].sort((a, b) => b.createdAt - a.createdAt);
}

export function visibleMemberNotifications(club: Club, viewerId: string, format: NotificationFormat, now = Date.now()) {
  const notices = memberNotificationsFor(club, viewerId, format !== "feedback", now);
  return format === "workspace" ? notices.filter(item => item.kind !== "activity" && item.kind !== "direct" &&
    (item.kind !== "duty" || item.dutyChange === undefined || item.dutyChange === "assigned")) : notices;
}

export function markMemberNotificationsRead(club: Club, viewerId: string, selection: ReadonlySet<string> | "all", format: NotificationFormat, now = Date.now()) {
  const selected = new Set(visibleMemberNotifications(club, viewerId, format, now)
    .filter(item => item.createdAt <= now && (selection === "all" || selection.has(item.id))).map(item => item.id));
  if (!selected.size) return 0;
  for (const item of club.memberFeedback ?? []) {
    for (const notice of item.notifications ?? []) {
      if (notice.memberId === viewerId && selected.has(notice.id)) notice.read = true;
    }
  }
  for (const notice of club.sharing?.notices ?? []) {
    if (notice.memberId === viewerId && selected.has(notice.id)) notice.read = true;
  }
  readWorkspaceNotifications(club, viewerId, selected);
  return selected.size;
}

export function markMemberNotificationRead(club: Club, viewerId: string, id: string, includeWorkspace = true) {
  return markMemberNotificationsRead(club, viewerId, new Set([id]), includeWorkspace ? "all" : "feedback") > 0;
}

function otherParticipant(item: StoredFeedback, memberId: string) {
  const [recipientId] = item.recipientIds;
  if (item.recalledAt !== undefined || item.recipientIds.length !== 1 || recipientId === item.authorId) return;
  if (memberId === item.authorId) return recipientId;
  if (memberId === recipientId) return item.authorId;
}

export function addFeedbackNotification(item: StoredFeedback, actorId: string, kind: FeedbackNotificationKind, createdAt: number) {
  const memberId = otherParticipant(item, actorId);
  if (!memberId) return;
  (item.notifications ??= []).push({ id: crypto.randomUUID(), memberId, kind, createdAt });
}

export function clearFeedbackConsentNotifications(item: StoredFeedback, actorId?: string) {
  if (!item.notifications) return;
  const memberId = actorId === undefined ? undefined : otherParticipant(item, actorId);
  item.notifications = item.notifications.filter(notification =>
    notification.kind !== "consent" || (actorId !== undefined && notification.memberId !== memberId));
}

export function feedbackNotificationsFor(club: Club, viewerId: string) {
  const members = new Set(club.members.map(member => member.id));
  const notifications: FeedbackNotification[] = [];
  for (const item of club.memberFeedback ?? []) {
    if (!item.notifications?.length) continue;
    const actorId = otherParticipant(item, viewerId);
    if (!actorId || !members.has(actorId)) continue;
    for (const { memberId, ...notification } of item.notifications) {
      if (memberId !== viewerId) continue;
      notifications.push({ ...notification, feedbackId: item.id,
        ...(actorId === item.authorId && item.anonymous ? {} : { actorId }),
      });
    }
  }
  return notifications.sort((a, b) => b.createdAt - a.createdAt);
}

export function markFeedbackNotificationRead(club: Club, viewerId: string, id: string) {
  for (const item of club.memberFeedback ?? []) {
    if (!item.notifications?.length) continue;
    if (!otherParticipant(item, viewerId)) continue;
    const notification = item.notifications.find(entry => entry.id === id && entry.memberId === viewerId);
    if (notification) {
      notification.read = true;
      return true;
    }
  }
  return false;
}
