import { eventEvidenceExpiry, eventForActivity, type ActivityRegistration, type ClubEvent } from "./activity";
import type { Club, Member } from "./club";
import type { PhotoEvidenceView } from "./photo-evidence";

export const eventPhotoId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function eventEvidenceTarget(club: Club, viewer: Member, registrationId: string) {
  const row = club.activityRegistrations?.find(registration => registration.id === registrationId);
  if (!row || !viewer.active || (viewer.id !== row.memberId && viewer.role !== "admin") || row.status === "withdrawn") return null;
  const event = eventForActivity(club, row);
  if (!event || event.cancelledAt || (!event.requiresEvidence && !row.evidence)) return null;
  return { row, event };
}

export function eventEvidenceView(row: ActivityRegistration, event: ClubEvent, viewer: Member, now = Date.now()): PhotoEvidenceView<"attached"> {
  const expiresAt = eventEvidenceExpiry(event);
  const expired = now >= expiresAt;
  const savedReview = row.evidence?.review;
  const reviewedAt = savedReview ? savedReview.at : row.reviewedAt;
  const evidence = !event.cancelledAt && !expired && row.evidence ? {
    id: row.evidence.id,
    submittedAt: row.evidence.submittedAt,
    status: savedReview?.status ?? (row.status === "confirmed" ? "approved" as const : row.status === "declined" ? "rejected" as const : "pending" as const),
    expiresAt,
    reviewedAt: reviewedAt ? Date.parse(reviewedAt) : null,
    reviewNote: (savedReview ? savedReview.note : row.decision) ?? "",
  } : null;
  return {
    evidence, expiresAt, expired,
    canUpload: !event.cancelledAt && !expired && !!event.requiresEvidence && viewer.id === row.memberId &&
      (row.status === "pending" || row.status === "declined"),
    canReview: !event.cancelledAt && !!event.requiresEvidence && !!evidence && viewer.role === "admin" && row.status === "pending",
  };
}

// Detach image references at the cutoff, without touching registrations or scores.
export function detachExpiredEventPhotos(club: Club, now: number) {
  const events = new Map((club.events ?? []).map(event => [event.id, event]));
  const retained = new Set<string>();
  const detached = new Set<string>();
  for (const row of club.activityRegistrations ?? []) {
    if (!row.evidence) continue;
    const event = row.eventId && events.get(row.eventId);
    // Cancelled events can be restored, so keep their hidden photos until the same cutoff.
    if (row.kind === "event" && event && row.status !== "withdrawn" && now < eventEvidenceExpiry(event)) {
      retained.add(row.evidence.id);
    } else {
      detached.add(row.evidence.id);
      delete row.evidence;
    }
  }
  return { retained, detached };
}
