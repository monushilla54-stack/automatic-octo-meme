'use strict';

// Payout multipliers (return on winner bet, including stake)
const PAYOUT_MULTIPLIERS = {
    dragon: 2,   // 1:1 payout → returns 2x stake
    tiger: 2,    // 1:1 payout → returns 2x stake
    tie: 9,      // 8:1 payout → returns 9x stake
};

/**
 * Determine the winner of a round.
 * @param {number} dragonCard
 * @param {number} tigerCard
 * @returns {'dragon'|'tiger'|'tie'}
 */
function determineWinner(dragonCard, tigerCard) {
    if (dragonCard > tigerCard) return 'dragon';
    if (tigerCard > dragonCard) return 'tiger';
    return 'tie';
}

/**
 * Calculate the payout for a winning bet.
 * Returns 0 for losing bets.
 * @param {string} betArea - 'dragon' | 'tiger' | 'tie'
 * @param {string} winner  - 'dragon' | 'tiger' | 'tie'
 * @param {number} betAmount
 * @returns {number} Total payout (including returned stake). 0 if bet lost.
 */
function calculatePayout(betArea, winner, betAmount) {
    if (betArea !== winner) return 0;
    return parseFloat((betAmount * PAYOUT_MULTIPLIERS[betArea]).toFixed(2));
}

module.exports = { determineWinner, calculatePayout, PAYOUT_MULTIPLIERS };
