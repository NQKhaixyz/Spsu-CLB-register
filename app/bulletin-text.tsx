import { Fragment, type ReactNode } from "react";
import type { BulletinBody } from "../lib/bulletin";
import { bulletinInline, type BulletinInline } from "../lib/bulletin-format";
import type { BulletinRichNode } from "../lib/bulletin-rich";

function renderInline(nodes: BulletinInline[]): ReactNode {
  return nodes.map((node, index) => {
    if (typeof node === "string") return node;
    return node.marker === "**" ? <strong key={index}>{renderInline(node.children)}</strong>
      : <em key={index}>{renderInline(node.children)}</em>;
  });
}

function renderRich(node: BulletinRichNode): ReactNode {
  if (node.type === "text") {
    return (node.marks ?? []).reduce<ReactNode>((children, mark) => {
      switch (mark.type) {
        case "bold": return <strong>{children}</strong>;
        case "italic": return <em>{children}</em>;
        case "underline": return <u>{children}</u>;
        case "strike": return <s>{children}</s>;
        case "textStyle": return <span style={mark.attrs}>{children}</span>;
      }
    }, node.text);
  }
  if (node.type === "hardBreak") return <br />;
  const children = node.content?.map((child, index) => <Fragment key={index}>{renderRich(child)}</Fragment>);
  switch (node.type) {
    case "doc": return children;
    case "paragraph": return <p data-indent={node.attrs?.indent}>{children?.length ? children : <br />}</p>;
    case "listItem": return <li>{children}</li>;
    case "bulletList": return <ul>{children}</ul>;
    case "orderedList": return <ol start={node.attrs?.start}>{children}</ol>;
  }
}

export function BulletinText({ content, contentFormat, richContent, preview }: BulletinBody & { preview?: boolean }) {
  if (richContent) return preview ? content : <div className="bulletin-rich-content">{renderRich(richContent)}</div>;
  return <>{contentFormat === "emphasis" ? renderInline(bulletinInline(content)) : content}</>;
}
