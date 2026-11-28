"use client";

import { ArrowDownRight, ArrowUpRight, Coins, Dices, Gamepad2, LoaderCircle, Plus, RotateCw, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  COIN_SIDES, COIN_WIN_PAYOUT_CENTS, formatCredits, GAME_RULES_VERSION,
  isLiveRoom, markOnTurn, WHEEL_FACTORS, WHEEL_REFUND_EVERY, WHEEL_REFUND_PERCENT,
  xoPrizeCents, xoSize, xoWinLength, XO_BOARD_SIZE,
  type CoinFlipCommand, type CoinSide, type GameCommand, type GamesResponse, type GamesView, type OpenXoRoom,
  type WheelFactor, type WheelSpin, type XoRoom,
} from "../lib/games";
import { MemberName, useMemberIdentity } from "./member-identity";
import { Avatar, Button, Dialog, Field } from "./ui";
import XoBoard from "./xo-board";

const gamesPath = "/api/games?rules=" + GAME_RULES_VERSION;
const creditNumber = new Intl.NumberFormat("vi-VN");
const spinTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const wheelDuration = 2_350;
const coinDuration = 5_000;
const gameLabels = { coinflip: "Coinflip", xo: "XO", wheel: "Vòng quay may mắn" } as const;
const coinFaces = {
  one: { label: "Mặt 1", src: "/games/coinflip/mat-1.webp" },
  two: { label: "Mặt 2", src: "/games/coinflip/dmn.jpg" },
} as const;
const wheelSectorCount = WHEEL_FACTORS.length;
const wheelSectorAngle = 360 / wheelSectorCount;
const wheelProbability = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 2 }).format(1 / wheelSectorCount);

const signedCredits = (cents: number) => (cents > 0 ? "+" : "") + formatCredits(cents);
const factorLabel = (factor: WheelFactor) => "×" + (factor < 0 ? "−" + Math.abs(factor) : factor);

function checkedStake(raw: string, max: number) {
  const stake = Number(raw);
  return Number.isSafeInteger(stake) && stake >= 1 && stake <= max ? stake : undefined;
}

function angleFor(factor: WheelFactor | undefined) {
  return factor === undefined ? 0 : (360 - WHEEL_FACTORS.indexOf(factor) * wheelSectorAngle) % 360;
}

