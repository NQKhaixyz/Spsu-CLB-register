"use client";

import { Coins } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CREDITS_PER_POINT_UNIT_CENTS, CREDITS_TO_POINTS, CREDIT_EXCHANGE_AWARD_CENTS, CREDIT_EXCHANGE_BASE_POINT_CENTS,
  CREDIT_EXCHANGE_COST_CENTS, CREDIT_EXCHANGE_FEE_PERCENT, CREDIT_EXCHANGE_RATE, CREDIT_EXCHANGE_START_AT,
  POINT_EXCHANGE_UNIT_CENTS, POINTS_TO_CREDITS, creditExchangeOpeningMessage,
  type creditExchangeView, type CreditExchangeCommand, type CreditExchangeReceipt } from "../lib/credit-exchange";
import { monthLabel } from "../lib/club";
import { formatCredits, parseCreditAmount } from "../lib/games";
import { formatScore } from "./scoreboard";
import { Button, Field } from "./ui";

type ExchangeView = ReturnType<typeof creditExchangeView>;
const path = "/api/games/exchange?rate=" + CREDIT_EXCHANGE_RATE;
const price = formatCredits(CREDIT_EXCHANGE_COST_CENTS);
const award = formatScore(CREDIT_EXCHANGE_AWARD_CENTS / 100);
const pointUnit = formatScore(POINT_EXCHANGE_UNIT_CENTS / 100);

export default function CreditExchange({ onExchanged }: { onExchanged: () => void }) {
  const [view, setView] = useState<ExchangeView>();
  const [month, setMonth] = useState("");
  const [amount, setAmount] = useState(pointUnit);
  const [receipt, setReceipt] = useState<CreditExchangeReceipt>();
  const [retry, setRetry] = useState<CreditExchangeCommand>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const selected = view?.months.find(row => row.month === month) ?? view?.months[0];
  const cents = parseCreditAmount(amount);
  const units = cents && cents % POINT_EXCHANGE_UNIT_CENTS === 0 ? cents / POINT_EXCHANGE_UNIT_CENTS : 0;
  const canBuyCredits = !!view?.open && !!selected && units > 0 && units <= selected.units;
  const canBuyPoints = !!view?.open && view.balanceCents >= CREDIT_EXCHANGE_COST_CENTS;

  useEffect(() => {
    const control = new AbortController();
    let timer: number | undefined;
    function load() {
      void fetch(path, { signal: control.signal, cache: "no-store" }).then(async response => {
        const data = await response.json() as ExchangeView & { error?: string };
        if (!response.ok) throw new Error(data.error || "Chưa tải được điểm tháng");
        if (control.signal.aborted) return;
        setView(data);
        if (!data.open) {
          const untilOpening = CREDIT_EXCHANGE_START_AT - Date.now();
          timer = window.setTimeout(load, untilOpening > 0 ? Math.min(untilOpening, 86_400_000) : 60_000);
        }
      }).catch(problem => {
        if (!control.signal.aborted) setError(problem instanceof Error ? problem.message : "Chưa tải được điểm tháng");
      });
    }
    load();
    return () => {
      control.abort();
      window.clearTimeout(timer);
    };
  }, []);

  async function exchange(command: CreditExchangeCommand) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setReceipt(undefined);
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
  function submitPoints(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view && canBuyPoints && !retry)
      void exchange({ month: view.month, direction: CREDITS_TO_POINTS, rate: CREDIT_EXCHANGE_RATE, operationId: crypto.randomUUID() });
  }
  function submitCredits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected && canBuyCredits && !retry)
      void exchange({ month: selected.month, units, direction: POINTS_TO_CREDITS, rate: CREDIT_EXCHANGE_RATE, operationId: crypto.randomUUID() });
  }

  return <section className="games-page" aria-label="Đổi điểm và credits">
    <div className="games-heading">
      <div>
        <h1>Đổi điểm tháng</h1>
        <p>{price} credits = {formatScore(CREDIT_EXCHANGE_BASE_POINT_CENTS / 100)} điểm · Phí {CREDIT_EXCHANGE_FEE_PERCENT}% trên phần nhận</p>
      </div>
      {view && <div className="games-wallet"><Coins size={20} aria-hidden="true" />
        <div><span>Số dư credits</span><strong>{formatCredits(view.balanceCents)}</strong></div></div>}
    </div>
    {error && <p className="games-message" role="alert">{error}</p>}
    {!view && !error && <p role="status">Đang tải điểm tháng</p>}
    {retry && <Button variant="secondary" disabled={busy} onClick={() => void exchange(retry)}>Thử lại lượt đổi</Button>}
    {receipt && <p className="games-note credit-exchange-receipt" role="status">{"spentCents" in receipt
      ? `Đã cộng ${formatScore(receipt.pointCents / 100)} Điểm riêng · Số dư giảm ${formatCredits(-receipt.balanceChangeCents)} credits`
      : `Đã ghi ${formatScore(receipt.units * POINT_EXCHANGE_UNIT_CENTS / 100)} Điểm trừ · Số dư tăng ${formatCredits(receipt.balanceChangeCents)} credits`}</p>}
    {view && !view.open && <p className="games-note" role="status">{creditExchangeOpeningMessage}</p>}
    {view?.open && <div className="credit-exchange-grid">
      {selected && <form className="games-card" onSubmit={submitCredits} aria-label="Điểm tháng sang credits">
        <h2>Điểm tháng sang credits</h2>
        <p className="games-caption">Điểm dùng để đổi được ghi vào Điểm trừ</p>
        <Field label="Tháng dùng để đổi">
          <select value={selected.month} onChange={event => setMonth(event.target.value)} disabled={busy || !!retry}>
            {view.months.map(row => <option key={row.month} value={row.month}>{monthLabel(row.month)}</option>)}
          </select>
        </Field>
        <p className="games-caption">Có thể đổi {formatScore(selected.units * POINT_EXCHANGE_UNIT_CENTS / 100)} điểm</p>
        <Field label="Số điểm muốn đổi">
          <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required disabled={busy || !!retry} />
        </Field>
        {canBuyCredits && <p className="games-caption">Nhận {formatCredits(units * CREDITS_PER_POINT_UNIT_CENTS)} credits sau phí</p>}
        <Button type="submit" disabled={!canBuyCredits || busy || !!retry}>Đổi điểm lấy credits</Button>
      </form>}
      <form className="games-card" onSubmit={submitPoints} aria-label="Credits sang điểm tháng">
        <h2>Credits sang điểm tháng</h2>
        <p className="games-caption">Đổi {price} credits · Cộng {award} vào Điểm riêng sau phí</p>
        <p className="games-caption">{monthLabel(view.month)} · Điểm hiện tại <strong>{formatScore(view.points)}</strong></p>
        {view.cupid && <p className="games-caption">Credits sẽ trừ từ ví Cupid</p>}
        {!canBuyPoints && <p className="games-caption">Cần {price} credits để đổi</p>}
        <Button type="submit" disabled={!canBuyPoints || busy || !!retry}>Đổi {price} credits lấy điểm</Button>
      </form>
    </div>}
  </section>;
}
