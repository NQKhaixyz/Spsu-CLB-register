"use client";

import { useCallback, useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCredits } from "../lib/games";
import type { CreditHistoryEntry } from "../lib/credit-history";
import { Button } from "./ui";

type CreditHistoryPage = { entries: CreditHistoryEntry[]; balanceCents: number; before?: number; recordedSince?: number };
const clock = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const day = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const axis = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

function CreditBalanceChart({ entries, balanceCents }: { entries: CreditHistoryEntry[]; balanceCents: number }) {
  const points = entries.flatMap(entry => entry.balanceCents === null ? [] : [{
    balance: entry.balanceCents, label: clock.format(entry.at),
  }]).reverse();
  const oldest = entries.at(-1);
  if (oldest && oldest.balanceCents !== null) {
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

export function ProfileCreditHistory({ memberId }: { memberId: string }) {
  const [page, setPage] = useState<CreditHistoryPage>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (before?: number, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ memberId });
    if (before !== undefined) params.set("before", String(before));
    try {
      const response = await fetch("/api/games/history?" + params, { signal, cache: "no-store" });
      const next = await response.json() as CreditHistoryPage & { error?: string };
      if (!response.ok) throw new Error(next.error || "Chưa tải được lịch sử credits");
      if (!signal?.aborted) setPage(previous => before === undefined || !previous ? next
        : { ...previous, before: next.before, entries: [...previous.entries, ...next.entries] });
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
      <CreditBalanceChart entries={page.entries} balanceCents={page.balanceCents} />
      {page.recordedSince !== undefined && <p className="hint">
        Lịch sử đầy đủ từ {day.format(page.recordedSince)}. Lượt cũ dùng các khoản còn lưu, có thể thiếu số dư
      </p>}
      {page.entries.length ? <ol className="credit-history-entries">
        {page.entries.map(entry => <li key={entry.sequence}>
          <div><strong>{entry.label}</strong><time dateTime={new Date(entry.at).toISOString()}>{clock.format(entry.at)}</time></div>
          <div>
            <strong data-change={Math.sign(entry.changeCents)}>{entry.changeCents > 0 ? "+" : ""}{formatCredits(entry.changeCents)}</strong>
            {entry.balanceCents !== null && <small>Dư {formatCredits(entry.balanceCents)}</small>}
          </div>
        </li>)}
      </ol> : <p className="hint">Chưa có biến động credits được ghi nhận</p>}
      {page.before !== undefined && <Button variant="secondary" disabled={loading} onClick={() => void load(page.before)}>
        {loading ? "Đang tải" : "Xem thêm"}
      </Button>}
    </>}
  </section>;
}
