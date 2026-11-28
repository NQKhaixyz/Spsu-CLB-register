import type { BlackjackCard, BlackjackCommand, BlackjackView } from "./blackjack";

type Hand = NonNullable<BlackjackView["active"]>["hands"][number];
type CardMotion = { seat: "dealer" | number; index: number; phase: "deal" | "flip-back" | "flip-face" };
export type BlackjackFrame = {
  hands: Hand[];
  dealer: BlackjackCard[];
  hole: boolean;
  activeHand?: number;
  motion: CardMotion;
  duration: number;
  status: string;
};

const dealTime = 230;
const flipTime = 180;

export function blackjackPosition(view: BlackjackView) {
  if (view.active) return `${view.active.id}:${view.active.turn}`;
  return view.recent[0]?.id;
}

export function blackjackFrames(command: BlackjackCommand, before: BlackjackView, after: BlackjackView): BlackjackFrame[] {
  if (blackjackPosition(before) === blackjackPosition(after)) return [];
  const outcome = after.active ? undefined : after.recent[0];
  const current = after.active ?? outcome;
  if (current?.id !== command.id) return [];
  const dealer = outcome?.dealer ?? (after.active ? [after.active.dealerUpCard] : []);
  const upcard = dealer.slice(0, 1);
  const frames: BlackjackFrame[] = [];
  const deal = (hands: Hand[], house: BlackjackCard[], hole: boolean, seat: CardMotion["seat"], index: number,
    status: string, activeHand?: number) => {
    frames.push({ hands, dealer: house, hole, activeHand, duration: dealTime, status, motion: { seat, index, phase: "deal" } });
  };

  if (command.kind === "blackjackStart") {
    if (after.active && after.active.turn !== 0) return [];
    const [hand] = current.hands;
    const first = [{ ...hand, cards: hand.cards.slice(0, 1) }];
    const status = "Đang chia bài";
    deal(first, [], false, 0, 0, status);
    deal(first, upcard, false, "dealer", 0, status);
    deal(current.hands, upcard, false, 0, 1, status);
    deal(current.hands, upcard, true, "dealer", 1, status);
  } else {
    const previous = before.active;
    if (!previous || previous.id !== command.id || previous.turn !== command.turn ||
        (after.active && after.active.turn !== command.turn + 1)) return [];
    if (command.move === "hit" || command.move === "double") {
      const handIndex = previous.handIndex;
      const cardIndex = previous.hands[handIndex].cards.length;
      if (current.hands[handIndex].cards.length > cardIndex)
        deal(current.hands, upcard, true, handIndex, cardIndex, "Đang rút bài", handIndex);
    } else if (command.move === "split" && current.hands.length === 2) {
      const [first, second] = current.hands;
      deal([first, { ...second, cards: second.cards.slice(0, 1) }], upcard, true, 0, 1, "Đang chia cho hai tay", 0);
      deal(current.hands, upcard, true, 1, 1, "Đang chia cho hai tay", 0);
    }
  }

  if (outcome) {
    const reveal = { hands: outcome.hands, duration: flipTime, status: "Nhà cái lật bài" };
    frames.push({ ...reveal, dealer: upcard, hole: true, motion: { seat: "dealer", index: 1, phase: "flip-back" } });
    frames.push({ ...reveal, dealer: dealer.slice(0, 2), hole: false, motion: { seat: "dealer", index: 1, phase: "flip-face" } });
    for (let index = 2; index < dealer.length; index++)
      deal(outcome.hands, dealer.slice(0, index + 1), false, "dealer", index, "Nhà cái rút bài");
  }
  return frames;
}
