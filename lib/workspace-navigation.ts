export const sidebarTabLabels = {
  scoreboard: "Bảng điểm",
  overview: "Tổng quan",
  activity: "Hoạt động",
  links: "Link",
  members: "Thành viên",
  personal: "Góc thành viên",
} as const;

export type SidebarTab = keyof typeof sidebarTabLabels;
const sidebarTabs = Object.keys(sidebarTabLabels) as SidebarTab[];

export function defaultSidebarOrder(isAdmin: boolean) {
  return sidebarTabs.filter(tab => isAdmin || tab !== "overview");
}

export function resolveSidebarOrder(isAdmin: boolean, saved: unknown): SidebarTab[] {
  const available = defaultSidebarOrder(isAdmin);
  if (!Array.isArray(saved)) return available;
  const ordered = saved.filter((tab, index): tab is SidebarTab =>
    available.includes(tab) && saved.indexOf(tab) === index,
  );
  return [...ordered, ...available.filter(tab => !ordered.includes(tab))];
}
