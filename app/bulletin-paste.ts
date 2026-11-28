import { escapeBulletinText, type BulletinMarker } from "../lib/bulletin-format";

type TextStyle = { bold: boolean; italic: boolean };
type TextRun = TextStyle & { text: string };
const plainStyle: TextStyle = { bold: false, italic: false };
const blockElements = new Set(["ARTICLE", "BLOCKQUOTE", "DIV", "LI", "OL", "P", "PRE", "SECTION", "TR", "UL"]);
const skippedElements = new Set(["IFRAME", "NOSCRIPT", "SCRIPT", "STYLE", "TEMPLATE"]);

export function pastedHtmlEmphasis(html: string, plain: string) {
  if (!html) return;
  const template = document.createElement("template");
  // The template stays detached. Only its text and supported emphasis are retained.
  template.innerHTML = html;
  const runs: TextRun[] = [];
  function lineBreak() {
    if (runs.length && !runs.at(-1)?.text.endsWith("\n")) runs.push({ ...plainStyle, text: "\n" });
  }
  function visit(node: Node, style: TextStyle) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) runs.push({ ...style, text });
      return;
    }
    if (!(node instanceof HTMLElement) || skippedElements.has(node.tagName)) return;
    if (node.tagName === "BR") {
      runs.push({ ...plainStyle, text: "\n" });
      return;
    }
    const block = blockElements.has(node.tagName);
    if (block) lineBreak();
    const { fontWeight, fontStyle } = node.style;
    const bold = fontWeight ? fontWeight === "bold" || fontWeight === "bolder" || Number(fontWeight) >= 600
      : style.bold || node.tagName === "B" || node.tagName === "STRONG";
    const italic = fontStyle ? fontStyle === "italic" || fontStyle.startsWith("oblique")
      : style.italic || node.tagName === "I" || node.tagName === "EM";
    node.childNodes.forEach(child => visit(child, { bold, italic }));
    if (block) lineBreak();
  }
  template.content.childNodes.forEach(node => visit(node, plainStyle));
  if (!runs.some(run => (run.bold || run.italic) && run.text.trim())) return;

  let markup = "";
  let space = "";
  let open: BulletinMarker[] = [];
  for (const { text, bold, italic } of runs) {
    const content = text.trim();
    if (!content) {
      space += text;
      continue;
    }
    const markers: BulletinMarker[] = [];
    if (bold) markers.push("**");
    if (italic) markers.push("_");
    let kept = 0;
    while (kept < open.length && markers.includes(open[kept])) kept += 1;
    const shared = open.slice(0, kept);
    const added = markers.filter(marker => !shared.includes(marker));
    markup += open.slice(kept).reverse().join("") + space + text.slice(0, text.length - text.trimStart().length);
    markup += added.join("") + escapeBulletinText(content);
    open = [...shared, ...added];
    space = text.slice(text.trimEnd().length);
  }
  const formatted = markup + open.reverse().join("");
  if (!plain.trim()) return formatted;
  const leading = plain.slice(0, plain.length - plain.trimStart().length);
  const trailing = plain.slice(plain.trimEnd().length);
  return leading + formatted.trim() + trailing;
}
