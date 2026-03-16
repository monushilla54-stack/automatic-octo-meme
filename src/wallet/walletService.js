'use strict';

const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Get computed wallet balance for a player.
 * Balance = SUM of all ledger entries (credits positive, debits negative).
 */
async function getBalance(playerId) {
    const result = await query(
        `SELECT COALESCE(SUM(amount), 0)::FLOAT AS balance
     FROM wallet_ledger
     WHERE player_id = $1`,
        [playerId]
    );
    return parseFloat(result.rows[0].balance);
}

/**
 * Check if a player has at least `amount` available.
 */
async function hasEnoughBalance(playerId, amount) {
    const balance = await getBalance(playerId);
    return balance >= amount;
}

module.exports = { getBalance, hasEnoughBalance };
