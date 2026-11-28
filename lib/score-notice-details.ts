import type { Club } from "./club";
import { activityLabels, activityName, activityPointsFor } from "./activity";
import type { ActivityNoticeDraft, ScoreNoticeChange } from "./notification-types";
import { roundSharingScore } from "./sharing-scores";

type ScoreItem = { memberId: string; week: string; category: string; detail?: string; points: number };
type Snapshot = Map<string, ScoreItem>;
type ScoreNotice = Extract<ActivityNoticeDraft, { kind: "score" }>;

export function captureScoreItems(club: Club, memberId: string): Snapshot {
  const items: Snapshot = new Map();
  for (const row of club.manualActivities ?? []) {
    if (row.memberId !== memberId || row.quantity <= 0 || (row.kind !== "committee" && row.kind !== "special")) continue;
    const points = activityPointsFor(club, row);
    if (!points) continue;
    const category = activityLabels[row.kind];
    const label = activityName(club, row);
    items.set(JSON.stringify([row.week, row.id]),
      { memberId, week: row.week, category, detail: label === category ? undefined : label, points });
  }
  return items;
}

export function scoreItemNotices(before: Snapshot, after: Snapshot): ScoreNotice[] {
  const byRecipient = new Map<string, ScoreNotice & { changes: ScoreNoticeChange[] }>();
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(key);
    const current = after.get(key);
    const change = roundSharingScore((current?.points ?? 0) - (previous?.points ?? 0));
    if (!change) continue;
    const { memberId, week, category, detail } = current ?? previous!;
    const operation = !current ? "revoke" : change > 0 ? "add" : "deduct";
    const group = JSON.stringify([memberId, week]);
    const notice = byRecipient.get(group) ?? { kind: "score", memberId, week, change: 0, changes: [] };
    notice.changes.push({ operation, category, detail, change });
    notice.change += change;
    byRecipient.set(group, notice);
  }
  return [...byRecipient.values()].map(notice => ({ ...notice, change: roundSharingScore(notice.change) }));
}
