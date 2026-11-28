"use client";

import { Extension, type Editor, type RawCommands } from "@tiptap/core";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { closeHistory } from "@tiptap/pm/history";
import { Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold, CaseUpper, Eraser, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, Maximize2,
  Minimize2, Redo2, Strikethrough, Underline, Undo2, type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { bulletinContentLimit, type BulletinBody } from "../lib/bulletin";
import { pastedMarkdownEmphasis } from "../lib/bulletin-format";
import { bulletinEditorDocument, bulletinMaxIndent, bulletinRichText, normalizeBulletinRichDocument } from "../lib/bulletin-rich";
import { vietnameseUppercase } from "../lib/text-case";

const paragraphIndent = Extension.create({
  name: "bulletinParagraphIndent",
  addGlobalAttributes() {
    return [{
      types: ["paragraph"],
      attributes: {
        indent: {
          default: 0,
          parseHTML: element => {
            const value = Number(element.getAttribute("data-indent"));
            return Number.isInteger(value) && value >= 0 && value <= bulletinMaxIndent ? value : 0;
          },
          renderHTML: attrs => attrs.indent ? { "data-indent": attrs.indent } : {},
        },
      },
    }];
  },
});

const extensions = [
  StarterKit.configure({ blockquote: false, code: false, codeBlock: false, heading: false, horizontalRule: false,
    link: false, trailingNode: false }),
  TextStyle, Color, FontSize, paragraphIndent,
];

const textSizes = [
  ["", "Cỡ chữ"],
  ["13px", "Nhỏ"],
  ["16px", "Vừa"],
  ["21px", "Lớn"],
  ["27px", "Rất lớn"],
] as const;
const textColors = [
  ["", "Màu chữ"],
  ["#316348", "Xanh rêu"],
  ["#234f8d", "Xanh lam"],
  ["#992d47", "Đỏ hồng"],
  ["#825015", "Nâu hổ phách"],
  ["#694199", "Tím"],
] as const;

function format(editor: Editor) {
  return editor.chain().focus().command(({ tr }) => {
    closeHistory(tr);
    return true;
  });
}

function indentParagraphs(delta: number): ReturnType<RawCommands["command"]> {
  return ({ tr, dispatch }) => {
    if (!dispatch) return true;
    tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
      if (node.type.name !== "paragraph") return;
      const indent = delta === 0 ? 0 : Math.min(bulletinMaxIndent, Math.max(0, node.attrs.indent + delta));
      if (indent !== node.attrs.indent) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent });
      return false;
    });
    return true;
  };
}

function indent(editor: Editor, delta: 1 | -1) {
  const chain = format(editor);
  if (editor.isActive("listItem")) {
    return (delta > 0 ? chain.sinkListItem("listItem") : chain.liftListItem("listItem")).run();
  }
  return chain.command(indentParagraphs(delta)).run();
}

function uppercaseEditor(editor: Editor) {
  const { state, view } = editor;
  const { selection, doc, schema } = state;
  const from = selection.empty ? 0 : selection.from;
  const to = selection.empty ? doc.content.size : selection.to;
  const transaction = closeHistory(state.tr);
  doc.nodesBetween(from, to, (node, position) => {
    if (node.text === undefined) return;
    const start = Math.max(from, position);
    const end = Math.min(to, position + node.nodeSize);
    const original = node.text.slice(start - position, end - position);
    const upper = vietnameseUppercase(original);
    if (upper === original) return;
    transaction.replaceWith(transaction.mapping.map(start), transaction.mapping.map(end), schema.text(upper, node.marks));
  });
  if (transaction.docChanged) {
    if (!normalizeBulletinRichDocument(transaction.doc.toJSON())) return false;
    if (selection instanceof TextSelection && !selection.empty) {
      const start = transaction.mapping.map(selection.from, -1);
      const end = transaction.mapping.map(selection.to, 1);
      const forward = selection.anchor <= selection.head;
      transaction.setSelection(TextSelection.create(transaction.doc, forward ? start : end, forward ? end : start));
    }
    view.dispatch(transaction.scrollIntoView());
  }
  view.focus();
  return true;
}

function Tool({ label, icon: Icon, disabled, active, onClick }: {
  label: string; icon: LucideIcon; disabled?: boolean; active?: boolean; onClick: () => void;
}) {
  return <button type="button" className="bulletin-rich-tool" title={label} aria-label={label} aria-pressed={active}
    disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onClick}>
    <Icon aria-hidden="true" size={17} />
  </button>;
}

