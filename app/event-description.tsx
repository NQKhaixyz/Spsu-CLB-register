import { pastedMarkdownEmphasis } from "../lib/bulletin-format";
import { BulletinText } from "./bulletin-text";

function isDivider(line: string) {
  const dashes = line.replace(/\s/g, "");
  return /^-{3,}$/.test(dashes) || (/^[-–—]{2,}$/.test(dashes) && /[–—]/.test(dashes));
}

export function EventDescription({ content, contentFormat }: { content: string; contentFormat?: "emphasis" }) {
  const lines = content.split(/\r?\n/);
  const blocks: (string | null)[] = [];
  let start = 0;
  lines.forEach((line, index) => {
    if (!isDivider(line)) return;
    if (start < index) blocks.push(lines.slice(start, index).join("\n"));
    blocks.push(null);
    start = index + 1;
  });
  if (start < lines.length) blocks.push(lines.slice(start).join("\n"));
  return <div className="event-description">
    {blocks.map((block, index) => {
      if (block === null) return <hr key={index} />;
      const imported = contentFormat ? undefined : pastedMarkdownEmphasis(block);
      return <div key={index}><BulletinText content={imported ?? block} contentFormat={imported ? "emphasis" : contentFormat} /></div>;
    })}
  </div>;
}
