"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import {
  CREDIT_LOAN_INTEREST_PERCENT, CREDIT_LOAN_LIMIT_CENTS, creditLoanInterestCents, formatCredits, parseCreditAmount,
  type CreditLoanCommand, type CreditLoanView,
} from "../lib/games";
import { MemberName } from "./member-identity";
import { Button, Field } from "./ui";

const path = "/api/games/loans";
const zero = BigInt(0);
const actionMessages = {
  borrow: "Đã cộng credits vào ví",
  repay: "Đã ghi khoản trả nợ",
  approve: "Đã cộng credits vào ví Cupid",
  decline: "Đã từ chối đề nghị vay",
  cancel: "Đã hủy đề nghị vay",
};

export default function CreditLoans({ memberId }: { memberId: string }) {
  const [view, setView] = useState<CreditLoanView>();
  const [borrowText, setBorrowText] = useState("");
  const [repayText, setRepayText] = useState("");
  const [retry, setRetry] = useState<CreditLoanCommand>();
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const reading = useRef(false);

  const applyView = useCallback((next: CreditLoanView) => {
    setView(previous => previous && previous.revision > next.revision ? previous : next);
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (reading.current) return;
    reading.current = true;
    try {
      const response = await fetch(path, { signal, cache: "no-store" });
      const next = await response.json() as CreditLoanView & { error?: string };
      if (!response.ok) throw new Error(next.error || "Chưa tải được khoản vay credits");
      if (!signal?.aborted) {
        applyView(next);
        setLoadError("");
      }
    } catch (error) {
      if (!quiet && !signal?.aborted)
        setLoadError(error instanceof Error ? error.message : "Chưa tải được khoản vay credits");
    } finally {
      reading.current = false;
    }
  }, [applyView]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const sync = () => {
      if (!document.hidden && !sending.current) void refresh(controller.signal, true);
    };
    const timer = window.setInterval(sync, 6000);
    window.addEventListener("focus", sync);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, [refresh]);

  async function submit(command: CreditLoanCommand) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command), signal: AbortSignal.timeout(20_000) });
      const next = await response.json() as CreditLoanView & { error?: string; requestedCupidLoan?: boolean };
      if (response.status >= 500) throw new Error();
      setRetry(undefined);
      if (!response.ok) {
        setActionError(next.error || "Chưa thực hiện được giao dịch");
        if (response.status === 409) void refresh(undefined, true);
        return;
      }
      applyView(next);
      if (command.kind === "borrow") setBorrowText("");
      if (command.kind === "repay") setRepayText("");
      const requestMessage = next.request?.id === command.operationId
        ? "Đã gửi đề nghị vay cho người cùng ví Cupid" : "Đề nghị vay Cupid đã được xử lý";
      setMessage(next.requestedCupidLoan ? requestMessage : actionMessages[command.kind]);
    } catch {
      setRetry(command);
      setActionError("Chưa xác nhận được giao dịch. Bấm thử lại để kiểm tra");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const blocked = busy || !!retry;
  const isCupid = !!view?.partnerId;
  const request = view?.request;
  const requestIsMine = request?.requestedBy === memberId;
  const requestInterest = request?.interestCents ?? 0;
  const debt = BigInt(view?.debtCents ?? "0");
  const loanLimit = BigInt(CREDIT_LOAN_LIMIT_CENTS);
  const remainingLimit = debt < loanLimit ? loanLimit - debt : zero;
  const borrowCents = parseCreditAmount(borrowText);
  const repayCents = parseCreditAmount(repayText);
  const quotedInterest = borrowCents ? creditLoanInterestCents(borrowCents) : 0;
  const quotedTotal = BigInt(borrowCents ?? 0) + BigInt(quotedInterest);
  const overLimit = quotedTotal > remainingLimit;
  const canBorrow = !!view && !request && !!borrowCents && !overLimit;
  const canRepay = !!view && !!repayCents && repayCents <= view.repayableCents;
  const canRepayAll = !!view && debt > zero && BigInt(view.repayableCents) === debt;

  function submitAmount(kind: "borrow" | "repay", amountCents: number) {
    if (!view || blocked) return;
    void submit({ operationId: crypto.randomUUID(), kind, amountCents, walletVersion: view.walletVersion,
      interestCents: kind === "borrow" ? quotedInterest : undefined });
  }

  function decide(kind: "approve" | "decline" | "cancel") {
    if (request && !blocked) void submit({ operationId: crypto.randomUUID(), kind, requestId: request.id,
      interestCents: kind === "approve" ? requestInterest : undefined });
  }

  return <section className="games-page" aria-label="Vay và trả nợ credits">
    <div className="games-heading">
      <div><h1>Vay credits</h1><p>Lãi {CREDIT_LOAN_INTEREST_PERCENT}% tính một lần · Trả hết nợ để đổi credits sang điểm</p></div>
      {view && <div className="credit-loan-summary">
        <div className="games-wallet"><Coins size={20} aria-hidden="true" />
          <div><span>{isCupid ? "Số dư ví chung" : "Số dư credits"}</span><strong>{formatCredits(BigInt(view.balanceCents))}</strong></div></div>
        <div className="games-wallet">
          <div><span>Dư nợ</span><strong>{formatCredits(debt)}</strong></div></div>
      </div>}
    </div>
    {loadError && <p className="games-message" role="alert">{loadError}</p>}
    {!view && !loadError && <p role="status">Đang tải ví credits</p>}
    {!view && loadError && <Button variant="secondary" onClick={() => void refresh()}>Thử tải lại</Button>}
    {actionError && <p className="games-message" role="alert">{actionError}</p>}
    {retry && <Button variant="secondary" disabled={busy} onClick={() => void submit(retry)}>Thử lại giao dịch</Button>}
    {message && <p className="games-note credit-exchange-receipt" role="status">{message}</p>}
    {view && <>
      {request && <section className="games-card credit-loan-request" aria-label="Đề nghị vay Cupid">
        <h2>Đề nghị vay Cupid</h2>
        <p className="games-caption">
          {requestIsMine ? "Bạn đã đề nghị vay " : <><MemberName memberId={request.requestedBy} /> đề nghị vay </>}
          <strong>{formatCredits(request.amountCents)} credits</strong> từ ví chung
        </p>
        <p className="games-caption">Tiền lãi {formatCredits(requestInterest)} · Tổng phải trả {formatCredits(request.amountCents + requestInterest)} credits</p>
        <div className="credit-loan-actions">
          {requestIsMine ? <Button variant="secondary" disabled={blocked} onClick={() => decide("cancel")}>Hủy đề nghị</Button> : <>
            <Button disabled={blocked} onClick={() => decide("approve")}>Đồng ý vay</Button>
            <Button variant="secondary" disabled={blocked} onClick={() => decide("decline")}>Từ chối</Button>
          </>}
        </div>
      </section>}
      <div className="credit-exchange-grid">
        <form className="games-card" aria-label="Vay credits" onSubmit={event => {
          event.preventDefault();
          if (canBorrow && borrowCents) submitAmount("borrow", borrowCents);
        }}>
          <h2>Khoản vay</h2>
          <p className="games-caption">Dư nợ tối đa {formatCredits(loanLimit)} credits mỗi ví, gồm gốc và lãi</p>
          {isCupid
            ? <p className="games-caption">Hạn mức tính cả nợ chung và nợ riêng của hai người. Cả hai cần xác nhận khoản vay</p>
            : <p className="games-caption">Hạn mức còn lại {formatCredits(remainingLimit)} credits</p>}
          <Field label="Số credits muốn vay">
            <input value={borrowText} onChange={event => setBorrowText(event.target.value)} inputMode="decimal"
              placeholder="Ví dụ 5000" required disabled={blocked || !!request} aria-invalid={overLimit} />
          </Field>
          {!!borrowCents && <p className="games-caption">Tiền lãi {formatCredits(quotedInterest)} · Tổng phải trả {formatCredits(quotedTotal)} credits</p>}
          {overLimit && <p className="games-caption" role="status">Gốc và lãi vượt hạn mức còn lại</p>}
          <Button type="submit" disabled={blocked || !canBorrow}>{isCupid ? "Gửi đề nghị vay" : "Vay credits"}</Button>
        </form>
        <form className="games-card" aria-label="Trả nợ credits" onSubmit={event => {
          event.preventDefault();
          if (canRepay && repayCents) submitAmount("repay", repayCents);
        }}>
          <h2>Trả nợ</h2>
          <p className="games-caption">Tự trả nợ bằng 50% lãi từ trò chơi và credits nhận từ đổi điểm hoặc được cấp, tối đa bằng dư nợ</p>
          {isCupid && <p className="games-caption">Nợ ví Cupid {formatCredits(BigInt(view.sharedDebtCents))} · Nợ riêng của bạn {formatCredits(BigInt(view.personalDebtCents))}</p>}
          {debt > zero ? view.repayableCents > 0 ? <>
            <Field label="Số credits muốn trả">
              <input value={repayText} onChange={event => setRepayText(event.target.value)} inputMode="decimal"
                required disabled={blocked} />
            </Field>
            <div className="credit-loan-actions">
              <Button type="submit" disabled={blocked || !canRepay}>Trả nợ</Button>
              {canRepayAll && <Button variant="secondary" disabled={blocked} onClick={() => submitAmount("repay", view.repayableCents)}>Trả hết nợ</Button>}
            </div>
          </> : <p className="games-caption">Cần thêm credits trong ví để trả nợ</p> : null}
        </form>
      </div>
    </>}
  </section>;
}
