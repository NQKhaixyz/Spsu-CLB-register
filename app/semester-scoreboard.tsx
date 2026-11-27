"use client";

import { ChevronDown } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { monthLabel, type Club } from "../lib/club";
import { semesterScores } from "../lib/semester-scores";
import { formatScore, RankNumber } from "./scoreboard";
import { Empty, Field } from "./ui";
import { MemberName } from "./member-identity";

const monthChoiceLabel = (month: string) => `${month.slice(5)}/${month.slice(0, 4)}`;

export default function SemesterScoreboard({ club, monthChoices, initialMonth }: {
  club: Club; monthChoices: string[]; initialMonth: string;
}) {
  const [range, setRange] = useState(() => ({ from: initialMonth, through: initialMonth }));
  const accordion = useId();
  const { months, rows } = useMemo(() => semesterScores(club, range.from, range.through), [club, range]);
  const teamTotal = Number(rows.reduce((sum, row) => sum + row.points, 0).toFixed(10));
  return <>
    <div className="page-heading score-page-heading"><h1>Tổng kết học kỳ</h1></div>
    <section className="panel score-panel">
      <div className="semester-score-filters">
        <Field label="Từ tháng">
          <select value={range.from} onChange={event => {
            const from = event.target.value;
            setRange(current => ({ from, through: current.through < from ? from : current.through }));
          }}>
            {monthChoices.map(month => <option key={month} value={month}>{monthChoiceLabel(month)}</option>)}
          </select>
        </Field>
        <Field label="Đến tháng">
          <select value={range.through} onChange={event => {
            const through = event.target.value;
            setRange(current => ({ ...current, through }));
          }}>
            {monthChoices.filter(month => month >= range.from).map(month => <option key={month} value={month}>{monthChoiceLabel(month)}</option>)}
          </select>
        </Field>
      </div>
      {rows.length > 0 ? <>
        <p className="score-tally"><strong>Tổng điểm toàn Đội</strong> {formatScore(teamTotal)} · {rows.length} thành viên</p>
        <ul key={`${range.from}:${range.through}`} className="mobile-score-list" role="list" aria-label="Tổng kết học kỳ">
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
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.memberId}>
              <td className="score-rank-column"><RankNumber rank={row.rank} /></td>
              <td><MemberName as="strong" memberId={row.memberId} name={row.name} /><small className="score-committee">{row.committeeNames}</small></td>
              <td className="score-numeric"><strong>{formatScore(row.points)}</strong></td>
              {months.map(month => <td key={month} className="score-numeric">
                {row.byMonth[month] === undefined ? "—" : formatScore(row.byMonth[month])}
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </> : <Empty title="Chưa có thành viên trong khoảng tháng này" />}
    </section>
  </>;
}
