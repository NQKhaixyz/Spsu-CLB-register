"use client";

import { Bold, Italic } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { toggleBulletinEmphasis, type BulletinMarker } from "../lib/bulletin-format";
import { BulletinText } from "./bulletin-text";
import { Button, Field } from "./ui";

export function TextEmphasisEditor({ label, name, formatName, initialText, initialFormat, rows, maxLength, required, busy, autoGrow, onDraftChange }: {
  label: string; name: string; formatName: string; initialText?: string; initialFormat?: "emphasis";
  rows: number; maxLength: number; required?: boolean; busy: boolean;
  autoGrow?: boolean;
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

  const toolbar = <div className="bulletin-format-tools" role="group" aria-label={`Định dạng ${label.toLowerCase()}`}>
    <Button variant="secondary" disabled={busy} onClick={() => emphasize("**")}>
      <Bold size={16} aria-hidden="true" /> Bôi đậm
    </Button>
    <Button variant="secondary" disabled={busy} onClick={() => emphasize("_")}>
      <Italic size={16} aria-hidden="true" /> In nghiêng
    </Button>
  </div>;
  return <>
    {autoGrow && toolbar}
    <Field label={label}>
      <textarea ref={editor} name={name} rows={rows} required={required} maxLength={maxLength}
        className={autoGrow ? "bulletin-grow-editor" : undefined}
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
    <p className="hint bulletin-format-hint" id={hint}>Chọn đoạn chữ rồi bấm Bôi đậm hoặc In nghiêng</p>
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
