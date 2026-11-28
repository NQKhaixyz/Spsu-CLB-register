"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCredits } from "../lib/games";
import type { CreditDebtHistoryView, CreditDebtKind, CreditHistoryEntry } from "../lib/credit-history";
import { Button } from "./ui";

type CreditHistoryPage = { entries: CreditHistoryEntry[]; balanceCents: number; before?: number; recordedSince?: number; debt: CreditDebtHistoryView };
type HistoryCursor = { source: "balance" | "debt"; before: number };
type DebtChartPoint = { at?: number; dayOnly?: true; debtCents: string; repaidCents: number | null; event: string };
const clock = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const day = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const axis = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const debtEvent: Record<CreditDebtKind, string> = {
  opening: "Dư nợ lúc bắt đầu ghi",
  loan: "Vay credits",
  repayment: "Trả nợ",
  automatic: "Tự trả nợ",
  cupidSplit: "Chia dư nợ khi kết thúc Cupid",
};

function CreditBalanceChart({ entries, balanceCents }: { entries: CreditHistoryEntry[]; balanceCents: number }) {
  const points = entries.flatMap(entry => entry.balanceCents === null ? [] : [{
    balance: entry.balanceCents, label: (entry.dayOnly ? day : clock).format(entry.at),
  }]).reverse();
  const oldest = entries.at(-1);
  if (oldest && !oldest.dayOnly && oldest.balanceCents !== null) {
    points.unshift({ label: "Trước khoản đầu đang xem", balance: oldest.balanceCents - oldest.changeCents });
  }
  if (points.at(-1)?.balance !== balanceCents) points.push({ label: "Hiện tại", balance: balanceCents });
  return <figure className="credit-history-chart" aria-label="Đồ thị số dư credits">
    <ResponsiveContainer width="100%" height={172} minWidth={0}>
      <LineChart data={points} margin={{ top: 12, right: 10, bottom: 8, left: 2 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" hide />
        <YAxis width={50} domain={["auto", "auto"]} tickLine={false} axisLine={false}
          tickFormatter={value => axis.format(Number(value) / 100)} />
        <Tooltip formatter={value => [formatCredits(Number(value)), "Số dư credits"]} />
        <Line type="stepAfter" dataKey="balance" stroke="var(--green)" strokeWidth={2.5}
          dot={points.length < 10 ? { r: 3, fill: "var(--green)" } : false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </figure>;
}

function CreditDebtChart({ debt }: { debt: CreditDebtHistoryView }) {
  if (!debt.entries.length) return <p className="hint">Chưa có biến động nợ được ghi nhận</p>;
  const changes: DebtChartPoint[] = [...debt.entries].reverse().map(entry => ({
    at: entry.at, dayOnly: entry.dayOnly, debtCents: entry.debtCents, repaidCents: entry.repaidCents || null,
    event: debtEvent[entry.kind],
  }));
  if (debt.before === undefined && debt.entries.at(-1)?.kind === "loan")
    changes.unshift({ debtCents: "0", repaidCents: null, event: "Trước khi vay" });
  if (changes.at(-1)?.debtCents !== debt.debtCents)
    changes.push({ debtCents: debt.debtCents, repaidCents: null, event: "Hiện tại" });
  const points = changes.map((point, index) => ({ ...point, index, debtValue: Number(point.debtCents) }));
  return <figure className="credit-history-chart credit-debt-chart" aria-label="Đồ thị dư nợ và trả nợ">
    <ResponsiveContainer width="100%" height={180} minWidth={0}>
      <ComposedChart data={points} margin={{ top: 10, right: 10, bottom: 2, left: 2 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="index" tickFormatter={index => {
          const at = points[index]?.at;
          return at === undefined ? "" : day.format(at);
        }}
          minTickGap={14} tickLine={false} axisLine={false} />
        <YAxis width={50} domain={[0, "auto"]} tickLine={false} axisLine={false}
          tickFormatter={value => axis.format(Number(value) / 100)} />
        <Tooltip isAnimationActive={false} content={({ active, label }) => {
          const point = points[Number(label)];
          if (!active || !point) return null;
          return <div className="credit-debt-tooltip" role="status">
            <strong>{point.event}</strong>
            {point.at !== undefined && <time dateTime={new Date(point.at).toISOString()}>{(point.dayOnly ? day : clock).format(point.at)}</time>}
            <dl>
              <div><dt>Dư nợ</dt><dd>{formatCredits(BigInt(point.debtCents))} credits</dd></div>
              {point.repaidCents !== null && <div><dt>Đã trả</dt><dd>{formatCredits(point.repaidCents)} credits</dd></div>}
            </dl>
          </div>;
        }} />
        <Bar dataKey="repaidCents" name="Đã trả" fill="var(--green)" maxBarSize={20} isAnimationActive={false} />
        <Line type="stepAfter" dataKey="debtValue" name="Dư nợ" stroke="var(--credit-debt-color)" strokeWidth={2.5}
          dot={points.length < 9 ? { r: 3 } : false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
    <figcaption className="credit-debt-legend"><span>Dư nợ</span><span>Đã trả từng lần</span></figcaption>
  </figure>;
}

export function ProfileCreditHistory({ memberId }: { memberId: string }) {
  const [page, setPage] = useState<CreditHistoryPage>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (cursor?: HistoryCursor, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ memberId });
    if (cursor) params.set(cursor.source === "debt" ? "debtBefore" : "before", String(cursor.before));
    try {
      const response = await fetch("/api/games/history?" + params, { signal, cache: "no-store" });
      const next = await response.json() as CreditHistoryPage & { error?: string };
      if (!response.ok) throw new Error(next.error || "Chưa tải được lịch sử credits");
      if (!signal?.aborted) setPage(previous => {
        if (!cursor || !previous || previous.recordedSince !== next.recordedSince) return next;
        if (cursor.source === "debt") return { ...previous, balanceCents: next.balanceCents,
          debt: { ...next.debt, entries: [...previous.debt.entries, ...next.debt.entries] } };
        return { ...next, entries: [...previous.entries, ...next.entries],
          debt: { ...previous.debt, ...next.debt, entries: previous.debt.entries, before: previous.debt.before } };
      });
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Chưa tải được lịch sử credits");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [memberId]);
  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, controller.signal);
    return () => controller.abort();
  }, [load]);

  return <section className="profile-credit-history" aria-label="Lịch sử biến động credits">
    {error && <p className="hint" role="alert">{error}</p>}
    {!page && loading && <p className="hint" role="status">Đang tải lịch sử credits</p>}
    {!page && error && <Button variant="secondary" onClick={() => void load()}>Thử lại</Button>}
    {page && <>
      <div className="credit-history-balance">
        <span>Số dư hiện tại</span><strong>{formatCredits(page.balanceCents)} credits</strong>
      </div>
      <div className="credit-history-balance credit-debt-balance">
        <span>Dư nợ hiện tại</span><strong>{formatCredits(BigInt(page.debt.debtCents))} credits</strong>
      </div>
      {page.debt.sharedDebtCents !== "0" && <p className="hint credit-debt-breakdown">
        Nợ riêng {formatCredits(BigInt(page.debt.personalDebtCents))} · Nợ chung Cupid {formatCredits(BigInt(page.debt.sharedDebtCents))}
      </p>}
      <CreditBalanceChart entries={page.entries} balanceCents={page.balanceCents} />
      <section className="credit-debt-history" aria-label="Biến động nợ">
        <h3>Biến động nợ</h3>
        <CreditDebtChart debt={page.debt} />
        {page.debt.before !== undefined && <Button variant="secondary" disabled={loading}
          onClick={() => void load({ source: "debt", before: page.debt.before! })}>Xem thêm lịch sử nợ</Button>}
      </section>
      {page.recordedSince !== undefined && <p className="hint">
        Lịch sử đầy đủ từ {day.format(page.recordedSince)}. Lượt cũ dùng các khoản còn lưu, có thể thiếu số dư
      </p>}
      {page.entries.length ? <ol className="credit-history-entries">
        {page.entries.map(entry => <li key={entry.sequence}>
          <div><strong>{entry.label}</strong><time dateTime={new Date(entry.at).toISOString()}>{(entry.dayOnly ? day : clock).format(entry.at)}</time></div>
          <div>
            <strong data-change={Math.sign(entry.changeCents)}>{entry.changeCents > 0 ? "+" : ""}{formatCredits(entry.changeCents)}</strong>
            {entry.balanceCents !== null && <small>Dư {formatCredits(entry.balanceCents)}</small>}
          </div>
        </li>)}
      </ol> : <p className="hint">Chưa có biến động credits được ghi nhận</p>}
      {page.before !== undefined && <Button variant="secondary" disabled={loading}
        onClick={() => void load({ source: "balance", before: page.before! })}>
        {loading ? "Đang tải" : "Xem thêm"}
      </Button>}
    </>}
  </section>;
}
