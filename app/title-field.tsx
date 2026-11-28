"use client";

import { CaseUpper } from "lucide-react";
import { useRef, useState } from "react";
import { uppercaseSelection } from "../lib/text-case";
import { Button, Field } from "./ui";

export function TitleField({ label, name, value, onChange, maxLength, minLength, placeholder, autoFocus, busy }: {
  label: string; name: string; value: string; onChange: (value: string) => void;
  maxLength: number; minLength?: number; placeholder?: string; autoFocus?: boolean; busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [overLimit, setOverLimit] = useState(false);

  function uppercase() {
    const input = inputRef.current;
    if (!input || busy) return;
    const next = uppercaseSelection(input.value, input.selectionStart ?? 0, input.selectionEnd ?? 0);
    setOverLimit(next.value.length > maxLength);
    if (next.value.length > maxLength) return;
    onChange(next.value);
    requestAnimationFrame(() => {
      if (input !== inputRef.current) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(next.start, next.end);
    });
  }

  return <div className="editor-title-field">
    <Field label={label}>
      <input ref={inputRef} name={name} value={value} onChange={event => {
        setOverLimit(false);
        onChange(event.currentTarget.value);
      }} required maxLength={maxLength} minLength={minLength} placeholder={placeholder} autoFocus={autoFocus} />
    </Field>
    <Button variant="secondary" aria-label={`Viết hoa ${label.toLowerCase()}`} disabled={busy || !value.trim()} onClick={uppercase}
      title="Viết hoa đoạn đã chọn hoặc toàn bộ tiêu đề">
      <CaseUpper size={16} aria-hidden="true" /> Viết hoa
    </Button>
    {overLimit && <p className="form-error" role="alert">Dạng viết hoa vượt giới hạn {maxLength} ký tự</p>}
  </div>;
}
