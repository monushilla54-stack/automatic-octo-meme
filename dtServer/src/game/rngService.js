'use strict';

const { randomInt, randomBytes, createHash } = require('crypto');

const SUITS = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function getCardColor(suit) {
  return suit === 'Diamonds' || suit === 'Hearts' ? 'Red' : 'Black';
}

function cardLabel(cardOrRank) {
  const rank = typeof cardOrRank === 'object' && cardOrRank !== null
    ? cardOrRank.rank
    : cardOrRank;

  const labels = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  return labels[rank] || String(rank);
}

function cardName(card) {
  return `${cardLabel(card)} of ${card.suit}`;
}

function createDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        color: getCardColor(suit),
      });
    }
  }

  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function drawTwoCards() {
  const deck = shuffleDeck(createDeck());
  const dragonBase = deck.pop();
  const tigerBase = deck.pop();

  const dragonCard = {
    ...dragonBase,
    label: cardLabel(dragonBase),
    name: cardName(dragonBase),
  };

  const tigerCard = {
    ...tigerBase,
    label: cardLabel(tigerBase),
    name: cardName(tigerBase),
  };

  return { dragonCard, tigerCard };
}

function serializeCard(card) {
  return `${card.suit}-${card.rank}`;
}

/**
 * Generate cards + a provably fair commitment.
 *
 * How it works:
 *   1. Create and shuffle a full 52-card deck using CSPRNG.
 *   2. Draw one unique card for Dragon and one unique card for Tiger.
 *   3. Generate a random 32-byte nonce (kept secret until result reveal).
 *   4. Compute commitmentHash = SHA256("dragonCard:tigerCard:nonce")
 *   5. Publish ONLY commitmentHash to players before betting opens.
 *   6. After result, publish dragonCard + tigerCard + nonce.
 */
function generateRoundCommitment() {
  const { dragonCard, tigerCard } = drawTwoCards();
  const nonce = randomBytes(32).toString('hex');

  const payload = `${serializeCard(dragonCard)}:${serializeCard(tigerCard)}:${nonce}`;
  const commitmentHash = createHash('sha256').update(payload).digest('hex');

  return { dragonCard, tigerCard, nonce, commitmentHash };
}

function verifyCommitment({ dragonCard, tigerCard, nonce, commitmentHash }) {
  const payload = `${serializeCard(dragonCard)}:${serializeCard(tigerCard)}:${nonce}`;
  const expected = createHash('sha256').update(payload).digest('hex');
  return expected === commitmentHash;
}

module.exports = {
  SUITS,
  RANKS,
  cardLabel,
  cardName,
  createDeck,
  drawTwoCards,
  generateRoundCommitment,
  getCardColor,
  serializeCard,
  shuffleDeck,
  verifyCommitment,
};
