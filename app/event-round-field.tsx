"use client";

import { eventQuantityPoints, eventRoundQuantityLimit, isEventRoundQuantity } from "../lib/activity";
import { formatScore } from "../lib/score-format";
import { Field } from "./ui";

export function EventRoundField({ value, onChange, min = 0, pointsPerRound }: {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  pointsPerRound?: number;
}) {
  const count = Number(value);
  return <>
    <Field label="Số lượt tham gia">
      <input name="quantity" type="number" inputMode="numeric" min={min} max={eventRoundQuantityLimit}
        step={1} required value={value} onChange={event => onChange(event.target.value)} />
    </Field>
    {pointsPerRound !== undefined && value !== "" && isEventRoundQuantity(count) && count >= min &&
      <p className="hint">Điểm sự kiện dự kiến <strong>{formatScore(eventQuantityPoints(pointsPerRound, count))} điểm</strong></p>}
  </>;
}
