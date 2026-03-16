'use strict';

const tableManager  = require('../game/tableManager');
const betModel      = require('../models/betModel');
const walletService = require('../wallet/walletService');
const logger        = require('../utils/logger');

const CHAT_COOLDOWN_MS = 2000;    // max one message per 2s per player
const MAX_CHAT_LEN     = 200;
const lastChatTime     = new Map();

/** Handle a new authenticated WebSocket connection. */
async function handleConnect(socket) {
  const { playerId, username } = socket;
  logger.info('Player connected', { playerId, username, socketId: socket.id });

  // Fetch balance to populate player record
  const balance = await walletService.getBalance(playerId);

  // Check if already tracked (reconnect)
  const existingTable = tableManager.getPlayerTable(playerId);

  let tableId;
  if (existingTable) {
    tableId = existingTable;
    tableManager.updatePlayer(playerId, { balance, socketId: socket.id });
  } else {
    tableId = await tableManager.assignPlayer(playerId, username, balance, socket.id);
  }

  socket.tableId = tableId;
  socket.join(tableId);

  // Broadcast updated player list to the whole table
  const ts = tableManager.getTableState(tableId);
  if (ts) { ts.broadcastPlayerState(); }

  await _sendStateSync(socket, tableId, balance);
}

/** Handle disconnect — mark as disconnected, bets survive */
function handleDisconnect(socket) {
  const { playerId } = socket;
  logger.info('Player disconnected', { playerId });
  const tableId = tableManager.markDisconnected(playerId);
  if (tableId) {
    const ts = tableManager.getTableState(tableId);
    if (ts) ts.broadcastPlayerState();
  }
}

/** Handle explicit TABLE_LEAVE */
function handleLeave(socket) {
  const { playerId } = socket;
  const tableId = tableManager.removePlayer(playerId);
  if (tableId) {
    const ts = tableManager.getTableState(tableId);
    if (ts) ts.broadcastPlayerState();
  }
  logger.info('Player left table', { playerId });
}

/** Handle CHAT_MESSAGE */
function handleChat(socket, data) {
  const { playerId, username } = socket;
  const now  = Date.now();
  const last = lastChatTime.get(playerId) || 0;
  if (now - last < CHAT_COOLDOWN_MS) return; // rate limit
  lastChatTime.set(playerId, now);

  const text = String(data.text || '').trim().slice(0, MAX_CHAT_LEN);
  if (!text) return;

  const tableId = socket.tableId || tableManager.getPlayerTable(playerId);
  if (!tableId) return;

  // Broadcast to entire table room
  const ts = tableManager.getTableState(tableId);
  if (ts) {
    ts._io.to(tableId).emit('CHAT_MESSAGE', {
      playerId, username,
      text,
      ts: Date.now(),
    });
  }
}

/**
 * Full STATE_SYNC — sends everything a joining/reconnecting player needs:
 *   phase, timer, balance, existing bets, bet pools, visible players
 */
async function _sendStateSync(socket, tableId, balance) {
  try {
    const rm  = tableManager.getRoundManager(tableId);
    const ts  = tableManager.getTableState(tableId);
    const roundId = rm ? rm.getCurrentRoundId() : null;

    let existingBets = [];
    if (roundId) {
      existingBets = await betModel.getPlayerBetsForRound(socket.playerId, roundId);
    }

    const roundState = rm ? await rm.getStateSnapshot() : null;

    socket.emit('STATE_SYNC', {
      tableId,
      roundId,
      phase:          roundState ? roundState.phase : null,
      bettingEndsAt:  rm ? rm.getBetEndTime() : null,
      commitmentHash: roundState ? roundState.commitmentHash : null,
      balance:        parseFloat(balance) || 0,
      existingBets,
      // Multiplayer table state
      betTotals:      ts ? { ...ts.betTotals } : { dragon: 0, tiger: 0, tie: 0 },
      visiblePlayers: ts ? ts.getVisiblePlayers() : [],
      totalPlayers:   ts ? ts.getPlayerCount() : 0,
      roundHistory:   ts ? ts.getHistory() : [],
    });

    logger.debug('STATE_SYNC sent', { playerId: socket.playerId, tableId });
  } catch (err) {
    logger.error('Failed to send STATE_SYNC', { playerId: socket.playerId, error: err.message });
  }
}

module.exports = { handleConnect, handleDisconnect, handleLeave, handleChat };
