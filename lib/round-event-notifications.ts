import { activityPointsFor, allowsMultipleEventRounds, type ClubEvent } from "./activity";
import { addDays, isRosterMember, today, type Club } from "./club";
import type { EventNoticeScore, StoredActivityNotice } from "./notification-types";
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
    if ((event.scoringMode !== "perRound" && !allowsMultipleEventRounds(event)) || event.endDate >= date) continue;
    const closedAt = Date.parse(addDays(event.endDate, 1) + "T00:00:00+07:00");
    if (closedAt >= club.roundEventNoticesSince) events.set(event.id, { event, closedAt });
  }
  const eligible = new Set(club.members.filter(isRosterMember).map(member => member.id));
  const totals = new Map<string, RoundResult>();
  for (const row of club.activityRegistrations ?? []) {
    const closed = row.eventId && events.get(row.eventId);
    if (!closed || closed.event.cancelledAt || row.kind !== "event" || row.status !== "confirmed" || row.supersededBy ||
        row.quantity <= 0 || !eligible.has(row.memberId)) continue;
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
  function receiptFor(total: RoundResult) {
    const eventScore: EventNoticeScore = { eventName: total.name, points: roundSharingScore(total.points), rounds: total.rounds };
    const body = total.rounds
      ? `Bạn đã nhận ${formatPoints.format(eventScore.points)} điểm vì tham gia sự kiện ${total.name} ${formatPoints.format(total.rounds)} lần`
      : `${total.name} · 0 lượt được duyệt`;
    return { body, eventScore };
  }
  for (const notice of notices) {
    if (notice.kind !== "activity" || !notice.roundEventResult || notice.target.area !== "event") {
      next.push(notice);
      continue;
    }
    const key = resultKey(notice.target.eventId, notice.memberId);
    const closed = events.get(notice.target.eventId);
    const total = totals.get(key) ?? (closed && notice.eventScore && eligible.has(notice.memberId) ? {
      eventId: closed.event.id, memberId: notice.memberId, name: closed.event.name,
      notifiedAt: now, rounds: 0, points: 0,
    } : undefined);
    if (!total || seen.has(key)) {
      changed = true;
      continue;
    }
    seen.add(key);
    const receipt = receiptFor(total);
    if (receipt.body !== notice.body) {
      const change = notice.eventScore ? roundSharingScore(receipt.eventScore.points - notice.eventScore.points) : undefined;
      next.push({ ...notice, ...receipt, eventScore: { ...receipt.eventScore, change }, createdAt: now, read: undefined });
      changed = true;
    } else if (!notice.eventScore) {
      next.push({ ...notice, ...receipt });
      changed = true;
    } else next.push(notice);
  }
  for (const [key, total] of totals) {
    if (seen.has(key)) continue;
    next.push({ id: crypto.randomUUID(), memberId: total.memberId, createdAt: total.notifiedAt,
      kind: "activity", roundEventResult: true, title: "Đã nhận điểm sự kiện", ...receiptFor(total),
      target: { area: "event", eventId: total.eventId } });
    changed = true;
  }
  if (changed) club.activityNotices = next;
  return changed;
}
