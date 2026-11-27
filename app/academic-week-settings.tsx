"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { academicWeekForClub } from "../lib/availability";
import { addDays, dateLabel, today, weekId, type Club } from "../lib/club";
import { Button, Field, PanelHead } from "./ui";

export function AcademicWeekSettings({ club, busy, onSave }: {
  club: Club; busy: boolean; onSave: (date: string, weekNumber: number) => Promise<boolean>;
}) {
  const [date, setDate] = useState(today);
  const [enteredWeek, setEnteredWeek] = useState<string | null>(null);
  const start = date ? weekId(date) : "";
  const suggested = start ? academicWeekForClub(club, start) : 0;
  const weekNumber = enteredWeek ?? (suggested >= 1 && suggested <= 53 ? String(suggested) : "");
  const anchors = club.academicWeekAnchors ?? [];

  function chooseDate(value: string) {
    setDate(value);
    setEnteredWeek(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onSave(date, Number(weekNumber))) setEnteredWeek(null);
  }

  return <section className="panel settings-card">
    <PanelHead title="Mốc tuần học"
      description="Chọn một ngày và số tuần tương ứng. Mốc có hiệu lực từ thứ Hai của tuần được chọn" />
    <form onSubmit={save}>
      <div className="form-grid">
        <Field label="Ngày trong tuần">
          <input type="date" required value={date} onChange={event => chooseDate(event.target.value)} />
        </Field>
        <Field label="Số tuần học">
          <input type="number" inputMode="numeric" min={1} max={53} step={1} required value={weekNumber}
            onChange={event => setEnteredWeek(event.target.value)} />
        </Field>
      </div>
      {start && <p className="notice neutral academic-week-preview" aria-live="polite">
        {weekNumber && <strong>Tuần {weekNumber} · </strong>}{dateLabel(start, true)} – {dateLabel(addDays(start, 6), true)}
      </p>}
      <Button type="submit" disabled={busy}><Check size={16} aria-hidden="true" /> Lưu mốc tuần</Button>
      {anchors.length > 0 && <details className="academic-week-anchors">
        <summary>Mốc đã lưu</summary>
        <ul>
          {anchors.map(anchor => <li key={anchor.anchorDate}>
            <button type="button" className="text-button" onClick={() => chooseDate(anchor.anchorDate)}>
              Tuần {anchor.anchorWeek} · {dateLabel(anchor.anchorDate, true)}
            </button>
          </li>)}
        </ul>
      </details>}
    </form>
  </section>;
}
