export type BulletinMarker = "**" | "_";
export type BulletinInline = string | { marker: BulletinMarker; children: BulletinInline[] };

export function bulletinInline(content: string): BulletinInline[] {
  const root: BulletinInline[] = [];
  const frames: { marker: BulletinMarker; children: BulletinInline[] }[] = [];
  const append = (...nodes: BulletinInline[]) => (frames.at(-1)?.children ?? root).push(...nodes);
  let cursor = 0;
  for (const token of content.matchAll(/\\[\\*_]|\*+|_+/g)) {
    const [marker] = token;
    const start = token.index;
    if (start > cursor) append(content.slice(cursor, start));
    cursor = start + marker.length;
    const open = frames.at(-1);
    if (marker.startsWith("\\")) {
      append(marker.slice(1));
    } else if (open && open.marker === marker && open.children.length && /\S/.test(content[start - 1] ?? "")) {
      frames.pop();
      append(open);
    } else if ((marker === "**" || marker === "_") && /\S/.test(content[cursor] ?? "") &&
      !frames.some(frame => frame.marker === marker)) {
      frames.push({ marker, children: [] });
    } else {
      append(marker);
    }
  }
  if (cursor < content.length) append(content.slice(cursor));
  while (frames.length) {
    const open = frames.pop()!;
    append(open.marker, ...open.children);
  }
  return root;
}

const escapeText = (value: string) => value.replace(/[\\*_]/g, "\\$&");

export function toggleBulletinEmphasis(content: string, start: number, end: number, marker: BulletinMarker, formatted: boolean) {
  const selected = content.slice(start, end);
  const middle = selected.trim();
  const leading = selected.slice(0, selected.length - selected.trimStart().length);
  const trailing = middle ? selected.slice(selected.trimEnd().length) : "";
  let before = content.slice(0, start) + leading;
  let after = trailing + content.slice(end);
  let text = middle || "văn bản";
  if (!formatted) {
    before = escapeText(before);
    text = escapeText(text);
    after = escapeText(after);
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
