"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { activityLabels, visibleActivityKinds } from "../lib/activity";
import { addDays, dateLabel, monthLabel, type ScoreboardRow } from "../lib/club";
import { monthlyScoreTier, rankScoreRows } from "../lib/score-ranks";
import { Avatar, Button, Empty, PanelHead } from "./ui";
import { displayMessage } from "../lib/display-message";

const scopes = [
  { id: "mine", label: "Điểm của tôi" },
  { id: "team", label: "Toàn Đội" },
] as const;
export type ScoreScope = (typeof scopes)[number]["id"];
type ScopeProps = { memberId?: string; scope: ScoreScope; onScopeChange: (scope: ScoreScope) => void };
type ScorePeriod = "tuần" | "tháng";
type ScoreTier = NonNullable<ReturnType<typeof monthlyScoreTier>>;
type RankedScoreRow = ScoreboardRow & { rank?: number; tier?: ScoreTier };
type ScoreTableRow = ScoreboardRow & { studentId?: string; avatarId?: string; lateDeduction?: number };

const numbers = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 10 });
export const formatScore = (value: number) => numbers.format(value);
const signedScore = (value: number) => (value > 0 ? "+" : "") + formatScore(value);

const attendanceMetrics = {
  completed: { label: "Trực đủ", unit: "ca" },
  dutyMissed: { label: "Vắng trực không phép", unit: "ca" },
  attended: { label: "Có mặt tại họp", unit: "buổi" },
  meetingMissed: { label: "Vắng họp không phép", unit: "buổi" },
  passed: { label: "Đạt phiếu điểm danh", unit: "phiếu" },
  lateCount: { label: "Đi muộn", unit: "lượt" },
} as const;
const weekDetailOrder = ["completed", "dutyMissed", "attended", "meetingMissed", "passed", "lateCount"] as const;
const monthDetailOrder = ["completed", "dutyMissed", "lateCount", "attended", "meetingMissed", "passed"] as const;

