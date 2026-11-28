"use client";

import { ArrowDownRight, ArrowUpRight, Circle, Coins, Dices, Gamepad2, LoaderCircle, Plus, RotateCw, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  isLiveRoom, markOnTurn, WHEEL_FACTORS, xoBoard, xoPrizeCents, xoWinningLine,
  type GameCommand, type GamesResponse, type GamesView, type OpenXoRoom,
  type WheelFactor, type WheelSpin, type XoRoom,
} from "../lib/games";
import { MemberName, useMemberIdentity } from "./member-identity";
import { Avatar, Button, Dialog, Field } from "./ui";

const gamesPath = "/api/games";
const creditNumber = new Intl.NumberFormat("vi-VN");
const spinTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const wheelDuration = 2_350;
const sliceAngle = 360 / WHEEL_FACTORS.length;

function formatCredits(cents: number) {
  const amount = Math.abs(cents);
  const remainder = amount % 100;
  const whole = creditNumber.format((amount - remainder) / 100);
  const fraction = remainder ? "," + String(remainder).padStart(2, "0").replace(/0$/, "") : "";
  return (cents < 0 ? "−" : "") + whole + fraction;
}
const signedCredits = (cents: number) => (cents > 0 ? "+" : "") + formatCredits(cents);
const factorLabel = (factor: WheelFactor) => "×" + (factor < 0 ? "−" + Math.abs(factor) : factor);

function checkedStake(raw: string, max: number) {
  const stake = Number(raw);
  return Number.isSafeInteger(stake) && stake >= 1 && stake <= max ? stake : undefined;
}

function angleFor(factor: WheelFactor | undefined) {
  return factor === undefined ? 0 : (360 - WHEEL_FACTORS.indexOf(factor) * sliceAngle) % 360;
}

