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

module.exports = { register, login };
