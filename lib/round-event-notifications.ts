import { activityPointsFor, type ClubEvent } from "./activity";
import { addDays, isRosterMember, today, type Club } from "./club";
import type { StoredActivityNotice } from "./notification-types";
import { roundSharingScore } from "./sharing-scores";

const formatPoints = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 10 });
const resultKey = (eventId: string, memberId: string) => JSON.stringify([eventId, memberId]);
type RoundResult = { eventId: string; memberId: string; name: string; notifiedAt: number; rounds: number; points: number };

export function settleRoundEventNotices(club: Club, now = Date.now()) {
  if (club.roundEventNoticesSince === undefined) {
    club.roundEventNoticesSince = now;
    return true;
  }
  const events = new Map<string, { event: ClubEvent; closedAt: number }>();
  const date = today(new Date(now));
  for (const event of club.events ?? []) {
    if (event.cancelledAt || event.scoringMode !== "perRound" || event.endDate >= date) continue;
    const closedAt = Date.parse(addDays(event.endDate, 1) + "T00:00:00+07:00");
    if (closedAt >= club.roundEventNoticesSince) events.set(event.id, { event, closedAt });
  }
  const eligible = new Set(club.members.filter(isRosterMember).map(member => member.id));
  const totals = new Map<string, RoundResult>();
  for (const row of club.activityRegistrations ?? []) {
    const closed = row.eventId && events.get(row.eventId);
    if (!closed || row.kind !== "event" || row.status !== "confirmed" || row.supersededBy || row.quantity <= 0 || !eligible.has(row.memberId)) continue;
    const { event, closedAt } = closed;
    const key = resultKey(event.id, row.memberId);
    const total = totals.get(key) ?? {
      eventId: event.id, memberId: row.memberId, name: event.name, notifiedAt: closedAt, rounds: 0, points: 0,
    };
    const approvedAt = Date.parse(row.reviewedAt ?? row.submittedAt);
    if (Number.isFinite(approvedAt) && approvedAt <= now) total.notifiedAt = Math.max(total.notifiedAt, approvedAt);
    total.rounds += row.quantity;
    total.points += activityPointsFor(club, row);
    totals.set(key, total);
  }

  const notices = club.activityNotices ?? [];
  const seen = new Set<string>();
  const next: StoredActivityNotice[] = [];
  let changed = false;
  function bodyFor(total: RoundResult) {
    const points = formatPoints.format(roundSharingScore(total.points));
    return `Bạn đã nhận ${points} điểm vì tham gia sự kiện ${total.name} ${formatPoints.format(total.rounds)} lần`;
  }
  for (const notice of notices) {
    if (notice.kind !== "activity" || !notice.roundEventResult || notice.target.area !== "event") {
      next.push(notice);
      continue;
    }
    const key = resultKey(notice.target.eventId, notice.memberId);
    const total = totals.get(key);
    if (!total || seen.has(key)) {
      changed = true;
      continue;
    }
    seen.add(key);
    const body = bodyFor(total);
    if (body !== notice.body) {
      next.push({ ...notice, body, createdAt: now, read: undefined });
      changed = true;
    } else next.push(notice);
  }
  for (const [key, total] of totals) {
    if (seen.has(key)) continue;
    next.push({ id: crypto.randomUUID(), memberId: total.memberId, createdAt: total.notifiedAt,
      kind: "activity", roundEventResult: true, title: "Đã nhận điểm sự kiện", body: bodyFor(total),
      target: { area: "event", eventId: total.eventId } });
    changed = true;
  }
  if (changed) club.activityNotices = next;
  return changed;
}