export default function GamesPage({ tab, memberId }: { tab: "xo" | "wheel"; memberId: string }) {
  const [view, setView] = useState<GamesView>();
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [retry, setRetry] = useState<GameCommand>();
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [motion, setMotion] = useState<{ spin: WheelSpin; angle: number; moving: boolean }>();
  const receive = useCallback((incoming: GamesView) => {
    setView(current => current && current.revision > incoming.revision ? current : incoming);
    setLoadError("");
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(gamesPath, { cache: "no-store", signal });
      const data = await response.json() as GamesView & { error?: string };
      if (signal?.aborted) return;
      if (response.status === 401) setView(undefined);
      if (!response.ok) throw new Error(data.error || "Chưa tải được trò chơi");
      receive(data);
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : "Chưa tải được trò chơi");
    }
  }, [receive]);

  useEffect(() => {
    const controller = new AbortController();
    const refreshVisible = () => {
      if (!document.hidden) void load(controller.signal);
    };
    refreshVisible();
    const poll = window.setInterval(refreshVisible, tab === "xo" ? 2_500 : 15_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controller.abort();
      clearInterval(poll);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [tab, load]);

  const moving = motion?.moving;
  useEffect(() => {
    if (!moving) return;
    const timer = window.setTimeout(() => setMotion(current => current && { ...current, moving: false }), wheelDuration);
    return () => clearTimeout(timer);
  }, [motion?.spin.id, moving]);

  async function submit(command: GameCommand) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setActionError("");
    try {
      const response = await fetch(gamesPath, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
      });
      const data = await response.json() as GamesResponse & { error?: string };
      if (!response.ok) {
        if (response.status >= 500) throw new Error(data.error);
        setRetry(undefined);
        setActionError(data.error || "Thao tác chưa được lưu");
        await load();
        return;
      }
      receive(data);
      setRetry(undefined);
      if (data.spin && data.spins[0]?.id === data.spin.id) {
        const previous = motion?.spin.id === view?.spins[0]?.id ? motion?.angle : undefined;
        const start = previous ?? angleFor(view?.spins[0]?.factor);
        const target = angleFor(data.spin.factor);
        const distance = (target - start % 360 + 360) % 360;
        setMotion({
          spin: data.spin, angle: start + 360 * 5 + distance,
          moving: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
      }
    } catch {
      setRetry(command);
      setActionError("Chưa xác nhận được kết quả");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <div className="games-page" aria-label="Trò chơi của Đội">
    <div className="games-heading">
      <div>
        <h1>{tab === "xo" ? "XO" : "Vòng quay may mắn"}</h1>
        {tab === "xo" && <p>Lập phòng và chơi cùng thành viên trong Đội</p>}
      </div>
      {view && <div className="games-wallet">
        <Coins size={21} aria-hidden="true" />
        <div><span>Số dư credits</span><strong data-game-balance={view.wallet.balanceCents}>{formatCredits(view.wallet.balanceCents)}</strong></div>
      </div>}
    </div>
    {actionError && <div className="games-message" role="alert">
      <span>{actionError}</span>
      {retry && <Button variant="secondary" disabled={busy} onClick={() => void submit(retry)}>Thử lại thao tác</Button>}
    </div>}
    {loadError && <div className="games-message" role="status">
      <span>{loadError}</span><Button variant="secondary" onClick={() => void load()}>Tải lại trò chơi</Button>
    </div>}
    {!view && !loadError && <p className="games-loading" role="status"><LoaderCircle size={18} className="spin" aria-hidden="true" /> Đang tải trò chơi</p>}
    {view && (tab === "xo"
      ? <XoGame view={view} memberId={memberId} disabled={busy || !!retry} onSubmit={submit} />
      : <WheelGame view={view} motion={motion} disabled={busy || !!retry} onSubmit={submit} />)}
  </div>;
}

function GamePlayer({ memberId, mark }: { memberId: string; mark?: "X" | "O" }) {
  const identity = useMemberIdentity();
  const member = identity?.members.get(memberId);
  return <div className="game-player">
    <Avatar memberId={memberId} name={member?.name ?? "Thành viên"} size="small" photoId={member?.avatarId} />
    <MemberName memberId={memberId} />
    {mark && <span className="game-mark" data-mark={mark}>{mark}</span>}
  </div>;
}

function XoGame({ view, memberId, disabled, onSubmit }: {
  view: GamesView; memberId: string; disabled: boolean; onSubmit: (command: GameCommand) => Promise<void>;
}) {
  const [wager, setWager] = useState("10");
  const [confirmation, setConfirmation] = useState<
    { kind: "join"; room: OpenXoRoom } | { kind: "surrender"; room: XoRoom }
  >();
  const current = view.ownRooms[0];
  const active = current && isLiveRoom(current);
  const { balanceCents, version } = view.wallet;
  const maxStake = Math.floor(balanceCents / 100);
  const stake = checkedStake(wager, maxStake);
  const availableRooms = view.openRooms.filter(room => room.hostId !== memberId);
  const history = view.ownRooms.slice(1).filter(room => !isLiveRoom(room));
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!disabled && !active && stake !== undefined) {
      void onSubmit({ kind: "create", id: crypto.randomUUID(), stake, walletVersion: version });
    }
  };

  return <div className="games-xo-layout" data-has-match={!!current}>
    {current && <div className="games-xo-own">
      <XoMatch room={current} memberId={memberId} disabled={disabled} onSubmit={onSubmit}
        onSurrender={() => setConfirmation({ kind: "surrender", room: current })} />
      {history.length > 0 && <details className="games-card games-history">
        <summary>Ván gần đây</summary>
        <ul>{history.map(room => <li key={room.id}>
          <span>{resultFor(room, memberId).title}</span><time dateTime={new Date(room.updatedAt).toISOString()}>{spinTime.format(room.updatedAt)}</time>
        </li>)}</ul>
      </details>}
    </div>}
    <div className="games-lobby">
      <section className="games-card">
        <header className="games-card-heading"><Gamepad2 size={20} aria-hidden="true" /><h2>Tạo phòng XO</h2></header>
        <p className="games-caption">Hai người cược bằng nhau · Thắng nhận ×1,95 mức cược · Hòa hoàn cược</p>
        {active ? <p className="games-note">Mỗi người có một phòng đang chờ hoặc đang chơi</p> : <form className="games-form" onSubmit={create}>
          <Field label="Mức cược XO (credits)">
            <input name="stake" type="number" min="1" step="1" max={maxStake} inputMode="numeric" value={wager}
              onChange={event => setWager(event.currentTarget.value)} required disabled={disabled || maxStake < 1} />
          </Field>
          <Button type="submit" disabled={disabled || stake === undefined}><Plus size={17} aria-hidden="true" /> Tạo phòng</Button>
          {!!wager && stake === undefined && <small className="games-wager-hint">
            {maxStake < 1 ? "Bạn cần ít nhất 1 credit để tạo phòng" : "Nhập số nguyên từ 1 đến " + creditNumber.format(maxStake)}
          </small>}
        </form>}
      </section>
      <section className="games-card">
        <header className="games-card-heading"><Users size={19} aria-hidden="true" /><h2>Phòng đang chờ</h2></header>
        {availableRooms.length ? <ul className="games-room-list">
          {availableRooms.map(room => <li key={room.id}>
            <div className="games-room-label"><GamePlayer memberId={room.hostId} />
              <span className="games-caption">{creditNumber.format(room.stake)} credits mỗi người</span>
            </div>
            <Button variant="secondary" disabled={disabled || !!active || room.stake > maxStake}
              onClick={() => setConfirmation({ kind: "join", room })}>{room.stake > maxStake ? "Thiếu credits" : "Tham gia"}</Button>
          </li>)}
        </ul> : <p className="games-note">Chưa có phòng nào đang chờ người chơi</p>}
      </section>
    </div>
    {confirmation && <Dialog title={confirmation.kind === "join" ? "Tham gia phòng XO" : "Bỏ ván XO"}
      onClose={() => setConfirmation(undefined)}>
      {confirmation.kind === "join" ? <p className="games-caption">
        Chủ phòng <MemberName memberId={confirmation.room.hostId} /> · Đặt cược <strong>{creditNumber.format(confirmation.room.stake)} credits</strong>
      </p> : <p className="games-caption">Đối thủ sẽ thắng và bạn mất {creditNumber.format(confirmation.room.stake)} credits đã cược</p>}
      <div className="games-dialog-actions">
        <Button variant="secondary" onClick={() => setConfirmation(undefined)}>Quay lại</Button>
        <Button disabled={disabled || (confirmation.kind === "join" && !!active)}
          onClick={() => {
            const { kind, room } = confirmation;
            setConfirmation(undefined);
            void onSubmit(kind === "join" ? { kind, id: room.id, stake: room.stake, walletVersion: version } : { kind, id: room.id });
          }}>{confirmation.kind === "join" ? "Xác nhận cược" : "Xác nhận bỏ ván"}</Button>
      </div>
    </Dialog>}
  </div>;
}

function resultFor(room: XoRoom, memberId: string) {
  if (room.status === "won") return room.winnerId === memberId
    ? { title: "Bạn thắng", detail: "Nhận " + formatCredits(xoPrizeCents(room.stake)) + " credits" }
    : { title: "Bạn thua", detail: "Mất " + creditNumber.format(room.stake) + " credits đã cược" };
  if (room.status === "draw") return { title: "Hòa", detail: "Cả hai được hoàn cược" };
  return {
    title: "Phòng đã hủy",
    detail: room.finishReason === "unavailable" ? "Một tài khoản ngừng hoạt động · Đã hoàn cược" : "Đã hoàn cược",
  };
}

function XoMatch({ room, memberId, disabled, onSubmit, onSurrender }: {
  room: XoRoom; memberId: string; disabled: boolean;
  onSubmit: (command: GameCommand) => Promise<void>; onSurrender: () => void;
}) {
  const waiting = room.status === "waiting";
  const playing = room.status === "playing";
  const board = xoBoard(room.moves);
  const winLine = xoWinningLine(board);
  const currentMark = markOnTurn(room.moves.length);
  const myTurn = playing && currentMark === (room.hostId === memberId ? "X" : "O");
  const result = !playing && !waiting ? resultFor(room, memberId) : undefined;

  return <section className="games-card games-match">
    <header className="games-match-heading">
      <h2>{isLiveRoom(room) ? "Phòng của bạn" : "Kết quả XO"}</h2>
      <span>{creditNumber.format(room.stake)} credits mỗi người</span>
    </header>
    <div className="game-players">
      <GamePlayer memberId={room.hostId} mark="X" />
      {room.guestId ? <GamePlayer memberId={room.guestId} mark="O" />
        : <div className="game-player games-caption"><Users size={17} aria-hidden="true" /> Chưa có đối thủ</div>}
    </div>
    <div className="game-match-status" role="status">
      {waiting ? "Đang chờ người chơi khác" : playing ? myTurn ? "Đến lượt bạn đánh " + currentMark : "Đang chờ " + currentMark + " đánh"
        : <><strong>{result?.title}</strong><span>{result?.detail}</span></>}
    </div>
    {!waiting && room.status !== "cancelled" && <div className="xo-board" aria-label="Bàn cờ XO">
      {board.map((mark, cell) => <button key={cell} type="button"
        aria-label={"Ô " + (cell + 1) + ", " + (mark ?? "trống")} data-mark={mark ?? undefined}
        data-win={winLine?.some(index => index === cell) || undefined}
        disabled={disabled || !myTurn || !!mark}
        onClick={() => void onSubmit({ kind: "move", id: room.id, cell, turn: room.moves.length })}>
          {mark === "X" ? <X aria-hidden="true" /> : mark === "O" ? <Circle aria-hidden="true" /> : null}
        </button>)}
    </div>}
    <div className="game-match-actions">
      {waiting && <Button variant="secondary" disabled={disabled}
        onClick={() => void onSubmit({ kind: "cancel", id: room.id })}>Hủy phòng và hoàn cược</Button>}
      {playing && <Button variant="secondary" disabled={disabled} onClick={onSurrender}>Bỏ ván</Button>}
    </div>
  </section>;
}

const wheelColors = ["#e3a38b", "#efb5a1", "#f4c9ab", "#f8d9b9", "#f6efda", "#dce7d5", "#c6ddbc", "#b0d1a5", "#9dc799", "#90bc9d", "#7bab94"];
const wheelFill = "conic-gradient(from " + (-sliceAngle / 2) + "deg, " +
  wheelColors.map((color, index) => color + " " + (index * sliceAngle) + "deg " + ((index + 1) * sliceAngle) + "deg").join(", ") + ")";
const wheelLabels = WHEEL_FACTORS.map((factor, index) => ({
  factor,
  left: 50 + 36 * Math.sin((Math.PI * 2 * index) / WHEEL_FACTORS.length),
  top: 50 - 36 * Math.cos((Math.PI * 2 * index) / WHEEL_FACTORS.length),
}));

function WheelGame({ view, motion, disabled, onSubmit }: {
  view: GamesView; motion?: { spin: WheelSpin; angle: number; moving: boolean };
  disabled: boolean; onSubmit: (command: GameCommand) => Promise<void>;
}) {
  const [wager, setWager] = useState("1");
  const { maxWheelStake, version } = view.wallet;
  const stake = checkedStake(wager, maxWheelStake);
  const latest = view.spins[0];
  const activeMotion = motion && (motion.moving || motion.spin.id === latest?.id) ? motion : undefined;
  const rotating = !!activeMotion?.moving;
  const angle = activeMotion?.angle ?? angleFor(latest?.factor);
  const display = activeMotion?.spin ?? latest;
  function spin(event: FormEvent) {
    event.preventDefault();
    if (!disabled && !rotating && stake !== undefined)
      void onSubmit({ kind: "spin", id: crypto.randomUUID(), stake, walletVersion: version });
  }
  return <div className="games-wheel-layout">
    <div className="games-card games-wheel-panel">
      <div className="game-wheel" role="img" aria-label="Vòng quay gồm 11 ô từ âm 4 đến 6"
        style={{ "--wheel-angle": angle + "deg", "--wheel-duration": wheelDuration + "ms" } as CSSProperties}>
        <div className="game-wheel-pointer" />
        <div className="game-wheel-viewport">
          <div className="game-wheel-disc" data-moving={rotating} style={{ background: wheelFill }}>
            {wheelLabels.map(({ factor, left, top }) => <span key={factor} style={{ left: left + "%", top: top + "%" }}>
              {factorLabel(factor)}
            </span>)}
          </div>
        </div>
        <Dices className="game-wheel-center" size={32} />
      </div>
      <div className="game-wheel-outcome" role="status" data-net={display && !rotating ? display.netCents : undefined}>
        {rotating ? <span>Đang quay</span> : display ? <>
          <strong>{factorLabel(display.factor)}</strong>
          <span data-result={Math.sign(display.netCents)}>{signedCredits(display.netCents)} credits</span>
        </> : <span>Đặt cược để bắt đầu</span>}
      </div>
    </div>
    <div className="games-wheel-controls">
      <section className="games-card games-wheel-wager">
        <header className="games-card-heading"><RotateCw size={19} aria-hidden="true" /><h2>Đặt cược</h2></header>
        <form className="games-form" onSubmit={spin}>
          <Field label="Mức cược vòng quay (credits)">
            <input name="stake" type="number" min="1" max={maxWheelStake} step="1" inputMode="numeric" value={wager}
              onChange={event => setWager(event.currentTarget.value)} required disabled={disabled || rotating || maxWheelStake < 1} />
          </Field>
          <Button type="submit" disabled={disabled || rotating || stake === undefined}>
            <RotateCw size={17} aria-hidden="true" /> {rotating ? "Đang quay" : "Quay"}
          </Button>
          <small className="games-wager-hint">
            {maxWheelStake > 0
              ? "Cược tối đa " + creditNumber.format(maxWheelStake) + " credits với số dư hiện tại"
              : "Bạn cần ít nhất 5 credits để quay với mức cược 1"}
          </small>
        </form>
        <details className="game-wheel-rules">
          <summary>Cách tính kết quả</summary>
          <p>11 ô có cơ hội xuất hiện bằng nhau</p>
          <p>Số dư thay đổi bằng mức cược nhân hệ số rồi trừ mức cược</p>
          <ul>
            <li><ArrowDownRight size={16} aria-hidden="true" /> Cược 1 gặp ô ×−4, số dư giảm 5 credits</li>
            <li><ArrowUpRight size={16} aria-hidden="true" /> Cược 1 gặp ô ×6, số dư tăng 5 credits</li>
          </ul>
        </details>
      </section>
      {view.spins.length > 0 && <details className="games-card games-history">
        <summary>Lượt quay gần đây</summary>
        <ul>{view.spins.map(item => <li key={item.id}>
          <span>{factorLabel(item.factor)} · {creditNumber.format(item.stake)} cược</span>
          <strong data-result={Math.sign(item.netCents)}>{signedCredits(item.netCents)}</strong>
        </li>)}</ul>
      </details>}
    </div>
  </div>;
}
