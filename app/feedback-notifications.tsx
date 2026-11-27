"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell, CheckCheck, Feather, MessageSquare, MessageSquarePlus, Shield, X } from "lucide-react";
import type { FeedbackNotificationInbox, FeedbackNotificationKind } from "../lib/feedback-notifications";
import { sharingNoticeTitles } from "../lib/sharing-types";
import { MemberName } from "./member-identity";

const inboxPath = "/api/feedback-notifications";
const pollInterval = 30_000;
const notificationClock = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});
const notificationKinds = {
  received: { title: "Feedback mới", icon: MessageSquarePlus },
  reply: { title: "Phản hồi feedback mới", icon: MessageSquare },
  consent: { title: "Đã đồng ý công khai feedback", icon: CheckCheck },
} satisfies Record<FeedbackNotificationKind, { title: string; icon: typeof Bell }>;

export default function FeedbackNotifications({ pending, onOpenPending, onOpenFeedback, onOpenSharing }: {
  pending: number;
  onOpenPending: () => void;
  onOpenFeedback: (feedbackId: string) => void;
  onOpenSharing: (sharingId: string) => void;
}) {
  const panelId = useId();
  const center = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<FeedbackNotificationInbox>();
  const [loadError, setLoadError] = useState(false);
  const notifications = inbox?.notifications ?? [];
  const unread = notifications.filter(notification => !notification.read).length;
  const bellLabel = ["Thông báo", unread ? `${unread} chưa đọc` : "", pending ? `${pending} đăng ký chờ xử lý` : ""]
    .filter(Boolean).join(", ");

  const receiveInbox = useCallback((next: FeedbackNotificationInbox) => {
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
      const next: FeedbackNotificationInbox = await response.json();
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

  async function openNotification(notification: FeedbackNotificationInbox["notifications"][number]) {
    setOpen(false);
    if ("sharingId" in notification) onOpenSharing(notification.sharingId);
    else onOpenFeedback(notification.feedbackId);
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
          return <li key={notification.id}>
            <button type="button" className="notification-item" data-unread={!notification.read}
              onClick={() => void openNotification(notification)}>
              <span className="notification-item-icon"><Icon size={17} aria-hidden="true" /></span>
              <span className="notification-item-copy">
                <strong>{title}</strong>
                <span className="notification-item-meta">
                  {notification.actorId ? <MemberName memberId={notification.actorId} /> : <span>{"sharingId" in notification ? "Nhịp Đội" : "Ẩn danh"}</span>}
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
