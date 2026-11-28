import type { Club } from "./club";
import { activityLabels, activityName, activityPointsFor } from "./activity";
import type { ActivityNoticeDraft, ScoreNoticeChange } from "./notification-types";
import { roundSharingScore } from "./sharing-scores";

type ScoreItem = { memberId: string; week: string; category: string; detail?: string; reason?: string; points: number };
type Snapshot = Map<string, ScoreItem>;
type ScoreNotice = Extract<ActivityNoticeDraft, { kind: "score" }>;

export function captureScoreItems(club: Club, memberId: string): Snapshot {
  const items: Snapshot = new Map();
  for (const row of club.manualActivities ?? []) {
    if (row.memberId !== memberId || (row.kind !== "committee" && row.kind !== "special")) continue;
    const points = row.quantity > 0 ? activityPointsFor(club, row) : 0;
    const category = activityLabels[row.kind];
    const label = activityName(club, row);
    items.set(JSON.stringify(["manual", row.week, row.id]),
      { memberId, week: row.week, category, detail: label === category ? undefined : label, reason: row.note?.trim() || undefined, points });
  }
  for (const row of club.pointDeductions ?? []) {
    if (row.memberId !== memberId) continue;
    items.set(JSON.stringify(["deduction", row.week, row.id]), {
      memberId, week: row.week, category: activityLabels.deduction, points: row.cancelledAt ? 0 : -row.points,
      reason: (row.cancelledAt ? row.cancelReason : row.reason)?.trim() || undefined,
    });
  }
  return items;
}

export function scoreItemNotices(before: Snapshot, after: Snapshot): ScoreNotice[] {
  const byRecipient = new Map<string, ScoreNotice & { changes: ScoreNoticeChange[] }>();
  function append(item: ScoreItem, operation: ScoreNoticeChange["operation"], change: number, reason = item.reason) {
    const { memberId, week, category, detail } = item;
    const group = JSON.stringify([memberId, week]);
    const notice = byRecipient.get(group) ?? { kind: "score", memberId, week, change: 0, changes: [] };
    notice.changes.push({ operation, category, detail, reason, change });
    notice.change += change;
    byRecipient.set(group, notice);
  }
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(key);
    const current = after.get(key);
    const reason = current?.reason ?? previous?.reason;
    if (previous?.points && current?.points && previous.detail !== current.detail) {
      append(previous, "revoke", -previous.points, reason);
      append(current, "add", current.points, reason);
      continue;
    }
    const change = roundSharingScore((current?.points ?? 0) - (previous?.points ?? 0));
    if (!change) continue;
    const operation = change > 0 ? "add" : current?.points ? "deduct" : "revoke";
    append(current?.points ? current : previous ?? current!, operation, change, reason);
  }
  return [...byRecipient.values()].map(notice => ({ ...notice, change: roundSharingScore(notice.change) }));
}
