"use client";

import { Bold, CaseUpper, Italic } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ClipboardEvent } from "react";
import { escapeBulletinText, pastedMarkdownEmphasis, toggleBulletinEmphasis, type BulletinMarker } from "../lib/bulletin-format";
import { uppercaseSelection } from "../lib/text-case";
import { pastedHtmlEmphasis } from "./bulletin-paste";
import { BulletinText } from "./bulletin-text";
import { Button, Field } from "./ui";

export function TextEmphasisEditor({ label, name, formatName, initialText, initialFormat, rows, maxLength, required, busy, autoGrow, autoFormatPaste, onDraftChange }: {
  label: string; name: string; formatName: string; initialText?: string; initialFormat?: "emphasis";
  rows: number; maxLength: number; required?: boolean; busy: boolean;
  autoGrow?: boolean; autoFormatPaste?: boolean;
  onDraftChange?: (content: string, format?: "emphasis") => void;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [format, setFormat] = useState(initialFormat);
  const [error, setError] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const hint = useId();

  useLayoutEffect(() => {
    const input = editor.current;
    if (!autoGrow || !input) return;
    function fit(input: HTMLTextAreaElement) {
      input.style.height = "auto";
      input.style.height = (input.scrollHeight + input.offsetHeight - input.clientHeight) + "px";
    }
    const resize = () => fit(input);
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [autoGrow, text]);

  function emphasize(marker: BulletinMarker) {
    const input = editor.current;
    if (!input || busy) return;
    const next = toggleBulletinEmphasis(input.value, input.selectionStart, input.selectionEnd, marker, !!format);
    if (next.value.length > maxLength) {
      setError("Nội dung đã đạt giới hạn ký tự, hãy rút gọn rồi thử định dạng lại");
      return;
    }
    setError("");
    setText(next.value);
    setFormat("emphasis");
    onDraftChange?.(next.value, "emphasis");
    requestAnimationFrame(() => {
      if (editor.current !== input) return;
      input.focus();
      input.setSelectionRange(next.start, next.end);
    });
  }

  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const input = event.currentTarget;
    const { clipboardData } = event;
    const plain = clipboardData.getData("text/plain");
    if (plain.length > maxLength) return;
    const html = clipboardData.getData("text/html");
    const imported = pastedMarkdownEmphasis(plain) ?? (html.length <= maxLength * 100 ? pastedHtmlEmphasis(html, plain) : undefined);
    if (!imported) return;
    event.preventDefault();
    const before = input.value.slice(0, input.selectionStart);
    const after = input.value.slice(input.selectionEnd);
    const prefix = format ? before : escapeBulletinText(before);
    const next = prefix + imported + (format ? after : escapeBulletinText(after));
    if (next.length > maxLength) {
      setError("Nội dung dán vượt giới hạn ký tự");
      return;
    }
    setError("");
    setText(next);
    setFormat("emphasis");
    onDraftChange?.(next, "emphasis");
    const cursor = prefix.length + imported.length;
    requestAnimationFrame(() => {
      if (editor.current === input) input.setSelectionRange(cursor, cursor);
    });
  }

  function uppercase() {
    const input = editor.current;
    if (!input || busy) return;
    const next = uppercaseSelection(input.value, input.selectionStart, input.selectionEnd);
    if (next.value.length > maxLength) {
      setError(`Dạng viết hoa vượt giới hạn ${maxLength} ký tự`);
      return;
    }
    setError("");
    setText(next.value);
    onDraftChange?.(next.value, format);
    requestAnimationFrame(() => {
      if (editor.current !== input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(next.start, next.end);
    });
  }

  const toolbar = <div className="bulletin-format-tools" role="group" aria-label={`Định dạng ${label.toLowerCase()}`}>
    <Button variant="secondary" disabled={busy} onClick={() => emphasize("**")}>
      <Bold size={16} aria-hidden="true" /> Bôi đậm
    </Button>
    <Button variant="secondary" disabled={busy} onClick={() => emphasize("_")}>
      <Italic size={16} aria-hidden="true" /> In nghiêng
    </Button>
    <Button variant="secondary" disabled={busy || !text.trim()} onClick={uppercase} title="Viết hoa đoạn đã chọn hoặc toàn bộ nội dung">
      <CaseUpper size={16} aria-hidden="true" /> Viết hoa
    </Button>
  </div>;
  return <>
    {autoGrow && toolbar}
    <Field label={label}>
      <textarea ref={editor} name={name} rows={rows} required={required} maxLength={maxLength}
        className={autoGrow ? "bulletin-grow-editor" : undefined}
        onPaste={autoFormatPaste ? paste : undefined}
        value={text} onChange={event => {
          const value = event.target.value;
          setText(value);
          setError("");
          onDraftChange?.(value, format);
        }}
        aria-describedby={hint} onKeyDown={event => {
          const key = event.key.toLowerCase();
          if (!(event.ctrlKey || event.metaKey) || (key !== "b" && key !== "i")) return;
          event.preventDefault();
          emphasize(key === "b" ? "**" : "_");
        }} />
    </Field>
    {format && <input type="hidden" name={formatName} value={format} />}
    {!autoGrow && toolbar}
    <p className="hint bulletin-format-hint" id={hint}>Bôi chọn đoạn chữ để định dạng. Nút Viết hoa áp dụng cho toàn bộ nếu chưa chọn đoạn nào</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!onDraftChange && format && text.trim() && <section className="bulletin-format-preview" aria-label="Xem trước nội dung">
      {autoGrow ? <details open>
        <summary>Xem trước nội dung</summary>
        <div className="bulletin-fulltext"><BulletinText content={text} contentFormat={format} /></div>
      </details> : <>
        <small>Xem trước nội dung</small>
        <div className="bulletin-fulltext"><BulletinText content={text} contentFormat={format} /></div>
      </>}
    </section>}
  </>;
}
