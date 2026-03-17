'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const walletService = require('../wallet/walletService');
const { bcryptRounds, jwtSecret } = require('../config/environment');
const logger = require('../utils/logger');

/**
 * Register a new player.
 */
async function register({ email, username, password }) {
    const existing = await userModel.findByEmail(email);
    if (existing) {
        const err = new Error('Email already registered');
        err.statusCode = 409;
        throw err;
    }

    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    const user = await userModel.create({ email, username, passwordHash });

    logger.info('Player registered', { playerId: user.id, username });
    return { playerId: user.id, username: user.username };
}

/**
 * Login an existing player.
 * Returns JWT token, playerId, and current wallet balance.
 */
async function login({ email, password }) {
    const user = await userModel.findByEmail(email);
    if (!user) {
        const err = new Error('Invalid credentials');
        err.statusCode = 401;
        throw err;
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
        const err = new Error('Invalid credentials');
        err.statusCode = 401;
        throw err;
    }

    const token = jwt.sign(
        { playerId: user.id, username: user.username },
        jwtSecret,
        { algorithm: 'HS256', expiresIn: '7d' }  // 7-day token, algo locked to HS256
    );

    const walletBalance = await walletService.getBalance(user.id);

    logger.info('Player logged in', { playerId: user.id });
    return { token, playerId: user.id, username: user.username, walletBalance };
}

/**
 * Generate a short-lived Guest Session.
 * Does not create a database user, just provisions a JWT with a demo wallet balance.
 */
async function guestLogin() {
    // Generate a random guest ID (e.g., Guest_4912)
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    const guestId = `guest_${Date.now()}_${randomNum}`;
    const username = `P_${randomNum}`;
    
    // Assign 10000 demo chips for the guest user directly into Redis
    const demoBalance = 10000;
    await walletService.updateBalance(guestId, demoBalance);

    // Provide a token valid for 24 hours
    const token = jwt.sign(
        { playerId: guestId, username: username, isGuest: true },
        jwtSecret,
        { algorithm: 'HS256', expiresIn: '24h' }
    );

    logger.info('Guest session created', { guestId, username });
    return { token, playerId: guestId, username, walletBalance: demoBalance, isGuest: true };
}

module.exports = { register, login, guestLogin };
