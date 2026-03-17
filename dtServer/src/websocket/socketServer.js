'use strict';

const { WebSocketServer } = require('ws');
const logger = require('../utils/logger');

let wss = null;

/**
 * Initialize pure WebSockets on the given HTTP server.
 * Applies DEMO Guest creation to every incoming connection.
 */
function init(httpServer) {
    wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const params = url.searchParams;

        // --- DEMO MODE: Use Guest IDs from URL or Auto-Generate ---
        const randomId = Math.floor(Math.random() * 9000) + 1000;
        ws.playerId = params.get('playerId') || `id_${randomId}`;
        ws.username = params.get('username') || `P_${randomId}`;

        // Shim 'emit' so the rest of the socketEvents code still works seamlessly
        ws.emitEvent = (eventName, payload) => {
            if (ws.readyState === 1) { // OPEN
                ws.send(JSON.stringify({ event: eventName, data: payload }));
            }
        };
        
        // Shim for room broadcasting (not natively supported in pure ws)
        ws.join = (room) => {
            ws.room = room; 
        };

        logger.info('New WebSocket connection received', { 
            playerId: ws.playerId, 
            remoteAddress: req.socket.remoteAddress,
            headers: req.headers 
        });
    });

    // Provide a shim io object so tableManager can broadcast to rooms
    const ioShim = {
        to: (room) => ({
            emit: (eventName, payload) => {
                wss.clients.forEach(client => {
                    if (client.readyState === 1 && client.room === room) {
                        client.send(JSON.stringify({ event: eventName, data: payload }));
                    }
                });
            }
        })
    };

    logger.info('Native WebSocket server initialized in DEMO mode');
    return { wss, ioShim };
}

function getIo() {
    if (!wss) throw new Error('WebSocket not initialized');
    // return the same shim structure expected by the rest of the app
    return {
        to: (room) => ({
            emit: (eventName, payload) => {
                wss.clients.forEach(client => {
                    if (client.readyState === 1 && client.room === room) {
                        client.send(JSON.stringify({ event: eventName, data: payload }));
                    }
                });
            }
        })
    };
}

module.exports = { init, getIo };
