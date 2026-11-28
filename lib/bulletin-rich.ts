import { bulletinContentLimit, type BulletinBody } from "./bulletin";
import { bulletinInline, type BulletinInline } from "./bulletin-format";

export const bulletinMaxIndent = 4;

type TextAppearance = { color?: string; fontSize?: string };
type RichMark = { type: "bold" | "italic" | "underline" | "strike" }
  | { type: "textStyle"; attrs: TextAppearance };
type RichInline = { type: "text"; text: string; marks?: RichMark[] } | { type: "hardBreak" };
type RichParagraph = { type: "paragraph"; attrs?: { indent: number }; content?: RichInline[] };
type RichListItem = { type: "listItem"; content: RichBlock[] };
type RichList = { type: "bulletList" | "orderedList"; attrs?: { start: number }; content: RichListItem[] };
type RichBlock = RichParagraph | RichList;
export type BulletinRichDocument = { type: "doc"; content: RichBlock[] };
export type BulletinRichNode = BulletinRichDocument | RichBlock | RichListItem | RichInline;

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textAppearance(value: unknown): TextAppearance {
  const { color, fontSize } = fields(value);
  const safe: TextAppearance = {};
  if (typeof color === "string" && /^(?:#[\da-f]{3,8}|[a-z]{1,24}|rgba?\([\d., %]{3,40}\))$/i.test(color))
    safe.color = color;
  if (typeof fontSize === "string" && /^\d{1,2}(?:\.\d{1,2})?px$/.test(fontSize)) {
    const pixels = Math.min(32, Math.max(12, Number(fontSize.slice(0, -2))));
    safe.fontSize = pixels + "px";
  }
  return safe;
}

export function bulletinRichText(node: BulletinRichNode): string {
  if (node.type === "text") return node.text;
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(bulletinRichText).join(node.type === "paragraph" ? "" : "\n");
}

export function normalizeBulletinRichDocument(value: unknown): BulletinRichDocument | undefined {
  let remainingNodes = bulletinContentLimit + 1;
  let remainingText = bulletinContentLimit;

  function read(node: unknown, depth: number): BulletinRichNode | undefined {
    if (--remainingNodes < 0 || depth > 24) return;
    const { type, text, content, attrs, marks } = fields(node);
    if (type === "hardBreak") return { type };
    if (type === "text") {
      if (typeof text !== "string" || !text || (remainingText -= text.length) < 0) return;
      if (marks !== undefined && (!Array.isArray(marks) || marks.length > 5)) return;
      const safe: RichMark[] = [];
      for (const mark of Array.isArray(marks) ? marks : []) {
        const { type, attrs } = fields(mark);
        if (safe.some(existing => existing.type === type)) return;
        if (type === "bold" || type === "italic" || type === "underline" || type === "strike") {
          safe.push({ type });
        } else if (type === "textStyle") {
          const appearance = textAppearance(attrs);
          if (appearance.color || appearance.fontSize) safe.push({ type, attrs: appearance });
        } else return;
      }
      return safe.length ? { type, text, marks: safe } : { type, text };
    }

    const children: BulletinRichNode[] = [];
    if (content !== undefined) {
      if (!Array.isArray(content) || content.length > remainingNodes) return;
      for (const child of content) {
        const item = read(child, depth + 1);
        if (!item) return;
        children.push(item);
      }
    }
    if (type === "paragraph" && children.every(item => item.type === "text" || item.type === "hardBreak")) {
      const { indent } = fields(attrs);
      return { type, ...(typeof indent === "number" && Number.isInteger(indent) && indent > 0 && indent <= bulletinMaxIndent
        ? { attrs: { indent } } : {}), ...(children.length ? { content: children } : {}) };
    }
    if ((type === "bulletList" || type === "orderedList") && children.length && children.every(item => item.type === "listItem")) {
      const { start } = fields(attrs);
      return { type, ...(type === "orderedList" && typeof start === "number" && Number.isSafeInteger(start) && start !== 1
        ? { attrs: { start } } : {}), content: children };
    }
    if (children.length && children.every((item): item is RichBlock =>
      item.type === "paragraph" || item.type === "bulletList" || item.type === "orderedList")) {
      if (type === "doc" || (type === "listItem" && children[0].type === "paragraph")) return { type, content: children };
    }
  }

  const doc = read(value, 0);
  return doc?.type === "doc" && bulletinRichText(doc).length <= bulletinContentLimit ? doc : undefined;
}

export function bulletinEditorDocument({ content, contentFormat, richContent }: BulletinBody): BulletinRichDocument {
  if (richContent) return richContent;
  const first: RichParagraph = { type: "paragraph", content: [] };
  const blocks = [first];
  let current = first;
  function visit(parts: BulletinInline[], marks: RichMark[] = []) {
    for (const part of parts) {
      if (typeof part !== "string") {
        visit(part.children, [...marks, { type: part.marker === "**" ? "bold" : "italic" }]);
        continue;
      }
      for (const [index, text] of part.split(/\r\n?|\n/).entries()) {
        if (index) {
          current = { type: "paragraph", content: [] };
          blocks.push(current);
        }
        if (text) current.content?.push({ type: "text", text, ...(marks.length ? { marks } : {}) });
      }
    }
  }
  visit(contentFormat === "emphasis" ? bulletinInline(content) : [content]);
  return { type: "doc", content: blocks };
}