function FormatSelect({ label, value, disabled, options, onChange }: {
  label: string; value: string; disabled?: boolean; options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return <select className="bulletin-rich-select" aria-label={label} title={label} disabled={disabled} value={value}
    onChange={event => onChange(event.currentTarget.value)}>
    {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    {!!value && !options.some(([key]) => key === value) && <option value={value}>Tùy chỉnh</option>}
  </select>;
}

function EditorTools({ editor, disabled, expanded, onExpand }: {
  editor: Editor; disabled: boolean; expanded: boolean; onExpand: () => void;
}) {
  const [uppercaseError, setUppercaseError] = useState(false);
  const state = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    bullets: editor.isActive("bulletList"),
    numbers: editor.isActive("orderedList"),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    inList: editor.isActive("listItem"),
    canNest: editor.can().sinkListItem("listItem"),
    canLift: editor.can().liftListItem("listItem"),
    size: editor.getAttributes("textStyle").fontSize as string | undefined,
    color: editor.getAttributes("textStyle").color as string | undefined,
  }) });
  const tool = (label: string, icon: LucideIcon, onClick: () => void, active?: boolean, unavailable = false): ReactNode =>
    <Tool {...{ label, icon, onClick, active }} disabled={disabled || unavailable} />;

  return <><div className="bulletin-rich-tools" role="group" aria-label="Định dạng nội dung">
    <div className="bulletin-rich-tool-group">
      {tool("Bôi đậm", Bold, () => format(editor).toggleBold().run(), state.bold)}
      {tool("In nghiêng", Italic, () => format(editor).toggleItalic().run(), state.italic)}
      {tool("Gạch dưới", Underline, () => format(editor).toggleUnderline().run(), state.underline)}
      {tool("Gạch ngang", Strikethrough, () => format(editor).toggleStrike().run(), state.strike)}
      {tool("Viết hoa", CaseUpper, () => setUppercaseError(!uppercaseEditor(editor)))}
    </div>
    <div className="bulletin-rich-tool-group">
      <FormatSelect label="Cỡ chữ" value={state.size ?? ""} options={textSizes} disabled={disabled}
        onChange={value => (value ? format(editor).setFontSize(value) : format(editor).unsetFontSize()).run()} />
      <FormatSelect label="Màu chữ" value={state.color ?? ""} options={textColors} disabled={disabled}
        onChange={value => (value ? format(editor).setColor(value) : format(editor).unsetColor()).run()} />
      {tool("Xóa định dạng", Eraser, () => format(editor).unsetAllMarks().clearNodes().command(indentParagraphs(0)).run())}
    </div>
    <div className="bulletin-rich-tool-group">
      {tool("Danh sách gạch đầu dòng", List, () => format(editor).toggleBulletList().run(), state.bullets)}
      {tool("Danh sách đánh số", ListOrdered, () => format(editor).toggleOrderedList().run(), state.numbers)}
      {tool("Tăng thụt lề", IndentIncrease, () => indent(editor, 1), undefined, state.inList && !state.canNest)}
      {tool("Giảm thụt lề", IndentDecrease, () => indent(editor, -1), undefined, state.inList && !state.canLift)}
    </div>
    <div className="bulletin-rich-tool-group">
      {tool("Hoàn tác", Undo2, () => editor.chain().focus().undo().run(), undefined, !state.canUndo)}
      {tool("Làm lại", Redo2, () => editor.chain().focus().redo().run(), undefined, !state.canRedo)}
      <Tool label={expanded ? "Thu gọn soạn thảo" : "Mở rộng soạn thảo"} icon={expanded ? Minimize2 : Maximize2}
        active={expanded} disabled={disabled} onClick={onExpand} />
    </div>
  </div>
  {uppercaseError && <p className="form-error" role="alert">Rút gọn nội dung trước khi viết hoa</p>}
  </>;
}

export default function BulletinRichEditor({ initial, busy, expanded, onExpand, onDraftChange }: {
  initial: BulletinBody; busy: boolean; expanded: boolean; onExpand: () => void;
  onDraftChange: (body: BulletinBody | undefined) => void;
}) {
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    content: bulletinEditorDocument(initial),
    editable: !busy,
    editorProps: {
      attributes: { class: "bulletin-editable bulletin-rich-content", role: "textbox", "aria-label": "Nội dung",
        "aria-multiline": "true", tabindex: "0" },
      handlePaste(view, event, slice) {
        const plain = event.clipboardData?.getData("text/plain");
        if (!plain || plain.length > bulletinContentLimit) return false;
        let styled = false;
        slice.content.descendants(node => {
          if (node.marks.length || node.type.name === "bulletList" || node.type.name === "orderedList") styled = true;
        });
        if (styled) return false;
        const emphasis = pastedMarkdownEmphasis(plain);
        if (!emphasis) return false;
        const doc = view.state.schema.nodeFromJSON(bulletinEditorDocument({ content: emphasis, contentFormat: "emphasis" }));
        view.dispatch(view.state.tr.replaceSelection(Slice.maxOpen(doc.content)).setMeta("uiEvent", "paste").scrollIntoView());
        return true;
      },
    },
    onUpdate({ editor }) {
      const richContent = normalizeBulletinRichDocument(editor.getJSON());
      onDraftChange(richContent ? { content: bulletinRichText(richContent), richContent } : undefined);
    },
  });

  useEffect(() => { editor?.setEditable(!busy, false); }, [editor, busy]);

  return <section className="bulletin-editor" aria-label="Soạn nội dung">
    <span className="bulletin-editor-label">Nội dung</span>
    {editor && <EditorTools editor={editor} disabled={busy} expanded={expanded} onExpand={onExpand} />}
    <EditorContent editor={editor} />
  </section>;
}
