import type { ReactNode } from "react";
import { bulletinInline, type BulletinInline } from "../lib/bulletin-format";

function renderInline(nodes: BulletinInline[]): ReactNode {
  return nodes.map((node, index) => {
    if (typeof node === "string") return node;
    return node.marker === "**" ? <strong key={index}>{renderInline(node.children)}</strong>
      : <em key={index}>{renderInline(node.children)}</em>;
  });
}

export function BulletinText({ content, contentFormat }: { content: string; contentFormat?: "emphasis" }) {
  return <>{contentFormat === "emphasis" ? renderInline(bulletinInline(content)) : content}</>;
}
