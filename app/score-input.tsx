"use client";

import type { ComponentPropsWithoutRef } from "react";
import { normalizeScoreInput, scoreInputPattern } from "../lib/score-format";

type ScoreInputProps = Omit<ComponentPropsWithoutRef<"input">, "type" | "inputMode" | "pattern" | "min" | "max" | "step">;

export function ScoreInput({ onChange, ...props }: ScoreInputProps) {
  return <input {...props} type="text" inputMode="decimal" pattern={scoreInputPattern} onChange={event => {
    const input = event.currentTarget;
    const normalized = normalizeScoreInput(input.value);
    if (normalized !== input.value) {
      const { selectionStart, selectionEnd } = input;
      input.value = normalized;
      input.setSelectionRange(selectionStart, selectionEnd);
    }
    onChange?.(event);
  }} />;
}
