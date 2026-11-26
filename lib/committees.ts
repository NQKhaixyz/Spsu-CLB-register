export const committeeLabels = {
  tt: "Truyền thông",
  sk: "Sự kiện",
  cm: "Chuyên môn",
  cs: "Điều hành",
} as const;

export type CommitteeKind = keyof typeof committeeLabels;
export const committeeKinds = Object.keys(committeeLabels) as CommitteeKind[];
export const isCommitteeKind = (value: unknown): value is CommitteeKind =>
  committeeKinds.some(kind => kind === value);

export type CommitteeFilter = CommitteeKind | "all" | "unassigned";

export type CommitteeMembership = {
  committee?: CommitteeKind;
  committees?: CommitteeKind[];
};

export function memberCommittees({ committees, committee }: CommitteeMembership): CommitteeKind[] {
  if (Array.isArray(committees)) return committeeKinds.filter(kind => committees.includes(kind));
  return isCommitteeKind(committee) ? [committee] : [];
}

export function matchesCommittee(member: CommitteeMembership, filter: CommitteeFilter) {
  if (filter === "all") return true;
  const committees = memberCommittees(member);
  return filter === "unassigned" ? committees.length === 0 : committees.includes(filter);
}

export function memberCommitteeNames(member?: CommitteeMembership) {
  if (!member) return "";
  return memberCommittees(member).map(kind => committeeLabels[kind]).join(", ") || "Chưa phân ban";
}
