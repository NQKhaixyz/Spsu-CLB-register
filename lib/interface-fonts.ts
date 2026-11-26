export const interfaceFonts = [
  { id: "inter", name: "Inter", description: "Gọn nét, dễ dò bảng điểm" },
  { id: "nunito", name: "Nunito", description: "Nét tròn, mềm mại" },
  { id: "lexend", name: "Lexend", description: "Dáng chữ rộng, rõ nét" },
  { id: "spectral", name: "Spectral", description: "Có chân, hợp đọc báo cáo" },
] as const;

export type FontId = (typeof interfaceFonts)[number]["id"];
export const defaultFont: FontId = "inter";

export function isFontId(value: unknown): value is FontId {
  return interfaceFonts.some(font => font.id === value);
}

export function resolveFont(value: unknown): FontId {
  return isFontId(value) ? value : defaultFont;
}
