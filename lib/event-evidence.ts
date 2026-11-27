import { eventEvidenceExpiry, eventForActivity, type ActivityRegistration, type ClubEvent } from "./activity";
import type { Club, Member } from "./club";
import type { PhotoEvidenceView } from "./photo-evidence";
import { sharedLinkUrl } from "./shared-links";

export const eventPhotoId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const eventEvidenceLinkLimit = 2048;
export type EventEvidenceView = PhotoEvidenceView<"attached"> & {
  evidence: (NonNullable<PhotoEvidenceView<"attached">["evidence"]> & { linkUrl?: string }) | null;
  requiresContributionPoints?: true;
  recordedRounds?: number;
  pointsPerRound?: number;
};

export function eventEvidenceLink(value: unknown) {
  if (typeof value !== "string" || value.length > eventEvidenceLinkLimit) return null;
  const url = sharedLinkUrl(value.trim());
  return url && url.length <= eventEvidenceLinkLimit ? url : null;
}

export function eventEvidenceTarget(club: Club, viewer: Member, registrationId: string) {
  const row = club.activityRegistrations?.find(registration => registration.id === registrationId);
  if (!row || !viewer.active || (viewer.id !== row.memberId && viewer.role !== "admin") || row.status === "withdrawn") return null;
  const event = eventForActivity(club, row);
  if (!event || event.cancelledAt || (!event.requiresEvidence && !row.evidence)) return null;
  return { row, event };
}

export function eventEvidenceView(row: ActivityRegistration, event: ClubEvent, viewer: Member, now = Date.now()): EventEvidenceView {
  const expiresAt = eventEvidenceExpiry(event);
  const expired = now >= expiresAt;
  const savedReview = row.evidence?.review;
  const reviewedAt = savedReview ? savedReview.at : row.reviewedAt;
  const evidence = !event.cancelledAt && !expired && row.evidence ? {
    id: row.evidence.id,
    ...(row.evidence.linkUrl ? { linkUrl: row.evidence.linkUrl } : {}),
    submittedAt: row.evidence.submittedAt,
    status: savedReview?.status ?? (row.status === "confirmed" ? "approved" as const : row.status === "declined" ? "rejected" as const
      : row.supersededBy ? "attached" as const : "pending" as const),
    expiresAt,
    reviewedAt: reviewedAt ? Date.parse(reviewedAt) : null,
    reviewNote: (savedReview ? savedReview.note : row.decision) ?? "",
  } : null;
  return {
    evidence, expiresAt, expired,
    ...(event.scoringMode === "contribution" && viewer.role === "admin" ? { requiresContributionPoints: true } : {}),
    canUpload: !row.supersededBy && !event.cancelledAt && !expired && !!event.requiresEvidence && viewer.id === row.memberId &&
      (row.status === "pending" || row.status === "declined"),
    canReview: !row.supersededBy && !event.cancelledAt && !!event.requiresEvidence && !!evidence && viewer.role === "admin" && row.status === "pending",
  };
}

// Detach expired evidence and return the photo IDs that still belong in R2.
export function detachExpiredEventPhotos(club: Club, now: number) {
  const events = new Map((club.events ?? []).map(event => [event.id, event]));
  const retained = new Set<string>();
  const detached = new Set<string>();
  let changed = false;
  for (const row of club.activityRegistrations ?? []) {
    if (!row.evidence) continue;
    const event = row.eventId && events.get(row.eventId);
    // Cancelled events can be restored, so keep their evidence until the same cutoff.
    if (row.kind === "event" && event && row.status !== "withdrawn" && now < eventEvidenceExpiry(event)) {
      if (!row.evidence.linkUrl) retained.add(row.evidence.id);
    } else {
      if (!row.evidence.linkUrl) detached.add(row.evidence.id);
      delete row.evidence;
      changed = true;
    }
  }
  return { retained, detached, changed };
}
