'use strict';

const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Internal helper to insert a ledger entry.
 * @param {object} client - pg client (for transactions) or null to use pool
 * @param {object} entry
 */
async function _insertEntry(client, { playerId, transactionType, amount, referenceId }) {
    const sql = `
    INSERT INTO wallet_ledger (player_id, transaction_type, amount, reference_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
    const params = [playerId, transactionType, amount, referenceId || null];
    const result = client ? await client.query(sql, params) : await query(sql, params);
    return result.rows[0];
}

/**
 * Lock funds for a bet. Stores a NEGATIVE amount (debit).
 * @param {string} playerId
 * @param {number} amount  - positive value; stored as negative
 * @param {string} betId   - reference to the bet
 * @param {object} [client] - pg transaction client
 */
async function lockBet(playerId, amount, betId, client) {
    const entry = await _insertEntry(client, {
        playerId,
        transactionType: 'bet_lock',
        amount: -Math.abs(amount),
        referenceId: betId,
    });
    logger.info('Ledger: bet_lock', { playerId, amount: -Math.abs(amount), betId });
    return entry;
}

/**
 * Release a locked bet (e.g., on loss or refund).
 * Returns the locked amount as a POSITIVE credit.
 * @param {string} playerId
 * @param {number} amount  - original locked amount (positive)
 * @param {string} betId
 * @param {string} [type='bet_release'] - 'bet_release' | 'payout'
 * @param {object} [client]
 */
async function creditEntry(playerId, amount, betId, type = 'bet_release', client) {
    const allowedTypes = ['bet_release', 'payout'];
    if (!allowedTypes.includes(type)) throw new Error(`Invalid ledger type: ${type}`);

    const entry = await _insertEntry(client, {
        playerId,
        transactionType: type,
        amount: Math.abs(amount),
        referenceId: betId,
    });
    logger.info(`Ledger: ${type}`, { playerId, amount: Math.abs(amount), betId });
    return entry;
}

/**
 * Record a deposit credit entry.
 * @param {string} playerId
 * @param {number} amount
 * @param {string} transactionId - payment transaction reference
 */
async function deposit(playerId, amount, transactionId) {
    const entry = await _insertEntry(null, {
        playerId,
        transactionType: 'deposit',
        amount: Math.abs(amount),
        referenceId: transactionId,
    });
    logger.info('Ledger: deposit', { playerId, amount, transactionId });
    return entry;
}

module.exports = { lockBet, creditEntry, deposit };
