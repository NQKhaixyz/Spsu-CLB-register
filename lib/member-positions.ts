export const memberPositionLabels = {
  captain: "Đội trưởng",
  deputy: "Đội phó",
  secretary: "Thư ký",
  "tt-lead": "Trưởng ban TT",
  "cm-lead": "Trưởng ban CM",
  "sk-lead": "Trưởng ban SK",
  "tt-deputy": "Phó Trưởng ban TT",
  "cm-deputy": "Phó Trưởng ban CM",
  "sk-deputy": "Phó Trưởng ban SK",
} as const;

export type MemberPosition = keyof typeof memberPositionLabels;
export const memberPositions = Object.keys(memberPositionLabels) as MemberPosition[];
export const isMemberPosition = (value: unknown): value is MemberPosition =>
  memberPositions.some(position => position === value);

export function memberRoleLabel(member: { role: "admin" | "member"; position?: MemberPosition }) {
  if (member.role === "admin") return "Ban điều hành";
  return member.position ? memberPositionLabels[member.position] ?? "Thành viên" : "Thành viên";
}
