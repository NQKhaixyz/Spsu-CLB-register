"use client";
import { useEffect, useState } from "react";
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

export function Scoreboard({ title, period, rows, memberId, scope, onScopeChange }: ScopeProps & {
  title: string; period: "tuần" | "tháng"; rows: ScoreboardRow[];
}) {
  const onlyMine = !!memberId && scope === "mine";
  const visible = onlyMine ? rows.filter(row => row.memberId === memberId) : rows;
  return (
    <section className="panel">
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
        <p className="score-tally"><strong>Tổng điểm toàn Đội</strong> {Number(rows.reduce((sum, row) => sum + row.points, 0).toFixed(10))} · {rows.length} thành viên</p>
      )}
      {visible.length ? (
        <div className="table-scroll">
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
                <td><strong>{row.points}</strong></td><td>{row.completed}</td><td>{row.dutyMissed}</td>
                <td>{row.meetingMissed}</td><td>{row.passed}</td><td>{row.lateCount}</td>
                {visibleActivityKinds.map(kind => <td key={kind}>{row.activityCounts[kind]}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
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
