'use strict';

const logger = require('../utils/logger');

// Auto-granted balance for all demo players connecting to the server
const DEMO_STARTING_BALANCE = 10000;

// In-Memory Wallet Store:  Map<playerId, balance>
const demoWallets = new Map();

/**
 * Get computed wallet balance for a player.
 * Initializes with DEMO_STARTING_BALANCE if they don't exist yet.
 */
async function getBalance(playerId) {
    if (!demoWallets.has(playerId)) {
        demoWallets.set(playerId, DEMO_STARTING_BALANCE);
    }
    return demoWallets.get(playerId);
}

/**
 * Check if a player has at least `amount` available.
 */
async function hasEnoughBalance(playerId, amount) {
    const balance = await getBalance(playerId);
    return balance >= amount;
}

/**
 * Update a player's balance directly (helper for in-memory mutations)
 */
async function updateBalance(playerId, newBalance) {
    demoWallets.set(playerId, newBalance);
    return newBalance;
}

module.exports = { getBalance, hasEnoughBalance, updateBalance };
