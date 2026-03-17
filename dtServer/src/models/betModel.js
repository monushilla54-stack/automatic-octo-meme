'use strict';

const logger = require('../utils/logger');

// In-Memory Bet Store: Array of bet objects
const demoBets = [];

/**
 * Create a bet record.
 */
async function createBet({ clientBetId, playerId, roundId, betArea, amount }) {
    const bet = {
        bet_id: `bet_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        client_bet_id: clientBetId,
        player_id: playerId,
        round_id: roundId,
        bet_area: betArea,
        amount: amount,
        status: 'active',
        created_at: new Date().toISOString()
    };
    
    demoBets.push(bet);
    return bet;
}

/**
 * Get all bets for a given round.
 */
async function getBetsForRound(roundId) {
    return demoBets.filter(b => b.round_id === roundId);
}

/**
 * Get all bets placed by a player in a specific round.
 */
async function getPlayerBetsForRound(playerId, roundId) {
    return demoBets.filter(b => b.player_id === playerId && b.round_id === roundId);
}

/**
 * Update bet status (won/lost/refunded).
 */
async function updateBetStatus(betId, status) {
    const bet = demoBets.find(b => b.bet_id === betId);
    if (bet) {
        bet.status = status;
    }
}

module.exports = { createBet, getBetsForRound, getPlayerBetsForRound, updateBetStatus };
