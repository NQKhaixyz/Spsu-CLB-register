const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const suits = ["spades", "hearts", "clubs", "diamonds"] as const;
export type BlackjackCard = { rank: typeof ranks[number]; suit: typeof suits[number] };

export const BLACKJACK_MOVES = ["hit", "stand", "double", "split"] as const;
export type BlackjackMove = typeof BLACKJACK_MOVES[number];
export type BlackjackCommand =
  | { kind: "blackjackStart"; id: string; stake: number; walletVersion: number }
  | { kind: "blackjackMove"; id: string; turn: number; move: BlackjackMove; walletVersion: number };

export const BLACKJACK_WIN_RETURN = 2;
export const BLACKJACK_NATURAL_RETURN = 2.5;

type Hand = { cards: BlackjackCard[]; stake: number };
type PlayingHand = Hand & { complete?: true };
type HandOutcome = "blackjack" | "win" | "push" | "loss" | "bust";
export type BlackjackRound = {
  id: string;
  stake: number;
  deck: BlackjackCard[];
  dealer: BlackjackCard[];
  hands: PlayingHand[];
  moves: BlackjackMove[];
  walletChangeCents: number;
};
export type BlackjackResult = {
  id: string;
  stake: number;
  at: number;
  dealer: BlackjackCard[];
  hands: (Hand & { outcome: HandOutcome; payoutCents: number })[];
  payoutCents: number;
  netCents: number;
  walletChangeCents: number;
  loanRepaymentCents?: number;
  autoStood?: true;
};
export type BlackjackView = {
  maxStake: number;
  active?: {
    id: string;
    turn: number;
    dealerUpCard: BlackjackCard;
    hands: Hand[];
    handIndex: number;
    canDouble: boolean;
    canSplit: boolean;
  };
  recent: BlackjackResult[];
};

export function shuffleBlackjackDeck(drawIndex: (count: number) => number): BlackjackCard[] {
  const deck = suits.flatMap(suit => ranks.map(rank => ({ rank, suit })));
  for (let index = deck.length - 1; index > 0; index--) {
    const other = drawIndex(index + 1);
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  return deck;
}

export function blackjackValue(cards: readonly BlackjackCard[]) {
  let total = 0;
  let aces = 0;
  for (const { rank } of cards) {
    if (rank === "A") {
      aces++;
      total++;
    } else {
      total += Math.min(ranks.indexOf(rank) + 1, 10);
    }
  }
  const soft = aces > 0 && total <= 11;
  return { total: soft ? total + 10 : total, soft };
}

function natural(cards: readonly BlackjackCard[]) {
  return cards.length === 2 && blackjackValue(cards).total === 21;
}

function takeCard(round: BlackjackRound) {
  const card = round.deck.shift();
  if (!card) throw new Error("Bộ bài Blackjack không còn lá để chia");
  return card;
}

export function dealBlackjack(id: string, stake: number, deck: BlackjackCard[]): BlackjackRound {
  const round: BlackjackRound = { id, stake, deck: [...deck], dealer: [], hands: [], moves: [], walletChangeCents: 0 };
  const playerFirst = takeCard(round);
  const dealerFirst = takeCard(round);
  const cards = [playerFirst, takeCard(round)];
  round.dealer = [dealerFirst, takeCard(round)];
  round.hands = [{ cards, stake, complete: natural(cards) || natural(round.dealer) ? true : undefined }];
  return round;
}

export function blackjackHandIndex(round: BlackjackRound) {
  return round.hands.findIndex(hand => !hand.complete);
}

export function blackjackOptions(round: BlackjackRound) {
  const hand = round.hands[blackjackHandIndex(round)];
  const canDouble = hand?.cards.length === 2;
  return { canDouble, canSplit: canDouble && round.hands.length === 1 && hand.cards[0].rank === hand.cards[1].rank };
}

export function playBlackjack(round: BlackjackRound, move: BlackjackMove) {
  const hand = round.hands[blackjackHandIndex(round)];
  if (move === "split") {
    const splitAces = hand.cards[0].rank === "A";
    round.hands = hand.cards.map(card => {
      const cards = [card, takeCard(round)];
      return { cards, stake: hand.stake, complete: splitAces || blackjackValue(cards).total === 21 ? true : undefined };
    });
  } else {
    if (move === "double") hand.stake *= 2;
    if (move !== "stand") hand.cards.push(takeCard(round));
    if (move !== "hit" || blackjackValue(hand.cards).total >= 21) hand.complete = true;
  }
  round.moves.push(move);
}

export function blackjackTotalStake(round: BlackjackRound) {
  return round.hands.reduce((total, hand) => total + hand.stake, 0);
}

export function resolveBlackjack(
  round: BlackjackRound, at: number, centsPerCredit: number,
): Omit<BlackjackResult, "walletChangeCents" | "loanRepaymentCents"> {
  const playerNatural = round.hands.length === 1 && natural(round.hands[0].cards);
  const dealerNatural = natural(round.dealer);
  if (!playerNatural && !dealerNatural && round.hands.some(hand => blackjackValue(hand.cards).total <= 21)) {
    while (blackjackValue(round.dealer).total < 17) round.dealer.push(takeCard(round));
  }
  const dealerValue = blackjackValue(round.dealer).total;
  const hands = round.hands.map(({ cards, stake }) => {
    const total = blackjackValue(cards).total;
    let outcome: HandOutcome;
    if (total > 21) outcome = "bust";
    else if (playerNatural) outcome = dealerNatural ? "push" : "blackjack";
    else if (dealerNatural) outcome = "loss";
    else if (dealerValue > 21 || total > dealerValue) outcome = "win";
    else outcome = total === dealerValue ? "push" : "loss";
    const returned = outcome === "blackjack" ? BLACKJACK_NATURAL_RETURN : outcome === "win" ? BLACKJACK_WIN_RETURN : outcome === "push" ? 1 : 0;
    return { cards, stake, outcome, payoutCents: stake * (returned * centsPerCredit) };
  });
  const payoutCents = hands.reduce((total, hand) => total + hand.payoutCents, 0);
  return { id: round.id, stake: round.stake, at, dealer: round.dealer, hands,
    payoutCents, netCents: payoutCents - blackjackTotalStake(round) * centsPerCredit };
}
