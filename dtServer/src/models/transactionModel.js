'use strict';

const { query } = require('../config/database');

/**
 * Create a payment transaction record.
 */
async function createTransaction({ playerId, amount }) {
    const result = await query(
        `INSERT INTO payment_transactions (player_id, amount, status)
     VALUES ($1, $2, 'pending')
     RETURNING transaction_id, player_id, amount, status, created_at`,
        [playerId, amount]
    );
    return result.rows[0];
}

/**
 * Update the status of a payment transaction.
 */
async function updateTransactionStatus(transactionId, status) {
    const result = await query(
        `UPDATE payment_transactions SET status = $1 WHERE transaction_id = $2 RETURNING *`,
        [status, transactionId]
    );
    return result.rows[0];
}

module.exports = { createTransaction, updateTransactionStatus };
