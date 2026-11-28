"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { monthLabel, today, type Club } from "../lib/club";
import { semesterMonthLimit, semesterScores, validSemesterScoreRange, type publishedSemesterScores, type SemesterScoreRange } from "../lib/semester-scores";
import { formatScore } from "../lib/score-format";
import { RankNumber, SharingScoreMetrics } from "./scoreboard";
import { MemberName } from "./member-identity";
import type { SharingScoreIndex } from "../lib/sharing-scores";
import { sharingKinds, sharingScoreLabels } from "../lib/sharing-types";
import { Button, Empty, Field } from "./ui";

const monthChoiceLabel = (month: string) => `${month.slice(5)}/${month.slice(0, 4)}`;
const rangeLabel = (range: SemesterScoreRange) => `${monthChoiceLabel(range.from)} – ${monthChoiceLabel(range.through)}`;

export default function SemesterScoreboard({ club, monthChoices, initialMonth, busy, onSave, onUnpublish, sharingIndex }: {
  club: Club; monthChoices: string[]; initialMonth: string; busy: boolean;
  onSave: (range: SemesterScoreRange) => Promise<boolean>;
  onUnpublish: (range: SemesterScoreRange) => Promise<boolean>;
  sharingIndex: SharingScoreIndex;
}) {
  const [draft, setDraft] = useState<SemesterScoreRange>();
  const published = club.semesterScoreRange;
  const { from, through } = draft ?? published ?? club.semesterScoreDraft ?? { from: initialMonth, through: initialMonth };
  const choices = [...new Set([...monthChoices, from, through])].sort();
  const valid = validSemesterScoreRange(from, through);
  const current = published?.from === from && published.through === through;
  const publicationStatus = published ? `Đang công bố ${rangeLabel(published)}`
    : club.semesterScoreDraft ? `Đã hủy công bố ${rangeLabel(club.semesterScoreDraft)}`
    : "Thành viên xem được khoảng tháng sau khi BĐH công bố";
  const result = useMemo(() => semesterScores(club, from, through, today(), sharingIndex), [club, from, through, sharingIndex]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid && await onSave({ from, through })) setDraft(undefined);
  }

  return <>
    <div className="page-heading score-page-heading"><h1>Tổng kết học kỳ</h1></div>
    <section className="panel score-panel">
      <form className="semester-score-filters" onSubmit={save}>
        <Field label="Từ tháng">
          <select disabled={busy} value={from} onChange={event => {
            const next = event.target.value;
            setDraft({ from: next, through: through < next ? next : through });
          }}>
            {choices.map(month => <option key={month} value={month}>{monthChoiceLabel(month)}</option>)}
          </select>
        </Field>
        <Field label="Đến tháng">
          <select disabled={busy} value={through} onChange={event => setDraft({ from, through: event.target.value })}>
            {choices.filter(month => month >= from).map(month => <option key={month} value={month}>{monthChoiceLabel(month)}</option>)}
          </select>
        </Field>
        <div className="semester-score-actions">
          <Button type="submit" disabled={busy || current || !valid}>Công bố kỳ tổng kết</Button>
          {published && <Button variant="secondary" disabled={busy} onClick={() => onUnpublish(published)}>Hủy công bố</Button>}
          <p className="hint">{valid ? publicationStatus : `Chọn tối đa ${semesterMonthLimit} tháng`}</p>
        </div>
      </form>
      <SemesterResults key={`${from}:${through}`} {...result} />
    </section>
  </>;
}

