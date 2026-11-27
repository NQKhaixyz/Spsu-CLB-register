"use client";

import { eventPointsPerRound, eventRoundQuantityLimit, isEventRoundQuantity } from "../lib/activity";
import { Field } from "./ui";

export function EventRoundField({ value, onChange, min = 0, showPoints = true }: {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  showPoints?: boolean;
}) {
  const count = Number(value);
  return <>
    <Field label="Số lượt tham gia">
      <input name="quantity" type="number" inputMode="numeric" min={min} max={eventRoundQuantityLimit}
        step={1} required value={value} onChange={event => onChange(event.target.value)} />
    </Field>
    {showPoints && value && isEventRoundQuantity(count) && count >= min &&
      <p className="hint">Điểm sự kiện dự kiến <strong>{(count * eventPointsPerRound).toLocaleString("vi-VN")} điểm</strong></p>}
  </>;
}
