import { activityPointsFor, allowsMultipleEventRounds, memberEventRegistrations, recordedEventQuantity, type ActivityRegistration, type ClubEvent } from "./activity";
import type { Club } from "./club";
import type { EventNoticeScore } from "./notification-types";
import { roundSharingScore } from "./sharing-scores";

export function eventNoticeScore(club: Club, event: ClubEvent, rows: readonly ActivityRegistration[], quantity: number): EventNoticeScore {
  const points = rows.reduce((total, row) => row.status === "confirmed" && !row.supersededBy ? total + activityPointsFor(club, row) : total, 0);
  const hasRounds = event.scoringMode === "perRound" || allowsMultipleEventRounds(event) || quantity > 1;
  return { eventName: event.name, points: roundSharingScore(points), rounds: hasRounds ? quantity : undefined };
}

export function legacyEventNoticeScore(club: Club, event: ClubEvent, memberId: string, body: string): EventNoticeScore | undefined {
  if (event.cancelledAt) return;
  const rows = memberEventRegistrations(club, event.id, memberId);
  const quantity = recordedEventQuantity(rows);
  if (!quantity) return;
  const approval = `${event.name} · ${quantity} lượt được duyệt`;
  if (body === approval) {
    return { ...eventNoticeScore(club, event, rows, quantity), current: true };
  }
}
