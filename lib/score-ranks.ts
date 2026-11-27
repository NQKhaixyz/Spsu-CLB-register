export type ScoreStanding = { memberId: string; points: number; rank: number };

const monthlyTiers = [
  { id: "challenger", label: "Thách đấu" },
  { id: "grandmaster", label: "Đại cao thủ" },
  { id: "master", label: "Cao thủ" },
  { id: "diamond", label: "Kim cương" },
  { id: "emerald", label: "Lục bảo" },
  { id: "platinum", label: "Bạch kim" },
  { id: "gold", label: "Vàng" },
  { id: "silver", label: "Bạc" },
  { id: "bronze", label: "Đồng" },
  { id: "iron", label: "Sắt" },
] as const;

const names = new Intl.Collator("vi-VN", { numeric: true });

export function rankScoreRows<T extends { memberId: string; name: string; points: number }>(rows: readonly T[]) {
  return [...rows]
    .sort((a, b) => b.points - a.points || names.compare(a.name, b.name) || a.memberId.localeCompare(b.memberId))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function monthlyScoreTier(rank: number): (typeof monthlyTiers)[number] | undefined {
  return monthlyTiers[rank - 1];
}