export function MemberSemesterScoreboard() {
  const [report, setReport] = useState<ReturnType<typeof publishedSemesterScores>>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let request: AbortController | undefined;
    async function load() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch("/api/scores/semester", { signal: controller.signal });
        if (!response.ok) throw new Error("Không tải được bảng điểm học kỳ");
        const data = await response.json() as { report: ReturnType<typeof publishedSemesterScores> };
        if (controller.signal.aborted) return;
        setReport(data.report);
        setError("");
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Không tải được bảng điểm học kỳ");
      }
    }
    function refreshIfVisible() {
      if (!document.hidden) void load();
    }
    void load();
    const timer = window.setInterval(refreshIfVisible, 30_000);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      request?.abort();
    };
  }, [retry]);
  return <>
    <div className="page-heading score-page-heading"><h1>Tổng kết học kỳ</h1>
      {report && <p>Kỳ tổng kết {rangeLabel(report.range)}</p>}
    </div>
    <section className="panel score-panel">
      {report ? <SemesterResults key={rangeLabel(report.range)} months={report.months} rows={report.rows} />
        : error ? <Empty title={error}><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Thử lại</Button></Empty>
        : report === null ? <Empty title="BĐH chưa công bố bảng điểm học kỳ" />
        : <p className="hint semester-loading" role="status">Đang tải bảng điểm học kỳ…</p>}
    </section>
  </>;
}

function SemesterResults({ months, rows }: ReturnType<typeof semesterScores>) {
  const sharingColumns = sharingKinds.filter(kind => rows.some(row => row.sharingAdjustment?.[kind]));
  const accordion = useId();
  const teamTotal = Number(rows.reduce((sum, row) => sum + row.points, 0).toFixed(10));
  return rows.length > 0 ? <>
        <p className="score-tally"><strong>Tổng điểm toàn Đội</strong> {formatScore(teamTotal)} · {rows.length} thành viên</p>
        <ul className="mobile-score-list" role="list" aria-label="Tổng kết học kỳ">
          {rows.map(row => <li key={row.memberId}>
            <details name={accordion}>
              <summary>
                <RankNumber rank={row.rank} />
                <span className="mobile-score-name">
                  <MemberName as="strong" memberId={row.memberId} name={row.name} />
                  <small className="score-committee">{row.committeeNames}</small>
                </span>
                <strong className={`mobile-score-total${row.points < 0 ? " score-negative" : ""}`}>
                  {formatScore(row.points)}<span> điểm</span>
                </strong>
                <ChevronDown className="mobile-score-chevron" size={16} aria-hidden="true" />
              </summary>
              <dl className="mobile-score-details">
                {months.map(month => <div key={month} className="score-metric">
                  <dt>{monthLabel(month)}</dt>
                  <dd>{row.byMonth[month] === undefined ? "—" : `${formatScore(row.byMonth[month])} điểm`}</dd>
                </div>)}
                <SharingScoreMetrics amounts={row.sharingAdjustment} />
              </dl>
            </details>
          </li>)}
        </ul>
        <div className="table-scroll score-desktop-table">
          <table className="scoreboard-table" aria-label="Tổng kết học kỳ">
            <thead><tr>
              <th scope="col" className="score-rank-column">Hạng</th>
              <th scope="col">Thành viên</th>
              <th scope="col" className="score-numeric" aria-sort="descending">Tổng điểm học kỳ</th>
              {months.map(month => <th key={month} scope="col" className="score-numeric">{monthLabel(month)}</th>)}
              {sharingColumns.map(kind => <th key={kind} scope="col" className="score-numeric">{sharingScoreLabels[kind]}</th>)}
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.memberId}>
              <td className="score-rank-column"><RankNumber rank={row.rank} /></td>
              <td><MemberName as="strong" memberId={row.memberId} name={row.name} /><small className="score-committee">{row.committeeNames}</small></td>
              <td className="score-numeric"><strong>{formatScore(row.points)}</strong></td>
              {months.map(month => <td key={month} className="score-numeric">
                {row.byMonth[month] === undefined ? "—" : formatScore(row.byMonth[month])}
              </td>)}
              {sharingColumns.map(kind => <td key={kind} className="score-numeric">{formatScore(row.sharingAdjustment?.[kind] ?? 0)}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
  </> : <Empty title="Chưa có thành viên trong khoảng tháng này" />;
}
