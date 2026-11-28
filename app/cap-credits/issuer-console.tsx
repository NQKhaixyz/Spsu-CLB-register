"use client";

import { Coins, LoaderCircle, LogOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { formatCredits, parseCreditAmount, type CreditAdjustmentCommand, type CreditAdjustmentMode, type CreditAdjustmentResult, type CreditRecipient } from "../../lib/games";
import { Brand, Button, Field } from "../ui";

const path = "/api/credit-issuer";
type ConsoleState = { name: string; players: CreditRecipient[] };
const adjustments: Record<CreditAdjustmentMode, { button: string; field: string }> = {
  add: { button: "Cấp credits", field: "Số credits cấp thêm" },
  subtract: { button: "Trừ credits", field: "Số credits trừ bớt" },
  set: { button: "Đặt số dư", field: "Số dư credits mới" },
};

function adjustmentMessage(result: CreditAdjustmentResult) {
  const { mode, amountCents } = result.receipt;
  if (mode === "set") return "Đã đặt số dư của " + result.name + " thành " + formatCredits(amountCents) + " credits";
  return (mode === "subtract" ? "Đã trừ " : "Đã cấp ") + formatCredits(amountCents) + " credits " +
    (mode === "subtract" ? "của " : "cho ") + result.name;
}

async function post(action: string, data?: unknown) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
    signal: AbortSignal.timeout(20_000),
  });
}

export default function CreditIssuerConsole() {
  const [state, setState] = useState<ConsoleState | null>();
  const [targetId, setTargetId] = useState("");
  const [mode, setMode] = useState<CreditAdjustmentMode>("add");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState<CreditAdjustmentCommand>();
  const [receipt, setReceipt] = useState<CreditAdjustmentResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const recipient = state?.players.find(player => player.memberId === targetId);
  const amountCents = parseCreditAmount(amount);
  const minAmount = mode === "set" ? 0 : 1;
  const validAmount = amountCents !== undefined && amountCents >= minAmount;

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(path, { cache: "no-store", signal });
    if (response.status === 401) {
      setState(null);
      return;
    }
    if (!response.ok) throw new Error("Chưa tải được danh sách tài khoản");
    setState(await response.json() as ConsoleState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setState(null);
        setError("Chưa tải được trang cấp credits");
      }
    });
    return () => controller.abort();
  }, [load]);

  async function accountAction(action: "login" | "logout", data?: Record<string, FormDataEntryValue>) {
    if (sending.current) return;
    sending.current = true;
    setError("");
    setBusy(true);
    try {
      const response = await post(action, data);
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Chưa xử lý được yêu cầu");
      if (action === "login") await load();
      else {
        setState(null);
        setTargetId("");
        setMode("add");
        setAmount("");
        setPending(undefined);
        setReceipt(undefined);
      }
    } catch (problem) {
      setError(problem instanceof Error && problem.name !== "TimeoutError" ? problem.message : "Chưa kết nối được, thử lại nhé");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function adjust(command: CreditAdjustmentCommand) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setReceipt(undefined);
    try {
      const response = await post("adjust", command);
      const data = await response.json() as CreditAdjustmentResult & { error?: string };
      if (!response.ok) {
        if (response.status >= 500) throw new Error("Chưa xác nhận được giao dịch");
        setPending(undefined);
        if (response.status === 401) setState(null);
        setError(data.error || "Chưa điều chỉnh được credits");
        if (response.status === 409) await load().catch(() => undefined);
        return;
      }
      setState(current => current && ({
        ...current,
        players: current.players.map(player => player.memberId === data.memberId
          ? { ...player, balanceCents: data.balanceCents, walletVersion: data.walletVersion } : player),
      }));
      setPending(undefined);
      setReceipt(data);
      setAmount("");
      if (recipient?.partnerName) await load().catch(() => undefined);
    } catch {
      setPending(command);
      setError("Chưa xác nhận được giao dịch. Thử lại để kiểm tra giao dịch này");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipient || amountCents === undefined || !validAmount || pending || busy) return;
    void adjust({ memberId: recipient.memberId, mode, amountCents, walletVersion: recipient.walletVersion, operationId: crypto.randomUUID() });
  }

  return <main className="credit-issuer-page">
    <header className="credit-issuer-header">
      <Brand />
      {state && <Button variant="secondary" onClick={() => void accountAction("logout")} disabled={busy}>
        <LogOut size={17} aria-hidden="true" /> Đăng xuất
      </Button>}
    </header>
    <section className="panel credit-issuer-panel" aria-labelledby="credit-issuer-title">
      <div className="credit-issuer-title">
        <Coins size={23} aria-hidden="true" />
        <h1 id="credit-issuer-title">{state?.name ?? "Vua Cờ Bạc"}</h1>
      </div>
      {state === undefined ? <p className="credit-issuer-message" role="status">Đang tải</p> : state === null ? (
        <form className="credit-issuer-form" onSubmit={event => {
          event.preventDefault();
          void accountAction("login", Object.fromEntries(new FormData(event.currentTarget)));
        }}>
          {error && <p className="credit-issuer-message credit-issuer-error" role="alert">{error}</p>}
          <Field label="Tên đăng nhập">
            <input name="login" autoComplete="username" autoCapitalize="none" spellCheck={false}
              minLength={3} maxLength={30} required />
          </Field>
          <Field label="Mật khẩu">
            <input name="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />} Đăng nhập
          </Button>
        </form>
      ) : (
        <form className="credit-issuer-form" onSubmit={submitAdjustment}>
          {error && <p className="credit-issuer-message credit-issuer-error" role="alert">{error}</p>}
          {receipt && <div className="credit-issuer-message credit-issuer-success" role="status">
            <strong>{adjustmentMessage(receipt)}</strong>
            <span>Số dư {formatCredits(receipt.balanceCents)} credits</span>
          </div>}
          <Field label="Tài khoản nhận">
            <select value={targetId} onChange={event => setTargetId(event.currentTarget.value)} required disabled={busy || !!pending}>
              <option value="">Chọn người nhận</option>
              {state.players.map(player => <option key={player.memberId} value={player.memberId}>
                {player.name}{player.identifier ? " · " + player.identifier : ""}
              </option>)}
            </select>
          </Field>
          {recipient && <p className="credit-issuer-balance">Số dư hiện tại <strong>{formatCredits(recipient.balanceCents)} credits</strong></p>}
          {recipient?.partnerName && <p className="hint">Ví Cupid với {recipient.partnerName}. Cộng và trừ áp dụng vào ví chung, đặt số dư áp dụng cho mỗi người.</p>}
          <Field label="Thao tác">
            <select value={mode} onChange={event => {
              setMode(event.currentTarget.value as CreditAdjustmentMode);
              setAmount("");
            }} disabled={busy || !!pending}>
              <option value="add">Cấp thêm</option>
              <option value="subtract">Trừ bớt</option>
              <option value="set">Đặt số dư</option>
            </select>
          </Field>
          <Field label={adjustments[mode].field}>
            <input inputMode="decimal" value={amount}
              onChange={event => setAmount(event.currentTarget.value)} required disabled={busy || !!pending} />
          </Field>
          {pending ? <Button disabled={busy} onClick={() => void adjust(pending)}>Thử lại giao dịch</Button>
            : <Button type="submit" disabled={busy || !recipient || !validAmount}>
              {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />} {adjustments[mode].button}
            </Button>}
        </form>
      )}
    </section>
  </main>;
}
