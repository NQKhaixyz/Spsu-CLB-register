"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { activityLabels, visibleActivityKinds } from "../lib/activity";
import { monthLabel, type ScoreboardRow } from "../lib/club";
import { Button, Empty, PanelHead } from "./ui";
import { displayMessage } from "../lib/display-message";

const scopes = [
  { id: "mine", label: "Điểm của tôi" },
  { id: "team", label: "Toàn Đội" },
] as const;
export type ScoreScope = (typeof scopes)[number]["id"];
type ScopeProps = { memberId?: string; scope: ScoreScope; onScopeChange: (scope: ScoreScope) => void };

const numbers = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 10 });
export const formatScore = (value: number) => numbers.format(value);
const signedScore = (value: number) => (value > 0 ? "+" : "") + formatScore(value);

const attendanceMetrics = [
  { key: "completed", label: "Trực đủ", unit: "ca" },
  { key: "dutyMissed", label: "Vắng trực không phép", unit: "ca" },
  { key: "attended", label: "Có mặt tại họp", unit: "buổi" },
  { key: "meetingMissed", label: "Vắng họp không phép", unit: "buổi" },
  { key: "passed", label: "Đạt phiếu điểm danh", unit: "phiếu" },
  { key: "lateCount", label: "Đi muộn", unit: "lượt" },
] as const;

function ScoreMetric({ label, count, unit, points }: {
  label: string; count?: number; unit?: string; points?: number;
}) {
  return <div className="score-metric">
    <dt>{label}{points !== undefined && count !== undefined && <small>{formatScore(count)} {unit}</small>}</dt>
    <dd className={points !== undefined && points < 0 ? "score-negative" : points !== undefined && points > 0 ? "score-positive" : undefined}>
      {points !== undefined ? `${signedScore(points)} điểm` : count !== undefined ? `${formatScore(count)} ${unit}` : "—"}
    </dd>
  </div>;
}

export function MobileScoreList({ rows, memberId, period }: {
  rows: ScoreboardRow[]; memberId?: string; period: "tuần" | "tháng";
}) {
  const group = useId();
  return <ul className="mobile-score-list" role="list" aria-label={`Bảng điểm ${period}`}>
    {rows.map(row => <li key={row.memberId}>
      <details name={group}>
        <summary>
          <span className="mobile-score-name">
            <strong>{row.name}</strong>
            {memberId === row.memberId && <small className="score-self">Bạn</small>}
            {row.committeeNames && <small className="score-committee">{row.committeeNames}</small>}
          </span>
          <strong className={`mobile-score-total${row.points < 0 ? " score-negative" : ""}`}>
            {formatScore(row.points)}<span> điểm</span>
          </strong>
          <ChevronDown className="mobile-score-chevron" size={16} aria-hidden="true" />
        </summary>
        <dl className="mobile-score-details">
          {attendanceMetrics.map(({ key, label, unit }) => <ScoreMetric key={key} label={label} unit={unit}
            count={row[key]} points={key !== "attended" ? row.attendancePoints?.[key] : undefined} />)}
          {visibleActivityKinds.map(kind => <ScoreMetric key={kind} label={activityLabels[kind]}
            count={kind === "initiative" || kind === "ddv" || kind === "event" ? row.activityCounts[kind] : undefined}
            unit="lượt" points={row.activityPoints?.[kind]} />)}
        </dl>
      </details>
    </li>)}
  </ul>;
}

export function Scoreboard({ title, period, rows, memberId, scope, onScopeChange }: ScopeProps & {
  title: string; period: "tuần" | "tháng"; rows: ScoreboardRow[];
}) {
  const onlyMine = !!memberId && scope === "mine";
  const visible = onlyMine ? rows.filter(row => row.memberId === memberId) : rows;
  return (
    <section className="panel score-panel score-panel-standard">
      <PanelHead title={title}
        description="Sáng kiến, đồng đẳng viên và sự kiện hiển thị số lượt, điểm theo ban, điểm riêng và điểm trừ hiển thị số điểm"
        action={memberId && (
          <div className="table-tabs score-scope" role="group" aria-label="Phạm vi bảng điểm">
            {scopes.map(item => (
              <button key={item.id} type="button" aria-pressed={scope === item.id}
                className={scope === item.id ? "selected" : ""} onClick={() => onScopeChange(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        )}
      />
      {memberId && !onlyMine && rows.length > 0 && (
        <p className="score-tally"><strong>Tổng điểm toàn Đội</strong> {formatScore(Number(rows.reduce((sum, row) => sum + row.points, 0).toFixed(10)))} · {rows.length} thành viên</p>
      )}
      {visible.length ? (
        <>
        <MobileScoreList key={`${title}:${onlyMine}`} rows={visible} period={period} memberId={onlyMine ? undefined : memberId} />
        <div className="table-scroll score-desktop-table">
          <table className="scoreboard-table" aria-label={`Bảng điểm ${period}`}>
            <thead><tr>
              <th>Thành viên</th><th>Tổng điểm {period}</th><th>Trực đủ</th><th>Vắng trực</th>
              <th>Vắng họp</th><th>Đạt phiếu điểm danh</th><th>Đi muộn</th>
              {visibleActivityKinds.map(kind => <th key={kind}>{activityLabels[kind]}</th>)}
            </tr></thead>
            <tbody>{visible.map(row => (
              <tr key={row.memberId}>
                <td>
                  <span className="score-name">
                    {row.name}{memberId === row.memberId && !onlyMine && <small className="score-self">Bạn</small>}
                    {row.committeeNames && <small className="score-committee">{row.committeeNames}</small>}
                  </span>
                </td>
                <td><strong>{formatScore(row.points)}</strong></td><td>{row.completed}</td><td>{row.dutyMissed}</td>
                <td>{row.meetingMissed}</td><td>{row.passed}</td><td>{row.lateCount}</td>
                {visibleActivityKinds.map(kind => <td key={kind}>{row.activityCounts[kind]}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
        </>
      ) : <Empty title={onlyMine ? `Bạn chưa có trong bảng điểm ${period} này` : `Chưa có thành viên trong ${period} này`} />}
    </section>
  );
}

export function MemberMonthlyScoreboard({ month, ...scopeProps }: ScopeProps & { month: string }) {
  const [result, setResult] = useState<{ rows: ScoreboardRow[] } | { error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/scores/monthly?month=${encodeURIComponent(month)}`, {
          cache: "no-store", signal: controller.signal,
        });
        const data = await response.json() as { month?: string; rows?: ScoreboardRow[]; error?: string };
        if (!response.ok || data.month !== month || !Array.isArray(data.rows))
          throw new Error(data.error || "Không tải được bảng điểm tháng");
        if (!controller.signal.aborted) setResult({ rows: data.rows });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error instanceof Error ? error.message : "Không tải được bảng điểm tháng" });
      }
    }
    void load();
    return () => controller.abort();
  }, [month, attempt]);
  if (!result) return <p className="notice neutral" role="status">Đang tải bảng điểm tháng…</p>;
  if ("error" in result) return (
    <div className="notice amber" role="alert">{displayMessage(result.error)}
      <Button variant="secondary" onClick={() => { setResult(null); setAttempt(n => n + 1); }}>Thử lại</Button>
    </div>
  );
  return <Scoreboard title={monthLabel(month)} period="tháng" rows={result.rows} {...scopeProps} />;
}
