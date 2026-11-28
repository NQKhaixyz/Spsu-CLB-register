export const sidebarTabLabels = {
  bulletin: "Bảng tin",
  activity: "Hoạt động",
  scoreboard: "Bảng điểm",
  feedback: "Feedback",
  games: "Trò chơi",
  personal: "Góc của tôi",
  members: "Thành viên",
} as const;

export type SidebarTab = keyof typeof sidebarTabLabels;
export const sidebarTabs = Object.keys(sidebarTabLabels) as SidebarTab[];

export function teamSidebarOrder(saved: readonly SidebarTab[] = []): SidebarTab[] {
  return [...new Set([...saved.filter(tab => sidebarTabs.includes(tab)), ...sidebarTabs])];
}
