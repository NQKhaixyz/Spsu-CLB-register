"use client";

import { Coins, Hammer, Shield } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCredits, HAMMER_PRICE_CENTS, type CreditItemCommand, type CreditItemReceipt, type CreditItemsView } from "../lib/games";
import type { CreditItemHistoryPage } from "../lib/credit-item-receipts";
import { Button, Field } from "./ui";

const endpoint = "/api/games/items";
const clock = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
type Snapshot = { view: CreditItemsView; receivedAt: number };
type ItemHistory = CreditItemHistoryPage & { revision: number; expanded?: boolean };

function countdown(remainingMs: number) {
  const seconds = Math.ceil(remainingMs / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
}

function itemResult(receipt: CreditItemReceipt) {
  if (receipt.kind === "shield") return "Đã bật khiên";
  return "Nhận " + formatCredits(receipt.takenCents) + " credits";
}

function itemDetail(receipt: CreditItemReceipt) {
  const cost = "Phí " + formatCredits(receipt.costCents) + " credits";
  if (receipt.kind === "shield") return cost;
  return ["Tỷ lệ " + receipt.percent + "%", cost,
    receipt.repaidCents ? "Đã trả nợ " + formatCredits(receipt.repaidCents) + " credits" : ""].filter(Boolean).join(" · ");
}

function mergeReceipts(first: CreditItemReceipt[], rest: CreditItemReceipt[]) {
  const ids = new Set(first.map(item => item.id));
  return [...first, ...rest.filter(item => !ids.has(item.id))];
}

export default function CreditItems() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [history, setHistory] = useState<ItemHistory>();
  const [target, setTarget] = useState("");
  const [confirm, setConfirm] = useState<CreditItemCommand>();
  const [retry, setRetry] = useState<CreditItemCommand>();
  const [receipt, setReceipt] = useState<CreditItemReceipt>();
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paging, setPaging] = useState(false);
  const [localNow, setLocalNow] = useState(0);
  const reading = useRef<AbortSignal | undefined>(undefined);
  const sending = useRef(false);

  const view = snapshot?.view;
  const expiresAt = view?.shieldExpiresAt;
  const serverNow = snapshot ? snapshot.view.serverNow + Math.max(0, localNow - snapshot.receivedAt) : 0;
  const remaining = Math.max(0, (expiresAt ?? 0) - serverNow);

  const showView = useCallback((next: CreditItemsView) => {
    const receivedAt = Date.now();
    setLocalNow(receivedAt);
    setSnapshot(current => current && (current.view.revision > next.revision ||
      (current.view.revision === next.revision && current.view.serverNow > next.serverNow)) ? current : { view: next, receivedAt });
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal, quiet = false, before?: number) => {
    if (reading.current && !reading.current.aborted && before === undefined) return;
    const timeout = AbortSignal.timeout(15_000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    if (before === undefined) reading.current = requestSignal;
    else setPaging(true);
    try {
      const url = before === undefined ? endpoint : endpoint + "?before=" + before;
      const response = await fetch(url, { cache: "no-store", signal: requestSignal });
      const next = await response.json() as CreditItemsView & { history: CreditItemHistoryPage; error?: string };
      if (!response.ok) throw new Error(next.error || "Chưa tải được vật phẩm");
      if (signal?.aborted) return;
      showView(next);
      setLoadError("");
      setHistory(current => {
        if (before !== undefined && current) return {
          ...current, entries: mergeReceipts(current.entries, next.history.entries), before: next.history.before, expanded: true,
        };
        if (current && current.revision > next.revision) return current;
        if (current?.expanded)
          return { ...current, entries: mergeReceipts(next.history.entries, current.entries), revision: next.revision };
        return { ...next.history, revision: next.revision };
      });
    } catch (problem) {
      if (!signal?.aborted && !quiet)
        setLoadError(problem instanceof Error ? problem.message : "Chưa tải được vật phẩm");
    } finally {
      if (before !== undefined) setPaging(false);
      else if (reading.current === requestSignal) reading.current = undefined;
    }
  }, [showView]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const sync = () => {
      if (!document.hidden && !sending.current) void refresh(controller.signal, true);
    };
    const timer = window.setInterval(sync, 8_000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [refresh]);

  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = window.setInterval(() => setLocalNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  async function buy(command: CreditItemCommand) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setActionError("");
    setReceipt(undefined);
    setConfirm(undefined);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command), signal: AbortSignal.timeout(20_000) });
      const next = await response.json() as CreditItemsView & { receipt: CreditItemReceipt; error?: string };
      if (response.status >= 500) throw new Error("Chưa xác nhận được giao dịch");
      setRetry(undefined);
      if (!response.ok) {
        setActionError(next.error || "Chưa mua được vật phẩm");
        if (response.status === 409) void refresh(undefined, true);
        return;
      }
      showView(next);
      setReceipt(next.receipt);
      setHistory(current => ({
        ...current, revision: Math.max(current?.revision ?? 0, next.revision),
        entries: mergeReceipts([next.receipt], current?.entries ?? []).sort((a, b) => b.at - a.at),
      }));
      if (command.kind === "hammer") setTarget("");
    } catch {
      setRetry(command);
      setActionError("Chưa xác nhận được giao dịch. Kiểm tra lại để nhận kết quả");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const disabled = busy || !!retry;
  const selected = view?.targets.find(member => member.memberId === target);
  const canBuyHammer = view && BigInt(view.balanceCents) >= BigInt(HAMMER_PRICE_CENTS);
  const olderBefore = history?.before;

  return <section className="games-page credit-items-page" aria-label="Vật phẩm credits">
    <header className="games-heading">
      <h1>Vật phẩm</h1>
      {view && <div className="games-wallet">
        <Coins size={21} aria-hidden="true" />
        <div><span>{view.sharedWallet ? "Số dư ví Cupid" : "Số dư ví credits"}</span>
          <strong>{formatCredits(BigInt(view.balanceCents))} credits</strong></div>
      </div>}
    </header>
    {!view && !loadError && <p className="games-note" role="status">Đang tải vật phẩm</p>}
    {loadError && <div className="games-note credit-items-status" role="status">
      <span>{loadError}</span><Button variant="secondary" onClick={() => void refresh()}>Tải lại</Button>
    </div>}
    {actionError && <div className="games-note credit-items-status" role="alert">
      <span>{actionError}</span>
      {retry && <Button variant="secondary" disabled={busy} onClick={() => void buy(retry)}>Kiểm tra giao dịch</Button>}
    </div>}
    {receipt && <div className="games-note credit-items-status" role="status">
      <div><strong>{itemResult(receipt)}</strong><p className="games-caption">{itemDetail(receipt)}</p></div>
    </div>}
    {view && <>
      <div className="credit-items-grid">
        <section className="games-card credit-item-card" aria-label="Khiên">
          <div className="games-card-heading"><Shield size={20} aria-hidden="true" /><h2>Khiên</h2></div>
          <p className="games-caption">Bảo vệ ví khỏi mọi nhát búa trong 24 giờ. Phí bằng 20% số dư khả dụng</p>
          {remaining > 0 ? <div className="credit-shield-active">
            <span>Đang bảo vệ</span>
            <strong aria-label="Thời gian khiên còn hiệu lực">{countdown(remaining)}</strong>
            <time dateTime={new Date(expiresAt!).toISOString()}>Đến {clock.format(expiresAt!)}</time>
          </div> : <strong>{formatCredits(view.shieldCostCents)} credits</strong>}
          {confirm?.kind === "shield" ? <div className="credit-item-confirm" role="group" aria-label="Xác nhận mua khiên">
            <p>Mua khiên trong 24 giờ với giá {formatCredits(confirm.quotedCostCents)} credits?</p>
            <div className="credit-item-actions">
              <Button disabled={disabled || remaining > 0} onClick={() => void buy(confirm)}>Xác nhận bật khiên</Button>
              <Button variant="secondary" onClick={() => setConfirm(undefined)}>Hủy</Button>
            </div>
          </div> : remaining === 0 && <Button disabled={disabled || !!confirm} onClick={() => setConfirm({
            kind: "shield", operationId: crypto.randomUUID(), walletVersion: view.walletVersion, quotedCostCents: view.shieldCostCents,
          })}>Mua khiên</Button>}
        </section>
        <section className="games-card credit-item-card" aria-label="Búa">
          <div className="games-card-heading"><Hammer size={20} aria-hidden="true" /><h2>Búa</h2>
            <span className="credit-hammer-count">Đã mua {view.hammersPurchased} búa</span></div>
          <p className="games-caption">Mỗi nhát giá 1.500 credits, nhận ngẫu nhiên từ 0% đến 50% số dư ví mục tiêu</p>
          <Field label="Mục tiêu">
            <select value={selected ? target : ""} disabled={disabled || !!confirm} onChange={event => setTarget(event.target.value)}>
              <option value="">Chọn thành viên</option>
              {view.targets.map(member => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}
            </select>
          </Field>
          {confirm?.kind === "hammer" ? <div className="credit-item-confirm" role="group" aria-label="Xác nhận dùng búa">
            <p>Đập {selected?.name ?? "mục tiêu đã chọn"} với phí 1.500 credits? Phí vẫn tính khi nhận 0 credits</p>
            <div className="credit-item-actions">
              <Button disabled={disabled || !selected} onClick={() => void buy(confirm)}>Xác nhận đập</Button>
              <Button variant="secondary" onClick={() => setConfirm(undefined)}>Hủy</Button>
            </div>
          </div> : <Button disabled={disabled || !!confirm || !selected || !canBuyHammer} onClick={() => setConfirm({
            kind: "hammer", operationId: crypto.randomUUID(), walletVersion: view.walletVersion, targetMemberId: target,
          })}>Mua búa và đập</Button>}
          {!canBuyHammer && <p className="games-caption">Cần đủ 1.500 credits trong ví</p>}
        </section>
      </div>
      <section className="games-card credit-item-history" aria-label="Lịch sử vật phẩm của bạn">
        <h2>Lịch sử vật phẩm của bạn</h2>
        {history?.entries.length ? <ul className="games-room-list">
          {history.entries.map(item => <li key={item.id}>
            <div className="credit-item-transaction">
              <strong>{item.kind === "shield" ? "Mua khiên" : "Đập " + (item.targetName ?? "thành viên đã rời")}</strong>
              <time dateTime={new Date(item.at).toISOString()}>{clock.format(item.at)}</time>
            </div>
            <div className="credit-item-transaction">
              <strong>{itemResult(item)}</strong><span>{itemDetail(item)}</span>
            </div>
          </li>)}
        </ul> : <p className="games-caption">Bạn chưa mua vật phẩm</p>}
        {olderBefore !== undefined && <Button variant="secondary" disabled={paging}
          onClick={() => void refresh(undefined, false, olderBefore)}>{paging ? "Đang tải" : "Xem thêm"}</Button>}
      </section>
    </>}
  </section>;
}
