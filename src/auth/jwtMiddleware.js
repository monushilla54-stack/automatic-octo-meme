'use strict';

const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/environment');
const logger = require('../utils/logger');

/**
 * Express middleware — verifies JWT Bearer token on every protected request.
 * Attaches req.user = { playerId, username } on success.
 * Rejects with 401 on any failure (missing, expired, malformed, wrong algorithm).
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required. Please log in.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Empty token provided.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],      // reject any other algorithm (alg:none attack)
      clockTolerance: 30,         // allow 30s clock skew
    });

    // Ensure required claims are present
    if (!decoded.playerId || !decoded.username) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    req.user = { playerId: decoded.playerId, username: decoded.username };
    next();
  } catch (err) {
    const reason =
      err.name === 'TokenExpiredError'  ? 'Token has expired. Please log in again.' :
      err.name === 'JsonWebTokenError'  ? 'Invalid token. Please log in again.'     :
      err.name === 'NotBeforeError'     ? 'Token not yet valid.'                    :
                                          'Authentication failed.';
    logger.warn('JWT verification failed', { error: err.name, ip: req.ip });
    return res.status(401).json({ error: reason });
  }
}

module.exports = { authenticateToken };
