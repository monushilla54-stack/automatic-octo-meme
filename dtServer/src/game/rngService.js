'use strict';

const { randomInt, randomBytes, createHash } = require('crypto');

/**
 * Generate a cryptographically secure card value (1–13).
 */
function generateCard() {
  return randomInt(1, 14); // [1, 14) → 1..13
}

/**
 * Generate cards + a provably fair commitment.
 *
 * How it works:
 *   1. Generate dragonCard and tigerCard using CSPRNG.
 *   2. Generate a random 32-byte nonce (kept secret until result reveal).
 *   3. Compute commitmentHash = SHA256("dragonCard:tigerCard:nonce")
 *   4. Publish ONLY commitmentHash to players before betting opens.
 *   5. After result, publish dragonCard + tigerCard + nonce.
 *   6. Anyone can verify: SHA256(dragonCard + ':' + tigerCard + ':' + nonce) === commitmentHash
 *
 * This proves the server could NOT have changed the result after seeing bets.
 */
function generateRoundCommitment() {
  const dragonCard = generateCard();
  const tigerCard  = generateCard();
  const nonce      = randomBytes(32).toString('hex'); // 64-char hex string

  const payload        = `${dragonCard}:${tigerCard}:${nonce}`;
  const commitmentHash = createHash('sha256').update(payload).digest('hex');

  return { dragonCard, tigerCard, nonce, commitmentHash };
}

/**
 * Verify a commitment (utility — used by the /verify endpoint).
 */
function verifyCommitment({ dragonCard, tigerCard, nonce, commitmentHash }) {
  const payload  = `${dragonCard}:${tigerCard}:${nonce}`;
  const expected = createHash('sha256').update(payload).digest('hex');
  return expected === commitmentHash;
}

/**
 * Human-readable card label.
 */
function cardLabel(value) {
  const labels = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  return labels[value] || String(value);
}

module.exports = { generateRoundCommitment, verifyCommitment, cardLabel };
