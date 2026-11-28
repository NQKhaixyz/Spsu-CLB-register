"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bell, CalendarDays, Check, CheckCheck, ClipboardList, Feather, Mail, MessageSquare, MessageSquarePlus, Newspaper, Plus, Shield, X } from "lucide-react";
import { dateLabel } from "../lib/club";
import type { InboxNotification } from "../lib/feedback-notifications";
import { sharingNoticeTitles } from "../lib/sharing-types";
import { MemberName } from "./member-identity";
import { formatScore } from "./scoreboard";
import type { WorkspaceNotificationState } from "./use-workspace-notifications";

export const notificationClock = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});

const feedbackCopy = {
  received: { title: "Feedback mới", body: "Bạn có một cuộc trao đổi mới", icon: MessageSquarePlus },
  reply: { title: "Phản hồi feedback mới", body: "Cuộc trao đổi có tin nhắn mới", icon: MessageSquare },
  consent: { title: "Đã đồng ý công khai feedback", body: "Quyền hiển thị cuộc trao đổi đã cập nhật", icon: CheckCheck },
};

export function notificationCopy(notice: InboxNotification) {
  if ("sharingId" in notice) return {
    title: sharingNoticeTitles[notice.kind],
    body: notice.kind.startsWith("cupid") ? "Cập nhật Cupid trong Góc của tôi" : "Cập nhật Bang hội trong Góc của tôi",
    icon: notice.kind.startsWith("cupid") ? Feather : Shield,
  };
  if ("feedbackId" in notice) return feedbackCopy[notice.kind];
  switch (notice.kind) {
    case "direct": return { title: notice.title, body: notice.body, icon: Mail };
    case "activity": return { title: notice.title, body: notice.body, icon: CalendarDays };
    case "bulletin": return { title: "Bài đăng mới", body: notice.postTitle, icon: Newspaper };
    case "score": return {
      title: "Đã cập nhật điểm của bạn",
      body: "Tuần " + dateLabel(notice.week, true) + " · " + (notice.change > 0 ? "+" : "") + formatScore(notice.change) + " điểm",
      icon: ClipboardList,
    };
    case "duty": {
      const title = notice.dutyChange === "cancelled" ? "Ca trực C1 đã hủy"
        : notice.dutyChange === "removed" ? "Bạn đã được gỡ khỏi ca trực C1"
        : notice.dutyChange === "withdrawn" ? "Ca trực C1 đã hủy công bố"
        : notice.dutyChange === "updated" ? "Lịch trực C1 đã thay đổi" : "Bạn có lịch trực C1";
      const hours = [notice.startTime, notice.endTime].filter(Boolean).join(" – ");
      return { title, body: [notice.period === "am" ? "Ca sáng" : "Ca chiều", dateLabel(notice.date, true), hours].filter(Boolean).join(" · "), icon: CalendarDays };
    }
  }
}

export default function WorkspaceNotifications({ state, pending, onOpenPending, onOpenNotice, onCompose }: {
  state: WorkspaceNotificationState;
  pending: number;
  onOpenPending: () => void;
  onOpenNotice: (notice: InboxNotification) => void;
  onCompose?: () => void;
}) {
  const panelId = useId();
  const center = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { notifications, loadError, loaded, refresh, read } = state;
  const unread = notifications.filter(notice => !notice.read).length;
  const bellLabel = ["Thông báo", unread ? unread + " chưa đọc" : "", pending ? pending + " đăng ký chờ xử lý" : ""]
    .filter(Boolean).join(", ");

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
      {(onCompose || notifications.length > 0) && <div className="notification-toolbar">
        {onCompose && <button type="button" className="text-button" onClick={() => {
          setOpen(false);
          onCompose();
        }}><Plus size={16} aria-hidden="true" /> Soạn thông báo</button>}
        {notifications.length > 0 && <button type="button" className="text-button" disabled={!unread}
          onClick={() => void read("all")}><CheckCheck size={16} aria-hidden="true" /> Đánh dấu tất cả đã đọc</button>}
      </div>}
      {pending > 0 && <button type="button" className="notification-pending" onClick={() => {
        setOpen(false);
        onOpenPending();
      }}>{pending} đăng ký chờ xử lý</button>}
      {loadError && <div className="notification-status" role="status">
        Chưa đồng bộ được thông báo <button type="button" className="text-button" onClick={() => void refresh()}>Thử lại</button>
      </div>}
      {notifications.length ? <ul className="notification-items">
        {notifications.map(notice => {
          const { title, body, icon: Icon } = notificationCopy(notice);
          return <li key={notice.id} className="notification-entry" data-unread={!notice.read}>
            <button type="button" className="notification-item" data-unread={!notice.read} onClick={() => {
              setOpen(false);
              if (!notice.read) void read([notice.id]);
              onOpenNotice(notice);
            }}>
              <span className="notification-item-icon"><Icon size={17} aria-hidden="true" /></span>
              <span className="notification-item-copy">
                <strong>{title}</strong>
                <span className="notification-item-detail">{body}</span>
                <span className="notification-item-meta">
                  {notice.actorId ? <MemberName memberId={notice.actorId} /> : <span>{"feedbackId" in notice ? "Ẩn danh" : "Nhịp Đội"}</span>}
                  <time dateTime={new Date(notice.createdAt).toISOString()}>{notificationClock.format(notice.createdAt)}</time>
                </span>
                <span className="sr-only">{notice.read ? "Đã đọc" : "Chưa đọc"}</span>
              </span>
            </button>
            {!notice.read && <button type="button" className="icon-button notification-read-button" title="Đánh dấu đã đọc"
              aria-label={"Đánh dấu đã đọc · " + title} onClick={() => void read([notice.id])}><Check size={16} aria-hidden="true" /></button>}
          </li>;
        })}
      </ul> : !loadError && <p className="notification-status">{loaded ? "Chưa có thông báo" : "Đang tải thông báo…"}</p>}
    </section>}
  </div>;
}
