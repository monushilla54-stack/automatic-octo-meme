'use strict';

const walletService = require('./walletService');
const logger = require('../utils/logger');

/**
 * Lock funds for a bet. Stores a NEGATIVE amount (debit).
 * @param {string} playerId
 * @param {number} amount  - positive value; stored as negative
 * @param {string} betId   - reference to the bet
 */
async function lockBet(playerId, amount, betId) {
    const currentBalance = await walletService.getBalance(playerId);
    const newBalance = currentBalance - Math.abs(amount);
    await walletService.updateBalance(playerId, newBalance);
    
    logger.info('Ledger: bet_lock', { playerId, amount: -Math.abs(amount), betId });
    return { playerId, type: 'bet_lock', amount: -Math.abs(amount), newBalance };
}

/**
 * Release a locked bet (e.g., on loss or refund) or Payout a winner.
 * Returns the locked amount as a POSITIVE credit.
 * @param {string} playerId
 * @param {number} amount  - amount to add (positive)
 * @param {string} betId
 * @param {string} [type='bet_release'] - 'bet_release' | 'payout'
 */
async function creditEntry(playerId, amount, betId, type = 'bet_release') {
    const currentBalance = await walletService.getBalance(playerId);
    const newBalance = currentBalance + Math.abs(amount);
    await walletService.updateBalance(playerId, newBalance);

    logger.info(`Ledger: ${type}`, { playerId, amount: Math.abs(amount), betId });
    return { playerId, type, amount: Math.abs(amount), newBalance };
}

/**
 * Record a deposit credit entry.
 */
async function deposit(playerId, amount, transactionId) {
    const currentBalance = await walletService.getBalance(playerId);
    const newBalance = currentBalance + Math.abs(amount);
    await walletService.updateBalance(playerId, newBalance);

    logger.info('Ledger: deposit', { playerId, amount, transactionId });
    return { playerId, type: 'deposit', amount: Math.abs(amount), newBalance };
}

module.exports = { lockBet, creditEntry, deposit };
