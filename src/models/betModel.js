'use strict';

const { query } = require('../config/database');

/**
 * Create a bet record.
 */
async function createBet({ clientBetId, playerId, roundId, betArea, amount }) {
    const result = await query(
        `INSERT INTO bets (client_bet_id, player_id, round_id, bet_area, amount)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING bet_id, client_bet_id, player_id, round_id, bet_area, amount, created_at`,
        [clientBetId, playerId, roundId, betArea, amount]
    );
    return result.rows[0];
}

/**
 * Get all bets for a given round.
 */
async function getBetsForRound(roundId) {
    const result = await query(
        'SELECT * FROM bets WHERE round_id = $1',
        [roundId]
    );
    return result.rows;
}

/**
 * Get all bets placed by a player in a specific round.
 */
async function getPlayerBetsForRound(playerId, roundId) {
    const result = await query(
        'SELECT * FROM bets WHERE player_id = $1 AND round_id = $2',
        [playerId, roundId]
    );
    return result.rows;
}

/**
 * Update bet status (won/lost/refunded).
 */
async function updateBetStatus(betId, status) {
    await query(
        'UPDATE bets SET status = $1 WHERE bet_id = $2',
        [status, betId]
    );
}

module.exports = { createBet, getBetsForRound, getPlayerBetsForRound, updateBetStatus };