const weeklyColumns = [
  { key: "completed", label: "Trực đủ" },
  { key: "dutyMissed", label: "Vắng trực" },
  { key: "meetingMissed", label: "Vắng họp" },
  { key: "passed", label: "Đạt phiếu điểm danh" },
  { key: "lateCount", label: "Đi muộn" },
] as const;
const monthlyColumns = [
  { key: "completed", label: "Trực đủ", start: true },
  { key: "dutyMissed", label: "Vắng trực không phép" },
  { key: "lateCount", label: "Đi muộn" },
  { key: "lateDeduction", label: "Trừ đi muộn" },
  { key: "meetingMissed", label: "Vắng họp không phép", start: true },
  { key: "passed", label: "Đạt phiếu điểm danh" },
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

function RankCrest() {
  return <span className="score-rank-crest" aria-hidden="true"><span /></span>;
}

function RankTitle({ label }: { label: string }) {
  return <span className="score-rank-title"><strong>{label}</strong></span>;
}

export function RankNumber({ rank }: { rank: number }) {
  return <span className="score-rank-number" title={`Hạng ${rank}`}>{rank}</span>;
}

function ScoreRank({ tier, rank }: { tier?: ScoreTier; rank?: number }) {
  if (!tier) return rank === undefined ? <span className="muted" aria-hidden="true">—</span> : <RankNumber rank={rank} />;
  return <span className="score-rank-plate score-rank-frame" data-tier={tier.id}>
    <RankCrest />
    <RankTitle label={tier.label} />
  </span>;
}

function MobileScoreList({ rows, memberId, period }: {
  rows: RankedScoreRow[]; memberId?: string; period: ScorePeriod;
}) {
  const group = useId();
  const metrics = period === "tuần" ? weekDetailOrder : monthDetailOrder;
  return <ul className="mobile-score-list" role="list" aria-label={`Bảng điểm ${period}`}>
    {rows.map(row => {
      const { tier, rank } = row;
      return <li key={row.memberId}>
        <details name={group}>
          <summary className={tier ? "score-rank-frame" : undefined} data-tier={tier?.id}>
            {tier ? <RankCrest /> : <ScoreRank rank={rank} />}
            <span className="mobile-score-name">
              {tier && <RankTitle label={tier.label} />}
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
            {metrics.map(key => <ScoreMetric key={key} {...attendanceMetrics[key]}
              count={row[key]} points={key !== "attended" ? row.attendancePoints?.[key] : undefined} />)}
            {visibleActivityKinds.map(kind => <ScoreMetric key={kind} label={activityLabels[kind]}
              count={kind === "initiative" || kind === "ddv" || kind === "event" ? row.activityCounts[kind] : undefined}
              unit="lượt" points={row.activityPoints?.[kind]} />)}
          </dl>
        </details>
      </li>;
    })}
  </ul>;
}

export function Scoreboard({ title, period, rows, memberId, scope, onScopeChange, monthRanks, frameNotice, adminReport = false }: ScopeProps & {
  title: string; period: ScorePeriod; rows: ScoreTableRow[];
  monthRanks?: ReadonlyMap<string, number>; frameNotice?: ReactNode; adminReport?: boolean;
}) {
  const weekly = period === "tuần";
  const onlyMine = !!memberId && scope === "mine";
  const ranksReady = !weekly || monthRanks !== undefined;
  const ranked = rankScoreRows(rows).map(({ rank, ...row }) => {
    const frameRank = weekly ? monthRanks?.get(row.memberId) : rank;
    const tier = frameRank === undefined ? undefined : monthlyScoreTier(frameRank);
    return { ...row, tier, rank: ranksReady && !tier ? rank : undefined };
  });
  const visible = onlyMine ? ranked.filter(row => row.memberId === memberId) : ranked;
  const columns = weekly ? weeklyColumns : monthlyColumns.filter(column => adminReport || column.key !== "lateDeduction");
  return (
    <section className={`panel score-panel${adminReport ? "" : " score-panel-standard"}`}>
      <PanelHead title={title}
        description={adminReport
          ? "Điểm họp và phiếu điểm danh theo ngày họp, điểm trực theo ngày trực"
          : "Sáng kiến, đồng đẳng viên và sự kiện hiển thị số lượt, điểm theo ban, điểm riêng và điểm trừ hiển thị số điểm"}
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
      {frameNotice}
      {memberId && !onlyMine && rows.length > 0 && (
        <p className="score-tally"><strong>Tổng điểm toàn Đội</strong> {formatScore(Number(rows.reduce((sum, row) => sum + row.points, 0).toFixed(10)))} · {rows.length} thành viên</p>
      )}
      {visible.length ? (
        <>
        <MobileScoreList key={`${title}:${onlyMine}`} rows={visible} period={period}
          memberId={onlyMine ? undefined : memberId} />
        <div className="table-scroll score-desktop-table">
          <table className="scoreboard-table" aria-label={`Bảng điểm ${period}`}>
            <thead><tr>
              <th className="score-rank-column" scope="col">Hạng</th>
              <th scope="col">Thành viên</th>
              <th scope="col" className="score-numeric" aria-sort="descending">Tổng điểm {period}</th>
              {adminReport && <th scope="col">MSSV</th>}
              {columns.map(column => <th scope="col" key={column.key}
                className={`score-numeric${"start" in column ? " score-column-group-start" : ""}`}>{column.label}</th>)}
              {visibleActivityKinds.map(kind => <th scope="col" key={kind}
                className={`score-numeric${!weekly && (kind === "initiative" || kind === "committee") ? " score-column-group-start" : ""}`}>
                {activityLabels[kind]}
              </th>)}
            </tr></thead>
            <tbody>{visible.map((row, index) => {
              const name = <span className="score-name">
                <strong>{row.name}</strong>{memberId === row.memberId && !onlyMine && <small className="score-self">Bạn</small>}
                {row.committeeNames && <small className="score-committee">{row.committeeNames}</small>}
              </span>;
              return <tr key={row.memberId}>
                <td className="score-rank-column"><ScoreRank tier={row.tier} rank={row.rank} /></td>
                <td>{adminReport ? <div className="person-cell">
                  <Avatar name={row.name} photoId={row.avatarId} index={index} />{name}
                </div> : name}</td>
                <td className="score-numeric">{adminReport ? <span className={`score ${row.points < 0 ? "negative" : ""}`}>{signedScore(row.points)}</span> :
                  <strong>{formatScore(row.points)}</strong>}</td>
                {adminReport && <td className="muted mono">{row.studentId}</td>}
                {columns.map(column => <td key={column.key} className={`score-numeric${"start" in column ? " score-column-group-start" : ""}`}>
                  {column.key === "lateDeduction" ? signedScore(-(row.lateDeduction ?? 0) || 0) : row[column.key]}
                </td>)}
                {visibleActivityKinds.map(kind => <td key={kind}
                  className={`score-numeric${!weekly && (kind === "initiative" || kind === "committee") ? " score-column-group-start" : ""}`}>
                  {row.activityCounts[kind]}
                </td>)}
              </tr>;
            })}</tbody>
          </table>
        </div>
        </>
      ) : <Empty title={onlyMine ? `Bạn chưa có trong bảng điểm ${period} này` : `Chưa có thành viên trong ${period} này`} />}
    </section>
  );
}

type MonthlyScores = { rows: ScoreboardRow[] } | { error: string };

function useMonthlyScores(month: string, revision?: number) {
  const key = `${month}:${revision ?? ""}`;
  const [request, setRequest] = useState<{ key: string; result: MonthlyScores } | null>(null);
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
        if (!controller.signal.aborted) setRequest({ key, result: { rows: data.rows } });
      } catch (error) {
        if (!controller.signal.aborted) setRequest({ key, result: { error: error instanceof Error ? error.message : "Không tải được bảng điểm tháng" } });
      }
    }
    void load();
    return () => controller.abort();
  }, [month, key, attempt]);
  const result = request?.key === key ? request.result : null;
  const retry = () => { setRequest(null); setAttempt(value => value + 1); };
  return { result, retry };
}

