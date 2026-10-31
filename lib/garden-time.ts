export type GardenPeriod = "dawn" | "day" | "dusk" | "night";
export type GardenMode = "live" | GardenPeriod;
export const gardenLabels: Record<GardenPeriod, string> = {
  dawn: "Bình minh", day: "Ban ngày", dusk: "Hoàng hôn", night: "Đêm yên bình",
};
export function vietnamHour(date: Date) {
  return (date.getUTCHours() + 7 + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) % 24;
}
export function periodAt(hour: number): GardenPeriod {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 17) return "day";
  if (hour >= 17 && hour < 19) return "dusk";
  return "night";
}
export function gardenHour(mode: GardenMode, now = new Date()) {
  return mode === "live" ? vietnamHour(now) : { dawn: 6, day: 12, dusk: 18, night: 22 }[mode];
}
// Interpolate the light through sunrise/sunset; background also follows the actual clock.
export function daylightAt(hour: number) {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return clamp((hour - 5) / 2) * clamp((19 - hour) / 2);
}
