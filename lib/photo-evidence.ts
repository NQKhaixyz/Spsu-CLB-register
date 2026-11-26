export const maxPhotoBytes = 2 * 1024 * 1024;

export type PhotoEvidence = {
  id: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: number;
  expiresAt: number;
  reviewedAt: number | null;
  reviewNote: string;
};

export type PhotoEvidenceView<ExtraStatus extends string = never> = {
  evidence: (Omit<PhotoEvidence, "status"> & { status: PhotoEvidence["status"] | ExtraStatus }) | null;
  expiresAt: number;
  expired: boolean;
  canUpload: boolean;
  canReview: boolean;
};