export default function GamesPage({ tab, memberId }: { tab: keyof typeof gameLabels; memberId: string }) {
  const [view, setView] = useState<GamesView>();
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [retry, setRetry] = useState<GameCommand | CoinFlipCommand>();
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [motion, setMotion] = useState<{ spin: WheelSpin; angle: number; moving: boolean }>();
  const [coinMotion, setCoinMotion] = useState<{ id: string; previousBalance: number }>();
  const receive = useCallback((incoming: GamesView) => {
    setView(current => current && current.revision >= incoming.revision ? current : incoming);
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

  useEffect(() => {
    if (!coinMotion) return;
    const timer = window.setTimeout(() => setCoinMotion(undefined), coinDuration);
    return () => clearTimeout(timer);
  }, [coinMotion]);

  async function submit(command: GameCommand | CoinFlipCommand) {
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
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (data.flip && data.flips[0]?.id === data.flip.id && view?.flips[0]?.id !== data.flip.id && !reduceMotion) {
        setCoinMotion({ id: data.flip.id,
          previousBalance: view?.wallet.balanceCents ?? data.flip.balanceCents - (data.flip.walletChangeCents ?? data.flip.netCents) });
      }
      if (data.spin && data.spins[0]?.id === data.spin.id) {
        const previous = motion?.spin.id === view?.spins[0]?.id ? motion?.angle : undefined;
        const start = previous ?? angleFor(view?.spins[0]?.factor);
        const target = angleFor(data.spin.factor);
        const distance = (target - start % 360 + 360) % 360;
        setMotion({
          spin: data.spin, angle: start + 360 * 5 + distance,
          moving: !reduceMotion,
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

  const coinMoving = tab === "coinflip" && !!coinMotion && view?.flips[0]?.id === coinMotion.id;
  const visibleBalance = coinMoving ? coinMotion.previousBalance : view?.wallet.balanceCents;
  return <div className="games-page" aria-label="Trò chơi của Đội">
    <div className="games-heading">
      <div>
        <h1>{gameLabels[tab]}</h1>
        {tab === "xo" && <p>Lập phòng và chơi cùng thành viên trong Đội</p>}
      </div>
      {visibleBalance !== undefined && <div className="games-wallet">
        <Coins size={21} aria-hidden="true" />
        <div><span>Số dư credits</span><strong data-game-balance={visibleBalance}>{formatCredits(visibleBalance)}</strong></div>
      </div>}
    </div>
    {view?.cupidPartnerId && <p className="games-note games-cupid-note">Ví Cupid với <MemberName memberId={view.cupidPartnerId} /> · Số dư hiển thị cho mỗi người</p>}
    {actionError && <div className="games-message" role="alert">
      <span>{actionError}</span>
      {retry && <Button variant="secondary" disabled={busy} onClick={() => void submit(retry)}>Thử lại thao tác</Button>}
    </div>}
    {loadError && <div className="games-message" role="status">
      <span>{loadError}</span><Button variant="secondary" onClick={() => void load()}>Tải lại trò chơi</Button>
    </div>}
    {!view && !loadError && <p className="games-loading" role="status"><LoaderCircle size={18} className="spin" aria-hidden="true" /> Đang tải trò chơi</p>}
    {view && tab === "coinflip" && <CoinFlipGame view={view} moving={coinMoving} disabled={busy || !!retry} onSubmit={submit} />}
    {view && tab === "xo" && <XoGame view={view} memberId={memberId} disabled={busy || !!retry} onSubmit={submit} />}
    {view && tab === "wheel" && <WheelGame view={view} motion={motion} disabled={busy || !!retry} onSubmit={submit} />}
  </div>;
}

function CoinPortrait({ side }: { side: CoinSide }) {
  // The player supplied the artwork for both sides of the coin.
  // eslint-disable-next-line @next/next/no-img-element
  return <img data-side={side} src={coinFaces[side].src} alt="" width="128" height="128" />;
}

function CoinFlipGame({ view, moving, disabled, onSubmit }: {
  view: GamesView;
  moving: boolean;
  disabled: boolean;
  onSubmit: (command: CoinFlipCommand) => Promise<void>;
}) {
  const [pick, setPick] = useState<CoinSide>();
  const [wager, setWager] = useState("1");
  const { maxCoinflipStake, version } = view.wallet;
  const stake = checkedStake(wager, maxCoinflipStake);
  const result = view.flips[0];
  const blocked = disabled || moving || maxCoinflipStake < 1;
  const history = moving ? view.flips.slice(1) : view.flips;

  function flip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blocked && pick && stake !== undefined)
      void onSubmit({ kind: "flip", id: crypto.randomUUID(), stake, pick, walletVersion: version });
  }

  return <div className="coinflip-layout">
    <section className="games-card coinflip-stage" aria-label="Kết quả tung xu">
      <div className="coinflip-scene" aria-hidden="true">
        <div key={result?.id ?? "ready"} className="coinflip-coin" data-side={result?.side ?? pick ?? "one"}
          data-moving={moving} style={{ "--coin-duration": coinDuration + "ms" } as CSSProperties}>
          {COIN_SIDES.map(side => <span key={side} className="coinflip-face" data-side={side}><CoinPortrait side={side} /></span>)}
        </div>
      </div>
      <div className="coinflip-outcome" role="status" data-net={!moving ? result?.netCents : undefined}>
        {moving ? "Đang tung xu…" : result ? <>
          <strong>{coinFaces[result.side].label}</strong>
          <span data-result={Math.sign(result.netCents)}>
            {result.pick === result.side ? "Đoán đúng" : "Đoán sai"} · {signedCredits(result.netCents)} credits
          </span>
          {!!result.loanRepaymentCents && <small>Đã trả nợ {formatCredits(result.loanRepaymentCents)} credits</small>}
          {result.walletChangeCents !== undefined && <small>Ví của bạn {signedCredits(result.walletChangeCents)} credits</small>}
        </> : "Chọn một mặt để bắt đầu"}
      </div>
    </section>
    <section className="games-card coinflip-controls" aria-labelledby="coinflip-choose">
      <h2 id="coinflip-choose">Chọn mặt và đặt cược</h2>
      <form className="coinflip-form" onSubmit={flip}>
        <fieldset className="coinflip-picks" aria-label="Mặt xu" disabled={blocked}>
          {COIN_SIDES.map(side => <label key={side} data-picked={pick === side}>
            <input type="radio" name="coin-side" value={side} required checked={pick === side}
              onChange={() => setPick(side)} />
            <CoinPortrait side={side} />
            <span>{coinFaces[side].label}</span>
          </label>)}
        </fieldset>
        <div className="games-form">
          <Field label="Mức cược Coinflip (credits)">
            <input name="stake" type="number" min="1" max={maxCoinflipStake} step="1" inputMode="numeric" value={wager}
              onChange={event => setWager(event.target.value)} required disabled={blocked} />
          </Field>
          <Button type="submit" disabled={blocked || !pick || stake === undefined}>
            <Coins size={17} aria-hidden="true" /> {moving ? "Đang tung" : "Tung xu"}
          </Button>
          <small className="games-wager-hint">{maxCoinflipStake > 0
            ? "Tối đa " + creditNumber.format(maxCoinflipStake) + " credits"
            : "Bạn cần ít nhất 1 credit khả dụng để chơi"}</small>
        </div>
      </form>
      <p className="games-note">Mỗi mặt có xác suất 50%. Đoán đúng nhận ×{formatCredits(COIN_WIN_PAYOUT_CENTS)} tiền cược, đoán sai mất cược</p>
    </section>
    {history.length > 0 && <details className="games-card games-history coinflip-history">
      <summary>Lượt tung xu gần đây</summary>
      <ul>{history.map(item => <li key={item.id}>
        <span>{coinFaces[item.side].label} · cược {creditNumber.format(item.stake)}</span>
        <strong data-result={Math.sign(item.netCents)}>{signedCredits(item.netCents)}</strong>
      </li>)}</ul>
    </details>}
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

  const largeMatch = current && xoSize(current) === XO_BOARD_SIZE && current.status !== "waiting" && current.status !== "cancelled";
  return <div className="games-xo-layout" data-has-match={!!current} data-large-board={largeMatch || undefined}>
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
        <p className="games-caption">Bàn 20 × 20 · 5 quân liên tiếp thắng · Nhận ×1,95 mức cược · Hòa hoàn cược</p>
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
              <span className="games-caption">{room.size} × {room.size} · {creditNumber.format(room.stake)} credits mỗi người</span>
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
        Chủ phòng <MemberName memberId={confirmation.room.hostId} /> · Bàn {confirmation.room.size} × {confirmation.room.size} · Cược <strong>{creditNumber.format(confirmation.room.stake)} credits</strong>
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
  const repaid = room.winnerLoanRepaymentCents;
  if (room.status === "won") return room.winnerId === memberId
    ? { title: "Bạn thắng", detail: "Nhận " + formatCredits(xoPrizeCents(room.stake)) + " credits" +
      (repaid ? " · Đã trả nợ " + formatCredits(repaid) + " credits" : "") }
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
  const size = xoSize(room);
  const currentMark = markOnTurn(room.moves.length);
  const myTurn = playing && currentMark === (room.hostId === memberId ? "X" : "O");
  const result = !playing && !waiting ? resultFor(room, memberId) : undefined;

  return <section className="games-card games-match">
    <header className="games-match-heading">
      <h2>{isLiveRoom(room) ? "Phòng của bạn" : "Kết quả XO"}</h2>
      <span>{size} × {size} · {xoWinLength(size)} quân để thắng · {creditNumber.format(room.stake)} credits mỗi người</span>
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
    {!waiting && room.status !== "cancelled" && <XoBoard key={room.id} room={room} canPlay={!disabled && myTurn}
      onMove={cell => void onSubmit({ kind: "move", id: room.id, cell, turn: room.moves.length })} />}
    <div className="game-match-actions">
      {waiting && <Button variant="secondary" disabled={disabled}
        onClick={() => void onSubmit({ kind: "cancel", id: room.id })}>Hủy phòng và hoàn cược</Button>}
      {playing && <Button variant="secondary" disabled={disabled} onClick={onSurrender}>Bỏ ván</Button>}
    </div>
  </section>;
}

const wheelColors = ["#e3a38b", "#efb5a1", "#f4c9ab", "#f8d9b9", "#f6efda", "#dce7d5", "#c6ddbc", "#b0d1a5", "#9dc799", "#90bc9d", "#7bab94"];
const wheelFill = "conic-gradient(from " + (-wheelSectorAngle / 2) + "deg, " +
  wheelColors.map((color, index) => color + " " + (100 * index / wheelSectorCount) + "% " +
    (100 * (index + 1) / wheelSectorCount) + "%").join(", ") + ")";
const wheelLabels = WHEEL_FACTORS.map((factor, index) => ({
  factor,
  left: 50 + 36 * Math.sin(2 * Math.PI * index / wheelSectorCount),
  top: 50 - 36 * Math.cos(2 * Math.PI * index / wheelSectorCount),
}));

function WheelGame({ view, motion, disabled, onSubmit }: {
  view: GamesView; motion?: { spin: WheelSpin; angle: number; moving: boolean };
  disabled: boolean; onSubmit: (command: GameCommand) => Promise<void>;
}) {
  const [wager, setWager] = useState("1");
  const { maxWheelStake, version } = view.wallet;
  const { spins, pendingRefundCents } = view.wheelProgress;
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
      <div className="game-wheel" role="img" aria-label="Vòng quay gồm 11 ô đồng xác suất từ âm 4 đến 6"
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
          {!!display.refundCents && <small className="game-wheel-refund">Hoàn cược {signedCredits(display.refundCents)} credits</small>}
          {!!display.loanRepaymentCents && <small>Đã trả nợ {formatCredits(display.loanRepaymentCents)} credits</small>}
          {display.walletChangeCents !== undefined && <small>Ví của bạn {signedCredits(display.walletChangeCents)} credits</small>}
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
        <div className="game-wheel-progress">
          <strong>Hoàn cược {WHEEL_REFUND_PERCENT}%</strong>
          <span>{spins}/{WHEEL_REFUND_EVERY} lượt</span>
          {pendingRefundCents > 0 && <small>Dự kiến hoàn {formatCredits(pendingRefundCents)} credits</small>}
        </div>
        <details className="game-wheel-rules">
          <summary>Cách tính kết quả</summary>
          <p>Cả {wheelSectorCount} ô có xác suất bằng nhau, 1/{wheelSectorCount} hay khoảng {wheelProbability} mỗi ô</p>
          <p>Số dư thay đổi bằng mức cược nhân hệ số rồi trừ mức cược</p>
          <p>Sau mỗi {WHEEL_REFUND_EVERY} lượt, ví nhận lại {WHEEL_REFUND_PERCENT}% phần lỗ ròng sau khi bù trừ các lượt lãi và lỗ</p>
          <p>Nếu hòa vốn hoặc có lãi trong nhóm {WHEEL_REFUND_EVERY} lượt thì mức hoàn là 0</p>
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
          <strong data-result={Math.sign(item.netCents)}>{signedCredits(item.netCents)}
            {!!item.refundCents && <small className="game-wheel-history-refund">Hoàn {signedCredits(item.refundCents)}</small>}
          </strong>
        </li>)}</ul>
      </details>}
    </div>
  </div>;
}
