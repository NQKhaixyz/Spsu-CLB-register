"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { activityLabels, visibleActivityKinds } from "../lib/activity";
import { addDays, dateLabel, monthLabel, type ScoreboardRow } from "../lib/club";
import { monthlyScoreTier, rankScoreRows } from "../lib/score-ranks";
import { Avatar, Button, Empty, PanelHead } from "./ui";
import { displayMessage } from "../lib/display-message";
import { MemberName, useMemberIdentity } from "./member-identity";
import { sharingKinds, sharingScoreLabels, type SharingAmounts } from "../lib/sharing-types";

const scopes = [
  { id: "mine", label: "Điểm của tôi" },
  { id: "team", label: "Toàn Đội" },
] as const;
export type ScoreScope = (typeof scopes)[number]["id"];
type ScopeProps = { memberId?: string; scope: ScoreScope; onScopeChange: (scope: ScoreScope) => void };
type ScorePeriod = "tuần" | "tháng";
type ScoreTier = NonNullable<ReturnType<typeof monthlyScoreTier>>;
type ScoreTableRow = ScoreboardRow & { studentId?: string; avatarId?: string; lateDeduction?: number };
type RankedScoreRow = ScoreTableRow & { rank?: number; tier?: ScoreTier };

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

export function SharingScoreMetrics({ amounts }: { amounts?: SharingAmounts }) {
  return sharingKinds.map(kind => amounts?.[kind]
    ? <ScoreMetric key={kind} label={sharingScoreLabels[kind]} points={amounts[kind]} /> : null);
}

function RankTitle({ tier }: { tier: ScoreTier }) {
  return <span className="score-rank-title" data-tier={tier.id}>{tier.label}</span>;
}

export function RankNumber({ rank }: { rank: number }) {
  return <span className="score-rank-number" title={`Hạng ${rank}`}>{rank}</span>;
}

function ScoreRank({ tier, rank }: { tier?: ScoreTier; rank?: number }) {
  if (tier) return <RankTitle tier={tier} />;
  return rank === undefined ? <span className="muted" aria-hidden="true">—</span> : <RankNumber rank={rank} />;
}

function ScoreAvatar({ row, index, showNumber = false }: {
  row: RankedScoreRow; index: number; showNumber?: boolean;
}) {
  return <span className="score-avatar">
    <Avatar memberId={row.memberId} name={row.name} photoId={row.avatarId} index={index} />
    {showNumber && row.rank !== undefined && <RankNumber rank={row.rank} />}
  </span>;
}

function MobileScoreList({ rows, memberId, period }: {
  rows: RankedScoreRow[]; memberId?: string; period: ScorePeriod;
}) {
  const group = useId();
  const metrics = period === "tuần" ? weekDetailOrder : monthDetailOrder;
  return <ul className="mobile-score-list ranked-score-list" role="list" aria-label={`Bảng điểm ${period}`}>
    {rows.map((row, index) => (
      <li key={row.memberId}>
        <details name={group}>
          <summary>
            <ScoreAvatar row={row} index={index} showNumber />
            <span className="mobile-score-name">
              <MemberName as="strong" memberId={row.memberId} name={row.name} />
              {memberId === row.memberId && <small className="score-self">Bạn</small>}
              {row.tier && <RankTitle tier={row.tier} />}
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
            <SharingScoreMetrics amounts={row.sharingAdjustment} />
          </dl>
        </details>
      </li>
    ))}
  </ul>;
}

export function Scoreboard({ title, period, reportMonth, rows, memberId, scope, onScopeChange, adminReport = false }: ScopeProps & {
  title: string; period: ScorePeriod; rows: ScoreTableRow[];
  reportMonth?: string; adminReport?: boolean;
}) {
  const identity = useMemberIdentity();
  const weekly = period === "tuần";
  const onlyMine = !!memberId && scope === "mine";
  const frameMonth = identity?.rankMonth;
  const ranked = rankScoreRows(rows).map(({ rank, ...row }) => {
    const rankForLabel = weekly ? identity?.monthlyRanks.get(row.memberId) ?? 0 : rank;
    const tier = monthlyScoreTier(rankForLabel);
    return { ...row, tier, rank: tier ? undefined : rank };
  });
  const visible = onlyMine ? ranked.filter(row => row.memberId === memberId) : ranked;
  const sharingColumns = sharingKinds.filter(kind => visible.some(row => row.sharingAdjustment?.[kind]));
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
      {frameMonth && (weekly || reportMonth !== frameMonth) &&
        <div className="score-frame-source">Khung avatar theo {monthLabel(frameMonth).toLowerCase()}</div>}
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
              {sharingColumns.map(kind => <th scope="col" key={kind} className="score-numeric">{sharingScoreLabels[kind]}</th>)}
            </tr></thead>
            <tbody>{visible.map((row, index) => {
              const name = <span className="score-name">
                <MemberName as="strong" memberId={row.memberId} name={row.name} />
                {memberId === row.memberId && !onlyMine && <small className="score-self">Bạn</small>}
                {row.committeeNames && <small className="score-committee">{row.committeeNames}</small>}
              </span>;
              return <tr key={row.memberId}>
                <td className="score-rank-column"><ScoreRank tier={row.tier} rank={row.rank} /></td>
                <td><div className="score-person">
                  <ScoreAvatar row={row} index={index} />{name}
                </div></td>
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
                {sharingColumns.map(kind => <td key={kind} className="score-numeric">{signedScore(row.sharingAdjustment?.[kind] ?? 0)}</td>)}
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

function useMonthlyScores(month: string) {
  const [request, setRequest] = useState<{ month: string; result: MonthlyScores } | null>(null);
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
        if (!controller.signal.aborted) setRequest({ month, result: { rows: data.rows } });
      } catch (error) {
        if (!controller.signal.aborted) setRequest({ month, result: { error: error instanceof Error ? error.message : "Không tải được bảng điểm tháng" } });
      }
    }
    void load();
    return () => controller.abort();
  }, [month, attempt]);
  const result = request?.month === month ? request.result : null;
  const retry = () => { setRequest(null); setAttempt(value => value + 1); };
  return { result, retry };
}

export function WeeklyScoreboard({ week, rows, ...scopeProps }: ScopeProps & {
  week: string; rows: ScoreTableRow[];
}) {
  return <Scoreboard title={`Tuần ${dateLabel(week)} – ${dateLabel(addDays(week, 6))}`}
    period="tuần" rows={rows} {...scopeProps} />;
}

export function MemberMonthlyScoreboard({ month, avatarForMember, ...scopeProps }: ScopeProps & {
  month: string; avatarForMember: (memberId: string) => string | undefined;
}) {
  const { result, retry } = useMonthlyScores(month);
  if (!result) return <p className="notice neutral" role="status">Đang tải bảng điểm tháng…</p>;
  if ("error" in result) return (
    <div className="notice amber" role="alert">{displayMessage(result.error)}
      <Button variant="secondary" onClick={retry}>Thử lại</Button>
    </div>
  );
  const rows = result.rows.map(row => ({ ...row, avatarId: avatarForMember(row.memberId) }));
  return <Scoreboard title={monthLabel(month)} period="tháng" reportMonth={month} rows={rows} {...scopeProps} />;
}
