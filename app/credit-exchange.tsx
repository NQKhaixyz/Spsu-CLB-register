"use client";

import { Coins } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CREDIT_EXCHANGE_CENTS_PER_UNIT, CREDIT_EXCHANGE_POINT_CENTS,
  type creditExchangeView, type CreditExchangeReceipt } from "../lib/credit-exchange";
import { monthLabel } from "../lib/club";
import { formatCredits, parseCreditAmount } from "../lib/games";
import { formatScore } from "./scoreboard";
import { Button, Field } from "./ui";

type ExchangeView = ReturnType<typeof creditExchangeView>;
type Command = { month: string; units: number; operationId: string };
const path = "/api/games/exchange";

export default function CreditExchange({ onExchanged }: { onExchanged: () => void }) {
  const [view, setView] = useState<ExchangeView>();
  const [month, setMonth] = useState("");
  const [amount, setAmount] = useState("0,05");
  const [receipt, setReceipt] = useState<CreditExchangeReceipt>();
  const [retry, setRetry] = useState<Command>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const selected = view?.months.find(row => row.month === month) ?? view?.months[0];
  const cents = parseCreditAmount(amount);
  const units = cents && cents % CREDIT_EXCHANGE_POINT_CENTS === 0 ? cents / CREDIT_EXCHANGE_POINT_CENTS : 0;
  const valid = selected && units > 0 && units <= selected.units;

  useEffect(() => {
    const control = new AbortController();
    void fetch(path, { signal: control.signal, cache: "no-store" }).then(async response => {
      const data = await response.json() as ExchangeView & { error?: string };
      if (!response.ok) throw new Error(data.error || "Chưa tải được điểm tháng");
      if (!control.signal.aborted) setView(data);
    }).catch(problem => {
      if (!control.signal.aborted) setError(problem instanceof Error ? problem.message : "Chưa tải được điểm tháng");
    });
    return () => control.abort();
  }, []);

  async function exchange(command: Command) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command), signal: AbortSignal.timeout(20_000) });
      const data = await response.json() as ExchangeView & { receipt?: CreditExchangeReceipt; error?: string };
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        setRetry(undefined);
        setError(data.error || "Chưa đổi được điểm");
        return;
      }
      setReceipt(data.receipt);
      setView(data);
      setRetry(undefined);
      onExchanged();
    } catch {
      setRetry(command);
      setError("Chưa xác nhận được lượt đổi. Thử lại để kiểm tra giao dịch");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid && !retry) void exchange({ month: selected.month, units, operationId: crypto.randomUUID() });
  }

  return <section className="games-page" aria-label="Đổi điểm tháng sang credits">
    <div className="games-heading">
      <div><h1>Đổi điểm tháng</h1><p>0,05 điểm tháng = 2.000 credits</p></div>
      {view && <div className="games-wallet"><Coins size={20} aria-hidden="true" />
        <div><span>Số dư credits</span><strong>{formatCredits(view.balanceCents)}</strong></div></div>}
    </div>
    <div className="games-card credit-exchange-card">
      {error && <p role="alert">{error}</p>}
      {!view && !error && <p role="status">Đang tải điểm tháng</p>}
      {selected && <form onSubmit={submit}>
        <Field label="Tháng dùng để đổi">
          <select value={selected.month} onChange={event => { setMonth(event.target.value); setReceipt(undefined); }} disabled={busy || !!retry}>
            {view?.months.map(row => <option key={row.month} value={row.month}>{monthLabel(row.month)}</option>)}
          </select>
        </Field>
        <p className="hint">Điểm tháng hiện tại <strong>{formatScore(selected.points)}</strong> · Có thể đổi {formatScore(selected.units / 20)} điểm</p>
        <Field label="Số điểm muốn đổi">
          <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required disabled={busy || !!retry}
            placeholder="0,05" />
        </Field>
        {valid && <p><strong>Nhận {formatCredits(units * CREDIT_EXCHANGE_CENTS_PER_UNIT)} credits</strong>
          {view?.cupid && <span> · Cộng vào ví Cupid</span>}</p>}
        <p className="hint">Điểm đã đổi được trừ khỏi điểm tháng, học kỳ và Excel.</p>
        <Button type="submit" disabled={!valid || busy || !!retry}>Đổi điểm</Button>
      </form>}
      {retry && <Button variant="secondary" disabled={busy} onClick={() => void exchange(retry)}>Thử lại lượt đổi</Button>}
      {receipt && <p className="games-note" role="status">Đã đổi {formatScore(receipt.units / 20)} điểm · Số dư của bạn tăng {formatCredits(receipt.balanceChangeCents)} credits</p>}
    </div>
  </section>;
}
