'use strict';

// Payout multipliers (return on winner bet, including stake)
const PAYOUT_MULTIPLIERS = {
    dragon: 2,   // 1:1 payout → returns 2x stake
    tiger: 2,    // 1:1 payout → returns 2x stake
    tie: 9,      // 8:1 payout → returns 9x stake
};

/**
 * Determine the winner of a round.
 * Only rank matters for Dragon Tiger.
 * @param {number|{rank:number}} dragonCard
 * @param {number|{rank:number}} tigerCard
 * @returns {'dragon'|'tiger'|'tie'}
 */
function determineWinner(dragonCard, tigerCard) {
    const dragonRankRaw = typeof dragonCard === 'object' && dragonCard !== null ? dragonCard.rank : dragonCard;
    const tigerRankRaw = typeof tigerCard === 'object' && tigerCard !== null ? tigerCard.rank : tigerCard;
    const dragonRank = Number(dragonRankRaw);
    const tigerRank = Number(tigerRankRaw);

    if (dragonRank > tigerRank) return 'dragon';
    if (tigerRank > dragonRank) return 'tiger';
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
