'use strict';

const authService = require('./authService');
const validationService = require('../services/validationService');
const logger = require('../utils/logger');

/**
 * POST /register
 */
async function register(req, res) {
    const { error, value } = validationService.validateRegistration(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    try {
        const result = await authService.register(value);
        logger.info('Registration endpoint success', { playerId: result.playerId });
        return res.status(201).json({ success: true, ...result });
    } catch (err) {
        if (err.statusCode === 409) {
            return res.status(409).json({ error: err.message });
        }
        logger.error('Registration endpoint error', { error: err.message });
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * POST /login
 */
async function login(req, res) {
    const { error, value } = validationService.validateLogin(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    try {
        const result = await authService.login(value);
        return res.status(200).json(result);
    } catch (err) {
        if (err.statusCode === 401) {
            return res.status(401).json({ error: err.message });
        }
        logger.error('Login endpoint error', { error: err.message });
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { register, login };
