import type { Member, Shift } from "./club";

type Notice = { id: string; createdAt: number; actorId?: string; read?: true };
export type ScoreNoticeChange = {
  operation: "add" | "deduct" | "revoke";
  category: string;
  detail?: string;
  change: number;
};
type ScoreUpdate = { kind: "score"; week: string; change: number; changes?: ScoreNoticeChange[] };
export type DutyHours = Pick<Shift, "date" | "period" | "startTime" | "endTime">;
export type DutyChange = "assigned" | "updated" | "removed" | "cancelled" | "withdrawn";
export type ActivityNoticeTarget =
  | { area: "event"; eventId: string; deleted?: true }
  | { area: "meeting"; week: string }
  | { area: "duty"; week: string; shiftId: string };
export type ActivityUpdate = { kind: "activity"; title: string; body: string; target: ActivityNoticeTarget; roundEventResult?: true };
type StoredDutyNotice = { kind: "duty"; month: string; shiftId: string; hours?: DutyHours; dutyChange?: DutyChange };
export type StoredActivityNotice = Notice & { memberId: string } & (ScoreUpdate | StoredDutyNotice | ActivityUpdate);
export type ActivityNoticeDraft = (ScoreUpdate | StoredDutyNotice | ActivityUpdate) & { memberId: string };

type DirectNotice = { kind: "direct"; title: string; body: string };
export type StoredDirectNotice = Omit<Notice, "read"> & Omit<DirectNotice, "kind"> & {
  audience: "all" | "members"; recipients: string[]; readBy?: string[];
};
export type WorkspaceNotification = Notice & (
  | { kind: "bulletin"; postId: string; postTitle: string; confirmed?: true }
  | ScoreUpdate
  | (DutyHours & { kind: "duty"; week: string; shiftId: string; dutyChange?: DutyChange })
  | ActivityUpdate
  | DirectNotice
);

export const noticeTitleLimit = 100;
export const noticeBodyLimit = 500;
export const canReceiveDirectNotice = (member: Member, senderId: string) =>
  member.active && member.id !== senderId && !!member.userId;
export const isNoticeId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);

export type NoticeArea = "bulletin" | "activity" | "scoreboard" | "feedback";
