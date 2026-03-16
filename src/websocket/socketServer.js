'use strict';

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/environment');
const logger = require('../utils/logger');

let io = null;

/**
 * Initialize Socket.io on the given HTTP server.
 * Applies JWT authentication to every incoming connection.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function init(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: '*', // Tighten in production
            methods: ['GET', 'POST'],
        },
        pingTimeout: 30000,
        pingInterval: 10000,
    });

    // --- JWT Handshake Middleware ---
    io.use((socket, next) => {
        // Accept token from either handshake.auth.token or query param
        const token =
            socket.handshake.auth && socket.handshake.auth.token
                ? socket.handshake.auth.token
                : socket.handshake.query && socket.handshake.query.token;

        if (!token) {
            logger.warn('WebSocket connection rejected: no token');
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, jwtSecret, {
                algorithms: ['HS256'],  // reject alg:none and any other algorithm
            });
            if (!decoded.playerId || !decoded.username) {
                return next(new Error('Invalid token payload'));
            }
            socket.playerId = decoded.playerId;
            socket.username = decoded.username;
            next();
        } catch (err) {
            logger.warn('WebSocket JWT verification failed', { error: err.name });
            next(new Error('Invalid or expired token'));
        }
    });

    logger.info('Socket.io server initialized');
    return io;
}

function getIo() {
    if (!io) throw new Error('Socket.io not initialized');
    return io;
}

module.exports = { init, getIo };
