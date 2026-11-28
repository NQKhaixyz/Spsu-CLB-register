"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell, CalendarDays, CheckCheck, ClipboardList, Feather, MessageSquare, MessageSquarePlus, Newspaper, Shield, X } from "lucide-react";
import { dateLabel } from "../lib/club";
import type { MemberNotificationInbox, FeedbackNotificationKind } from "../lib/feedback-notifications";
import { sharingNoticeTitles } from "../lib/sharing-types";
import type { WorkspaceNotification } from "../lib/workspace-notifications";
import { MemberName } from "./member-identity";
import { formatScore } from "./scoreboard";

const inboxPath = "/api/feedback-notifications?include=workspace";
const pollInterval = 30_000;
const notificationClock = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});
const notificationKinds = {
  received: { title: "Feedback mới", icon: MessageSquarePlus },
  reply: { title: "Phản hồi feedback mới", icon: MessageSquare },
  consent: { title: "Đã đồng ý công khai feedback", icon: CheckCheck },
  bulletin: { title: "Bài đăng mới", icon: Newspaper },
  score: { title: "Đã cập nhật điểm của bạn", icon: ClipboardList },
  duty: { title: "Bạn có lịch trực C1", icon: CalendarDays },
} satisfies Record<FeedbackNotificationKind | WorkspaceNotification["kind"], { title: string; icon: typeof Bell }>;

function notificationDetail(notification: MemberNotificationInbox["notifications"][number]) {
  if (notification.kind === "bulletin") return notification.postTitle;
  if (notification.kind === "score")
    return `Tuần ${dateLabel(notification.week, true)} · ${notification.change > 0 ? "+" : ""}${formatScore(notification.change)} điểm`;
  if (notification.kind === "duty") {
    const times = [notification.startTime, notification.endTime].filter(Boolean).join(" – ");
    return [`Ca ${notification.period === "am" ? "sáng" : "chiều"}`, dateLabel(notification.date, true), times].filter(Boolean).join(" · ");
  }
}

export default function WorkspaceNotifications({ pending, onOpenPending, onOpenFeedback, onOpenSharing,
  onOpenBulletin, onOpenScoreWeek, onOpenDutyWeek }: {
  pending: number;
  onOpenPending: () => void;
  onOpenFeedback: (feedbackId: string) => void;
  onOpenSharing: (sharingId: string) => void;
  onOpenBulletin: (postId: string) => void;
  onOpenScoreWeek: (week: string) => void;
  onOpenDutyWeek: (week: string) => void;
}) {
  const panelId = useId();
  const center = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<MemberNotificationInbox>();
  const [loadError, setLoadError] = useState(false);
  const notifications = inbox?.notifications ?? [];
  const unread = notifications.filter(notification => !notification.read).length;
  const bellLabel = ["Thông báo", unread ? `${unread} chưa đọc` : "", pending ? `${pending} đăng ký chờ xử lý` : ""]
    .filter(Boolean).join(", ");

  const receiveInbox = useCallback((next: MemberNotificationInbox) => {
    setInbox(current => current && current.revision > next.revision ? current : next);
    setLoadError(false);
  }, []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(inboxPath, { cache: "no-store", signal });
      if (signal?.aborted) return;
      if (response.status === 401) {
        setInbox(undefined);
        setLoadError(false);
        return;
      }
      if (!response.ok) throw new Error("Chưa tải được thông báo");
      const next: MemberNotificationInbox = await response.json();
      if (!signal?.aborted) receiveInbox(next);
    } catch {
      if (!signal?.aborted) setLoadError(true);
    }
  }, [receiveInbox]);

  useEffect(() => {
    const controller = new AbortController();
    const refreshWhileVisible = () => {
      if (!document.hidden) void refresh(controller.signal);
    };
    refreshWhileVisible();
    const timer = window.setInterval(refreshWhileVisible, pollInterval);
    window.addEventListener("focus", refreshWhileVisible);
    document.addEventListener("visibilitychange", refreshWhileVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhileVisible);
      document.removeEventListener("visibilitychange", refreshWhileVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !center.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function openNotification(notification: MemberNotificationInbox["notifications"][number]) {
    setOpen(false);
    if ("sharingId" in notification) onOpenSharing(notification.sharingId);
    else if ("feedbackId" in notification) onOpenFeedback(notification.feedbackId);
    else if (notification.kind === "bulletin") onOpenBulletin(notification.postId);
    else if (notification.kind === "score") onOpenScoreWeek(notification.week);
    else onOpenDutyWeek(notification.week);
    if (notification.read) return;
    try {
      const response = await fetch(inboxPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notification.id }),
      });
      if (response.status === 404 || response.status === 401) {
        void refresh();
        return;
      }
      if (!response.ok) throw new Error("Chưa cập nhật được thông báo");
      receiveInbox(await response.json());
    } catch {
      setLoadError(true);
    }
  }

  return <div className="notification-center" ref={center}>
    <button type="button" ref={trigger} className="icon-button notification-button"
      aria-label={bellLabel} title="Thông báo" aria-expanded={open} aria-controls={panelId}
      onClick={() => {
        if (!open) void refresh();
        setOpen(!open);
      }}>
      <Bell size={19} aria-hidden="true" />
      {unread > 0 ? <span className="notification-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
        : pending > 0 ? <i aria-hidden="true" /> : null}
    </button>
    {open && <section id={panelId} className="notification-panel" aria-label="Danh sách thông báo">
      <div className="notification-heading">
        <h2>Thông báo</h2>
        <button type="button" className="icon-button" aria-label="Đóng danh sách thông báo" onClick={() => {
          setOpen(false);
          trigger.current?.focus();
        }}><X size={18} aria-hidden="true" /></button>
      </div>
      {pending > 0 && <button type="button" className="notification-pending" onClick={() => {
        setOpen(false);
        onOpenPending();
      }}>{pending} đăng ký chờ xử lý</button>}
      {loadError && <div className="notification-status" role="status">
        Chưa đồng bộ được thông báo <button type="button" className="text-button" onClick={() => void refresh()}>Thử lại</button>
      </div>}
      {notifications.length ? <ul className="notification-items">
        {notifications.map(notification => {
          const { title, icon: Icon } = "sharingId" in notification
            ? { title: sharingNoticeTitles[notification.kind], icon: notification.kind.startsWith("cupid") ? Feather : Shield }
            : notificationKinds[notification.kind];
          const detail = notificationDetail(notification);
          return <li key={notification.id}>
            <button type="button" className="notification-item" data-unread={!notification.read}
              onClick={() => void openNotification(notification)}>
              <span className="notification-item-icon"><Icon size={17} aria-hidden="true" /></span>
              <span className="notification-item-copy">
                <strong>{title}</strong>
                {detail && <span className="notification-item-detail">{detail}</span>}
                <span className="notification-item-meta">
                  {notification.actorId ? <MemberName memberId={notification.actorId} /> : <span>{"feedbackId" in notification ? "Ẩn danh" : "Nhịp Đội"}</span>}
                  <time dateTime={new Date(notification.createdAt).toISOString()}>{notificationClock.format(notification.createdAt)}</time>
                </span>
              </span>
              {!notification.read && <span className="notification-unread"><span className="sr-only">Chưa đọc</span></span>}
            </button>
          </li>;
        })}
      </ul> : !loadError && <p className="notification-status">{inbox ? "Chưa có thông báo" : "Đang tải thông báo…"}</p>}
    </section>}
  </div>;
}
