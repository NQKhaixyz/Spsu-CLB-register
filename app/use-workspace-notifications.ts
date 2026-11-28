"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { InboxNotification, MemberNotificationInbox } from "../lib/feedback-notifications";
import type { NoticeArea } from "../lib/notification-types";

const inboxPath = "/api/feedback-notifications?include=all";
const emptyInbox: InboxNotification[] = [];
const pollInterval = 30_000;

export function sidebarNoticeCounts(notices: readonly InboxNotification[]) {
  const counts: Record<NoticeArea, number> = { bulletin: 0, activity: 0, scoreboard: 0, feedback: 0 };
  for (const notice of notices) {
    if (notice.kind === "bulletin") {
      if (!notice.confirmed) counts.bulletin++;
    } else if (!notice.read) {
      if (notice.kind === "score") counts.scoreboard++;
      else if (notice.kind === "activity" || notice.kind === "duty") counts.activity++;
      else if ("feedbackId" in notice) counts.feedback++;
    }
  }
  return counts;
}

export function useWorkspaceNotifications(memberId?: string) {
  const [state, setState] = useState<{ memberId: string; inbox: MemberNotificationInbox }>();
  const [loadError, setLoadError] = useState(false);
  const owner = useRef(memberId);
  const reading = useRef(new Set<string>());
  const markingAll = useRef(false);
  const dismissing = useRef(new Set<string>());
  const inbox = state?.memberId === memberId ? state?.inbox : undefined;
  const notifications = inbox?.notifications ?? emptyInbox;

  useLayoutEffect(() => {
    owner.current = memberId;
    reading.current = new Set();
    markingAll.current = false;
    dismissing.current = new Set();
    setLoadError(false);
  }, [memberId]);

  const receive = useCallback((account: string, incoming: MemberNotificationInbox) => {
    if (owner.current !== account) return;
    setState(current => current?.memberId === account && current.inbox.revision > incoming.revision
      ? current : { memberId: account, inbox: incoming });
    setLoadError(false);
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!memberId) return;
    try {
      const response = await fetch(inboxPath, { cache: "no-store", signal });
      if (signal?.aborted || owner.current !== memberId) return;
      if (response.status === 401) {
        setState(undefined);
        setLoadError(false);
        return;
      }
      if (!response.ok) throw new Error("Chưa tải được thông báo");
      const incoming: MemberNotificationInbox = await response.json();
      if (!signal?.aborted) receive(memberId, incoming);
    } catch {
      if (!signal?.aborted && owner.current === memberId) setLoadError(true);
    }
  }, [memberId, receive]);

  useEffect(() => {
    if (!memberId) return;
    const controller = new AbortController();
    const refreshVisible = () => {
      if (!document.hidden) void refresh(controller.signal);
    };
    refreshVisible();
    const timer = window.setInterval(refreshVisible, pollInterval);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [memberId, refresh]);

  const read = useCallback(async (selection: "all" | readonly string[]) => {
    if (!memberId || markingAll.current) return;
    const pending = reading.current;
    const ids = selection === "all" ? [] : [...new Set(selection)].filter(id => !pending.has(id));
    if (selection !== "all" && !ids.length) return;
    if (selection === "all") markingAll.current = true;
    ids.forEach(id => pending.add(id));
    const packets: ({ all: true } | { id: string } | { ids: string[] })[] = [];
    if (selection === "all") packets.push({ all: true });
    else if (ids.length === 1) packets.push({ id: ids[0] });
    else for (let start = 0; start < ids.length; start += 200) packets.push({ ids: ids.slice(start, start + 200) });
    try {
      for (const payload of packets) {
        if (owner.current !== memberId) break;
        const response = await fetch(inboxPath, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        if (response.status === 404 || response.status === 401) {
          void refresh();
          continue;
        }
        if (!response.ok) throw new Error("Chưa cập nhật được thông báo");
        receive(memberId, await response.json());
      }
    } catch {
      if (owner.current === memberId) setLoadError(true);
    } finally {
      ids.forEach(id => pending.delete(id));
      if (reading.current === pending && selection === "all") markingAll.current = false;
    }
  }, [memberId, receive, refresh]);

  const dismiss = useCallback(async (id: string) => {
    if (!memberId || dismissing.current.has(id)) return;
    const pending = dismissing.current;
    pending.add(id);
    try {
      const response = await fetch(inboxPath, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, dismiss: true }),
      });
      if (response.status === 404 || response.status === 401) {
        void refresh();
        return;
      }
      if (!response.ok) throw new Error("Chưa xóa được thông báo");
      receive(memberId, await response.json());
    } catch {
      if (owner.current === memberId) setLoadError(true);
    } finally {
      pending.delete(id);
    }
  }, [memberId, receive, refresh]);

  return { notifications, revision: inbox?.revision, loaded: !!inbox, loadError, refresh, read, dismiss };
}

export type WorkspaceNotificationState = ReturnType<typeof useWorkspaceNotifications>;
