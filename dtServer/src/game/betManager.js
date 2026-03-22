'use strict';

const { getClient } = require('../config/redis');
const betModel = require('../models/betModel');
const walletService = require('../wallet/walletService');
const ledgerService = require('../wallet/ledgerService');
const validationService = require('../services/validationService');
const { game } = require('../config/environment');
const logger = require('../utils/logger');

// Replay protection window: reject bets with timestamps older than this
const REPLAY_WINDOW_MS = 15000;
// Close betting this many ms before betEndTime to absorb network latency
const EARLY_CLOSE_MS = 500;

/**
 * Process a PLACE_BET event from a player.
 */
async function processBet({ playerId, roundId, tableId, betEndTime, data }) {
    // --- 1. Validate message schema ---
    const { error, value } = validationService.validateBetMessage(data);
    if (error) {
        return { success: false, reason: `invalid_payload: ${error.details[0].message}` };
    }

    const { betId, area, amount, timestamp } = value;

    // --- 2. Replay protection ---
    const now = Date.now();
    if (now - timestamp > REPLAY_WINDOW_MS) {
        logger.warn('Replay attack detected', { playerId, betId, timestamp, now });
        return { success: false, reason: 'timestamp_expired' };
    }

    // --- 3. Betting window check (server-authoritative, early close) ---
    const effectiveCloseTime = betEndTime - EARLY_CLOSE_MS;
    if (now >= effectiveCloseTime) {
        return { success: false, reason: 'betting_closed' };
    }

    // --- 4. Bet amount limits ---
    if (amount < game.minBet || amount > game.maxBet) {
        return { success: false, reason: `amount_out_of_range: min=${game.minBet} max=${game.maxBet}` };
    }

    // --- 5. Duplicate bet protection (Redis Set) ---
    const redis = await getClient();
    const dedupKey = `table:${tableId}:processed_bets`;
    const isNew = await redis.sAdd(dedupKey, betId);
    // sAdd returns number of elements added; 0 means already existed
    if (isNew === 0) {
        logger.warn('Duplicate bet rejected', { playerId, betId });
        return { success: false, reason: 'duplicate' };
    }
    // Set expiry so Redis doesn't grow unbounded (keep for 2 minutes)
    await redis.expire(dedupKey, 120);

    // --- 6. Balance check ---
    const hasFunds = await walletService.hasEnoughBalance(playerId, amount);
    if (!hasFunds) {
        await redis.sRem(dedupKey, betId);
        return { success: false, reason: 'insufficient_balance' };
    }

    // --- 7. In-Memory write: lock funds + store bet ---
    let bet;
    try {
        await ledgerService.lockBet(playerId, amount, betId);
        bet = await betModel.createBet({
            clientBetId: betId,
            playerId,
            roundId,
            betArea: area,
            amount,
        });
    } catch (err) {
        await redis.sRem(dedupKey, betId);
        logger.error('Bet transaction failed', { playerId, betId, error: err.message });
        return { success: false, reason: 'server_error' };
    }

    // --- 8. Update Redis bet totals ---
    const totalsKey = `table:${tableId}:bets`;
    await redis.hIncrByFloat(totalsKey, area, amount);

    logger.info('Bet accepted', { playerId, betId, area, amount, roundId });
    return { success: true, bet };
}

module.exports = { processBet };
