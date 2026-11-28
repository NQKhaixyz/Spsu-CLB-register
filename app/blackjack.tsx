"use client";

import { useState, type FormEvent } from "react";
import { BookOpen, Layers2, Plus, Spade, Square } from "lucide-react";
import { blackjackValue, type BlackjackCard, type BlackjackCommand, type BlackjackMove, type BlackjackView } from "../lib/blackjack";
import type { BlackjackFrame } from "../lib/blackjack-presentation";
import { formatCredits } from "../lib/games";
import { Button, Field } from "./ui";

const suitFaces = {
  spades: { glyph: "♠", label: "bích" },
  hearts: { glyph: "♥", label: "cơ", red: true },
  clubs: { glyph: "♣", label: "tép" },
  diamonds: { glyph: "♦", label: "rô", red: true },
} as const;
const outcomeLabels = { blackjack: "Blackjack", win: "Thắng", push: "Hòa", loss: "Thua", bust: "Quắc" } as const;
const historyTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const signedCredits = (cents: number) => (cents > 0 ? "+" : "") + formatCredits(cents);

function CardRow({ cards, hole = false, frame, seat }: {
  cards: BlackjackCard[]; hole?: boolean; frame?: BlackjackFrame; seat?: BlackjackFrame["motion"]["seat"];
}) {
  const motion = frame && frame.motion.seat === seat ? frame.motion : undefined;
  const timing = frame && { animationDuration: `${frame.duration}ms` };
  const slots = Math.max(2, cards.length + Number(hole));
  return <ol className="blackjack-cards" aria-label="Các lá bài">
    {Array.from({ length: slots }, (_, index) => {
      const phase = motion?.index === index ? motion.phase : undefined;
      const style = phase ? timing : undefined;
      const card = cards[index];
      if (!card) {
        if (hole && index === cards.length) return <li key={index} className="blackjack-card blackjack-card-back"
          aria-label="Lá úp của nhà cái" data-motion={phase} style={style}><Spade aria-hidden="true" /></li>;
        return <li key={index} className="blackjack-card blackjack-card-empty" aria-hidden="true"><Spade /></li>;
      }
      const face = suitFaces[card.suit];
      return <li key={index} className="blackjack-card" data-color={"red" in face ? "red" : undefined}
        data-motion={phase} style={style}
        aria-label={card.rank + " " + face.label}>
        <span className="blackjack-card-corner" aria-hidden="true">{card.rank}<span>{face.glyph}</span></span>
        <span className="blackjack-card-suit" aria-hidden="true">{face.glyph}</span>
      </li>;
    })}
  </ol>;
}

function roundLabel(result: BlackjackView["recent"][number]) {
  if (result.hands[0]?.outcome === "blackjack") return "Blackjack";
  if (result.netCents > 0) return "Bạn thắng";
  if (result.netCents === 0) return "Hòa vốn";
  return result.hands.every(hand => hand.outcome === "bust") ? "Quắc bài" : "Bạn thua";
}

