export type SharingKind = "cupid" | "guild";

export type SharingPeriod = {
  id: string;
  memberIds: string[];
  startedAt: number;
  endedAt?: number;
};

export type CupidTag = { id: string; authorId: string; memberId: string; text: string; approved: boolean };

export type SharingGroup = {
  id: string;
  kind: SharingKind;
  name: string;
  code?: string;
  leaderId?: string;
  periods: SharingPeriod[];
  hashtag?: string;
  tags?: CupidTag[];
  jointEvent?: boolean;
};

export type SharingInvite = {
  id: string;
  kind: SharingKind;
  groupId?: string;
  fromId: string;
  toId: string;
  consentVersion?: number;
  cupidTag?: string;
};

export type LockedShare = {
  periodId: string;
  kind: SharingKind;
  sourceKey?: string;
  sourceType: "duty" | "meeting" | "event" | "manual" | "deduction";
  sourceMemberId?: string;
  originalPoints?: number;
  share: number;
  memberIds: string[];
  week: string;
  month: string;
};

export const sharingNoticeTitles = {
  cupidInvite: "Lời mời ghép Cupid",
  cupidAccepted: "Đã ghép Cupid",
  cupidTag: "Hashtag Cupid cần duyệt",
  cupidEnded: "Đã kết thúc Cupid",
  guildInvite: "Lời mời vào Bang hội",
  guildJoined: "Có thành viên mới vào bang",
  guildLeft: "Có thành viên rời bang",
  guildRemoved: "Bạn đã rời bang theo quyết định của thủ lĩnh",
  guildLeader: "Bang hội có thủ lĩnh mới",
} as const;
export type SharingNoticeKind = keyof typeof sharingNoticeTitles;
export type SharingNotice = {
  id: string;
  memberId: string;
  actorId?: string;
  kind: SharingNoticeKind;
  sharingId: string;
  createdAt: number;
  read?: true;
};

export type SharingState = {
  groups: SharingGroup[];
  invites: SharingInvite[];
  locked: LockedShare[];
  notices: SharingNotice[];
};

export type SharingAmounts = Record<SharingKind, number>;
export const sharingScoreLabels = { cupid: "Điều chỉnh Cupid", guild: "Điều chỉnh Bang hội" } as const;
export const sharingKinds = ["cupid", "guild"] as const;
export type SharingAdjustment = { memberId: string; week: string; month: string; amounts: SharingAmounts };

export type PublicSharingGroup = {
  id: string;
  kind: SharingKind;
  name: string;
  code?: string;
  leaderId?: string;
  memberIds: string[];
  startedAt: number;
  sevenDays: boolean;
  jointEvent: boolean;
  hashtag?: string;
  hashtags: { memberId: string; text: string }[];
};
export type SharingGroupSummary = {
  id: string;
  groupId: string;
  kind: SharingKind;
  name: string;
  startedAt: number;
  endedAt?: number;
  contributions: { memberId: string; earned: number; received: number }[];
};
export type SharingView = {
  groups: PublicSharingGroup[];
  mine?: {
    eligible: boolean;
    availableMemberIds: string[];
    invited: (SharingInvite & { groupName?: string; groupCode?: string; groupSize?: number; groupPeriodId?: string })[];
    tags: CupidTag[];
    current?: SharingGroupSummary;
    history: SharingGroupSummary[];
  };
};

export const sharingRule = "Điểm cộng và điểm trừ được chia đều theo số người tại thời điểm hoạt động. Khi đổi thành viên, phần đã chia được chốt theo danh sách cũ";
export const sharingConsentVersion = 1;

export function sharingTagText(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim().replace(/^#/, "") : "";
}

export function activeSharingPeriod(group: SharingGroup) {
  const period = group.periods.at(-1);
  return period?.endedAt === undefined ? period : undefined;
}

export function canJoinSharing(member: { active: boolean; role: string; userId?: string }) {
  return member.active && member.role === "member" && !!member.userId;
}

export function sharingSourceKey(type: LockedShare["sourceType"], id: string, memberId?: string) {
  return JSON.stringify(memberId === undefined ? [type, id] : [type, id, memberId]);
}