export function WeeklyScoreboard({ week, revision, rows, ...scopeProps }: ScopeProps & {
  week: string; revision: number; rows: ScoreboardRow[];
}) {
  // The selected week's Monday determines the frame month.
  const month = week.slice(0, 7);
  const { result, retry } = useMonthlyScores(month, revision);
  const monthRanks = result && "rows" in result
    ? new Map(rankScoreRows(result.rows).map(row => [row.memberId, row.rank]))
    : undefined;
  const frameMonth = `Khung hạng tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`;
  const frameNotice = <div className="score-frame-source">
    {result && "error" in result ? <>
      <span role="status">Chưa tải được {frameMonth.toLowerCase()}</span>
      <button type="button" className="text-button" onClick={retry}>Thử lại</button>
    </> : <span role={result ? undefined : "status"}>{result ? frameMonth : `Đang tải ${frameMonth.toLowerCase()}…`}</span>}
  </div>;
  return <Scoreboard title={`Tuần ${dateLabel(week)} – ${dateLabel(addDays(week, 6))}`}
    period="tuần" rows={rows} monthRanks={monthRanks} frameNotice={frameNotice} {...scopeProps} />;
}

export function MemberMonthlyScoreboard({ month, ...scopeProps }: ScopeProps & { month: string }) {
  const { result, retry } = useMonthlyScores(month);
  if (!result) return <p className="notice neutral" role="status">Đang tải bảng điểm tháng…</p>;
  if ("error" in result) return (
    <div className="notice amber" role="alert">{displayMessage(result.error)}
      <Button variant="secondary" onClick={retry}>Thử lại</Button>
    </div>
  );
  return <Scoreboard title={monthLabel(month)} period="tháng" rows={result.rows} {...scopeProps} />;
}
