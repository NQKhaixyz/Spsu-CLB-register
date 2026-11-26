export const maxPhotoBytes = 2 * 1024 * 1024;

export type PhotoEvidence = {
  id: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: number;
  expiresAt: number;
  reviewedAt: number | null;
  reviewNote: string;
};

export type PhotoEvidenceView = {
  evidence: PhotoEvidence | null;
  expiresAt: number;
  expired: boolean;
  canUpload: boolean;
  canReview: boolean;
};
