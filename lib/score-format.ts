const scoreNumber = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 10 });

export function formatScore(value: number) {
  return scoreNumber.format(value);
}

export const scoreInputPattern = "\\s*(?:\\d+|\\d*\\.\\d+)(?:[eE](?:\\+|-)?\\d+)?\\s*";
const scoreInput = new RegExp("^" + scoreInputPattern + "$");

export function normalizeScoreInput(value: string) {
  return value.replaceAll(",", ".");
}

export function parseScoreInput(value: unknown) {
  if (typeof value !== "string") return NaN;
  const text = normalizeScoreInput(value);
  return scoreInput.test(text) ? Number(text) : NaN;
}
