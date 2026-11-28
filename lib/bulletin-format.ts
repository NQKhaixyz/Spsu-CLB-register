export type BulletinMarker = "**" | "_";
export type BulletinInline = string | { marker: BulletinMarker; children: BulletinInline[] };
type Delimiter = BulletinMarker | "*" | "***";

export function bulletinInline(content: string, pastedMarkdown = false): BulletinInline[] {
  const root: BulletinInline[] = [];
  const frames: { delimiter: Delimiter; children: BulletinInline[] }[] = [];
  const append = (...nodes: BulletinInline[]) => (frames.at(-1)?.children ?? root).push(...nodes);
  let cursor = 0;
  for (const token of content.matchAll(/\\[\\*_]|\*+|_+/g)) {
    const [marker] = token;
    const start = token.index;
    if (start > cursor) append(content.slice(cursor, start));
    cursor = start + marker.length;
    if (marker.startsWith("\\")) {
      append(marker.slice(1));
      continue;
    }
    let remaining = marker;
    let open = frames.at(-1);
    const hasFollowingText = /\S/.test(content[cursor] ?? "");
    const closes = /\S/.test(content[start - 1] ?? "") &&
      !(pastedMarkdown && marker === "_" && /[\p{L}\p{N}]/u.test(content[cursor] ?? ""));
    while (closes && open?.children.length &&
      (pastedMarkdown ? remaining.startsWith(open.delimiter) :
        remaining === open.delimiter || (hasFollowingText && remaining === open.delimiter.repeat(2)))) {
      frames.pop();
      const { delimiter, children } = open;
      if (delimiter === "***") append({ marker: "**", children: [{ marker: "_", children }] });
      else append({ marker: delimiter === "*" ? "_" : delimiter, children });
      remaining = remaining.slice(delimiter.length);
      open = frames.at(-1);
    }
    if (!remaining) continue;
    const emphasis = remaining === "**" || remaining === "_" || (pastedMarkdown && (remaining === "*" || remaining === "***"));
    const withinWord = pastedMarkdown && remaining === "_" && /[\p{L}\p{N}]/u.test(content[start - 1] ?? "");
    if (emphasis && !withinWord && hasFollowingText && !frames.some(frame => frame.delimiter === remaining))
      frames.push({ delimiter: remaining as Delimiter, children: [] });
    else append(remaining);
  }
  if (cursor < content.length) append(content.slice(cursor));
  while (frames.length) {
    const open = frames.pop()!;
    append(open.delimiter, ...open.children);
  }
  return root;
}

export const escapeBulletinText = (value: string) => value.replace(/[\\*_]/g, "\\$&");

export function pastedMarkdownEmphasis(value: string) {
  const nodes = bulletinInline(value, true);
  if (!nodes.some(node => typeof node !== "string")) return;
  const markup = (pieces: BulletinInline[]): string => pieces.map(node =>
    typeof node === "string" ? escapeBulletinText(node) : node.marker + markup(node.children) + node.marker,
  ).join("");
  return markup(nodes);
}

export function toggleBulletinEmphasis(content: string, start: number, end: number, marker: BulletinMarker, formatted: boolean) {
  const selected = content.slice(start, end);
  const middle = selected.trim();
  const leading = selected.slice(0, selected.length - selected.trimStart().length);
  const trailing = middle ? selected.slice(selected.trimEnd().length) : "";
  let before = content.slice(0, start) + leading;
  let after = trailing + content.slice(end);
  let text = middle || "văn bản";
  if (!formatted) {
    before = escapeBulletinText(before);
    text = escapeBulletinText(text);
    after = escapeBulletinText(after);
  }
  const other = marker === "**" ? "_" : "**";
  const nested = marker + other;
  if (before.endsWith(nested) && after.startsWith(other + marker)) {
    before = before.slice(0, -nested.length) + other;
    after = other + after.slice(nested.length);
  } else if (before.endsWith(marker) && after.startsWith(marker)) {
    before = before.slice(0, -marker.length);
    after = after.slice(marker.length);
  } else if (text.length > marker.length * 2 && text.startsWith(marker) && text.endsWith(marker)) {
    text = text.slice(marker.length, -marker.length);
  } else {
    before += marker;
    after = marker + after;
  }
  return { value: before + text + after, start: before.length, end: before.length + text.length };
}