export default function BlackjackGame({ view, animation, walletVersion, disabled, onSubmit }: {
  view: BlackjackView;
  animation?: { id: string; frame: BlackjackFrame };
  walletVersion: number;
  disabled: boolean;
  onSubmit: (command: BlackjackCommand) => Promise<void>;
}) {
  const [wager, setWager] = useState<string>();
  const { active, recent, maxStake } = view;
  const frame = animation?.frame;
  const last = recent[0];
  const settled = active || frame ? undefined : last;
  const resultTone = settled && (settled.netCents > 0 ? "win" : settled.netCents < 0 ? "loss" : "push");
  const hands = frame?.hands ?? active?.hands ?? settled?.hands ?? [];
  const dealer = frame?.dealer ?? (active ? [active.dealerUpCard] : settled?.dealer ?? []);
  const hole = frame ? frame.hole : !!active;
  const activeHand = frame ? frame.activeHand : active?.handIndex;
  const amount = wager ?? String(Math.min(maxStake, last?.stake ?? 100) || "");
  const stake = Number(amount);
  const canDeal = !disabled && Number.isSafeInteger(stake) && stake >= 1 && stake <= maxStake;
  const hand = active && active.hands[active.handIndex];

  function deal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canDeal) void onSubmit({ kind: "blackjackStart", id: crypto.randomUUID(), stake, walletVersion });
  }

  function move(choice: BlackjackMove) {
    if (active && !disabled)
      void onSubmit({ kind: "blackjackMove", id: active.id, turn: active.turn, move: choice, walletVersion });
  }

  return <div className="blackjack-layout">
    <div className="blackjack-play">
      <section className="blackjack-table" aria-label="Bàn Blackjack" data-turn={active?.turn}
        data-round={animation?.id ?? active?.id ?? settled?.id}>
        <div className="blackjack-dealer">
          <div className="blackjack-seat">
            <h2><Spade size={16} aria-hidden="true" /> Nhà cái</h2>
            {dealer.length > 0 && <span className="blackjack-score">{blackjackValue(dealer).total}{hole ? " + ?" : ""} điểm</span>}
          </div>
          <CardRow cards={dealer} hole={hole} frame={frame} seat="dealer" />
        </div>

        <div className="blackjack-table-line" role="status" data-outcome={resultTone}>
          {frame ? <span>{frame.status}</span>
            : settled ? <span><strong>{roundLabel(settled)}</strong> {signedCredits(settled.netCents)} credits</span>
              : active ? <span>Đang cược <strong>{formatCredits(active.hands.reduce((total, item) => total + item.stake, 0) * 100)} credits</strong></span>
              : <span>Blackjack trả lãi <strong>3:2</strong></span>}
        </div>

        <div className="blackjack-player">
          <div className="blackjack-seat">
            <h2>Bài của bạn</h2>
            {hands.length === 1 && <span className="blackjack-score">{blackjackValue(hands[0].cards).total} điểm</span>}
          </div>
          {hands.length === 0 ? <CardRow cards={[]} /> :
            <div className="blackjack-hands" data-split={hands.length === 2 ? "true" : undefined}>
              {hands.map((item, index) => {
                const result = settled?.hands[index];
                return <div className="blackjack-hand" key={index} aria-current={activeHand === index ? "step" : undefined}>
                  {hands.length > 1 && <div className="blackjack-hand-meta">
                    <strong>Tay {index + 1}</strong>
                    <span>{blackjackValue(item.cards).total} điểm</span>
                  </div>}
                  <CardRow cards={item.cards} frame={frame} seat={index} />
                  {hands.length > 1 && result && <div className="blackjack-hand-result" data-result={result.outcome}>
                    {outcomeLabels[result.outcome]} · {signedCredits(result.payoutCents - item.stake * 100)} credits
                  </div>}
                </div>;
              })}
            </div>}
        </div>
      </section>

      <section className="games-card blackjack-controls" aria-label="Thao tác Blackjack">
        {active && hand ? <>
          <div className="blackjack-controls-heading">
            <h2>{hands.length > 1 ? `Đang chơi tay ${active.handIndex + 1}` : "Đến lượt bạn"}</h2>
            <span className="games-caption">{formatCredits(hand.stake * 100)} credits</span>
          </div>
          <div className="blackjack-actions">
            <Button disabled={disabled} onClick={() => move("hit")}><Plus size={17} aria-hidden="true" /> Rút bài</Button>
            <Button variant="secondary" disabled={disabled} onClick={() => move("stand")}><Square size={15} aria-hidden="true" /> Dừng</Button>
            <Button variant="secondary" disabled={disabled || !active.canDouble} onClick={() => move("double")}>Gấp đôi</Button>
            <Button variant="secondary" disabled={disabled || !active.canSplit} onClick={() => move("split")}>
              <Layers2 size={16} aria-hidden="true" /> Tách bài
            </Button>
          </div>
          {active.canDouble && <p className="games-caption">
            {active.canSplit ? "Gấp đôi hoặc tách bài" : "Gấp đôi"} thêm {formatCredits(hand.stake * 100)} credits vào tiền cược
          </p>}
        </> : <>
          <div className="blackjack-controls-heading">
            <h2>Đặt cược</h2>
            <span className="games-caption">{formatCredits(maxStake * 100)} credits có thể cược</span>
          </div>
          <form className="blackjack-bet" onSubmit={deal}>
            <Field label="Mức cược (credits)">
              <input type="number" inputMode="numeric" min={1} max={maxStake} step={1} value={amount}
                onChange={event => setWager(event.target.value)} disabled={disabled || maxStake === 0} required />
            </Field>
            <Button type="submit" disabled={!canDeal}>{last ? "Chia ván mới" : "Chia bài"}</Button>
            {maxStake > 0 && <div className="blackjack-bet-presets" aria-label="Mức cược nhanh">
              {[100, 500, 1000].filter(preset => preset <= maxStake).map(preset => <Button key={preset} variant="secondary"
                disabled={disabled} onClick={() => setWager(String(preset))}>{formatCredits(preset * 100)}</Button>)}
              <Button variant="secondary" disabled={disabled} onClick={() => setWager(String(maxStake))}>Tối đa</Button>
            </div>}
          </form>
        </>}
      </section>
    </div>

    <aside className="blackjack-info" aria-label="Luật và lịch sử Blackjack">
      {settled && <section className="games-card blackjack-settlement" aria-labelledby="blackjack-result-heading">
        <h2 id="blackjack-result-heading">Kết quả ván</h2>
        <dl>
          <div><dt>Đã cược</dt><dd>{formatCredits(settled.hands.reduce((total, item) => total + item.stake, 0) * 100)}</dd></div>
          <div><dt>Nhận về</dt><dd>{formatCredits(settled.payoutCents)}</dd></div>
          {settled.loanRepaymentCents !== undefined && <div><dt>Tự trả nợ</dt><dd>{signedCredits(-settled.loanRepaymentCents)}</dd></div>}
          <div className="blackjack-wallet-change"><dt>Biến động ví</dt><dd data-tone={Math.sign(settled.walletChangeCents)}>{signedCredits(settled.walletChangeCents)}</dd></div>
        </dl>
        {settled.autoStood && <p className="games-caption">Ván đã tự dừng khi chốt ví</p>}
      </section>}
      <details className="games-card blackjack-rules">
        <summary><BookOpen size={17} aria-hidden="true" /> Luật chơi</summary>
        <ul>
          <li>Thắng nếu gần 21 hơn nhà cái hoặc nhà cái quắc. Vượt 21 là quắc và mất cược. Bằng điểm được hoàn cược.</li>
          <li>Át tính 1 hoặc 11. J, Q và K tính 10. Nhà cái rút đến ít nhất 17 điểm.</li>
          <li>Át và một lá 10 điểm ngay lúc chia trả lãi 3:2. Thắng thường trả lãi 1:1. Hai bên cùng có Blackjack thì hòa.</li>
          <li>Gấp đôi tiền cược khi có hai lá và nhận đúng một lá nữa. Có thể tách một lần nếu hai lá cùng hạng. Mỗi tay tách Át chỉ nhận thêm một lá.</li>
          <li>Mỗi ván dùng một bộ bài 52 lá do máy chủ xáo. Khi gộp hoặc tách ví Cupid, ván đang chơi sẽ dừng để chốt số dư.</li>
        </ul>
      </details>
      {recent.length > 0 && <section className="games-card games-history blackjack-history" aria-labelledby="blackjack-history-heading">
        <h2 id="blackjack-history-heading">Ván gần đây</h2>
        <ul>
          {recent.map(result => <li key={result.id}>
            <div><strong>{roundLabel(result)}</strong><time dateTime={new Date(result.at).toISOString()}>{historyTime.format(result.at)}</time></div>
            <strong data-tone={Math.sign(result.walletChangeCents)}>{signedCredits(result.walletChangeCents)} <span>credits</span></strong>
          </li>)}
        </ul>
      </section>}
    </aside>
  </div>;
}
