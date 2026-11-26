export const committeeLabels = {
  tt: "Truyền thông",
  sk: "Sự kiện",
  cm: "Chuyên môn",
  cs: "Cán sự",
} as const;

export type CommitteeKind = keyof typeof committeeLabels;
export const committeeKinds = Object.keys(committeeLabels) as CommitteeKind[];
export const isCommitteeKind = (value: unknown): value is CommitteeKind =>
  committeeKinds.some(kind => kind === value);

export type CommitteeFilter = CommitteeKind | "all" | "unassigned";

export function matchesCommittee(committee: unknown, filter: CommitteeFilter) {
  if (filter === "all") return true;
  if (filter === "unassigned") return !isCommitteeKind(committee);
  return committee === filter;
}
