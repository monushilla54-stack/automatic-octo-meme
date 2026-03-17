'use strict';

const transactionModel = require('../models/transactionModel');
const ledgerService = require('../wallet/ledgerService');
const walletService = require('../wallet/walletService');
const validationService = require('../services/validationService');
const { authenticateToken } = require('../auth/jwtMiddleware');
const logger = require('../utils/logger');
const express = require('express');

const router = express.Router();

/**
 * POST /deposit
 * Protected route — requires valid JWT.
 *
 * Simulates a payment gateway flow:
 *   1. Create transaction (pending)
 *   2. Simulate 2s processing delay
 *   3. Mark transaction success
 *   4. Write ledger deposit entry
 *   5. Return new balance
 */
router.post('/', authenticateToken, async (req, res) => {
    const { error, value } = validationService.validateDeposit(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const { playerId } = req.user;
    const { amount } = value;

    try {
        // 1. Create pending transaction
        const tx = await transactionModel.createTransaction({ playerId, amount });
        logger.info('Deposit initiated', { playerId, amount, transactionId: tx.transaction_id });

        // 2. Simulate processing delay (2 seconds)
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 3. Mark as success
        await transactionModel.updateTransactionStatus(tx.transaction_id, 'success');

        // 4. Write ledger credit
        await ledgerService.deposit(playerId, amount, tx.transaction_id);

        // 5. Return new balance
        const balance = await walletService.getBalance(playerId);

        logger.info('Deposit completed', { playerId, amount, transactionId: tx.transaction_id, balance });
        return res.status(200).json({ success: true, transactionId: tx.transaction_id, balance });

    } catch (err) {
        logger.error('Deposit failed', { playerId, amount, error: err.message });
        return res.status(500).json({ error: 'Deposit processing failed' });
    }
});

module.exports = router;
