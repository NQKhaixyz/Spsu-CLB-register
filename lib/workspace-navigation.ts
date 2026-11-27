export const sidebarTabLabels = {
  bulletin: "Bảng tin",
  activity: "Hoạt động",
  scoreboard: "Bảng điểm",
  feedback: "Feedback",
  personal: "Góc của tôi",
  members: "Thành viên",
} as const;

export type SidebarTab = keyof typeof sidebarTabLabels;
export const sidebarTabs = Object.keys(sidebarTabLabels) as SidebarTab[];
