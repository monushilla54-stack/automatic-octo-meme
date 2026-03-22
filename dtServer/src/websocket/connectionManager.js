'use strict';

const tableManager  = require('../game/tableManager');
const betModel      = require('../models/betModel');
const roundModel    = require('../models/roundModel');
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
    console.log(`[connectionManager] Constructing STATE_SYNC for ${socket.playerId}`);
    const rm  = tableManager.getRoundManager(tableId);
    const ts  = tableManager.getTableState(tableId);
    const roundId = rm ? rm.getCurrentRoundId() : null;
    const roundHistory = await roundModel.getRecentHistoryForTable(tableId, 10);
    console.log(`[connectionManager] History fetched: ${roundHistory.length} entries`);

    let existingBets = [];
    if (roundId) {
      existingBets = await betModel.getPlayerBetsForRound(socket.playerId, roundId);
    }

    const roundState = rm ? await rm.getStateSnapshot() : null;
    const canRevealResult =
      roundState &&
      (roundState.phase === 'RESULT_REVEAL' ||
       roundState.phase === 'PAYOUT' ||
       roundState.phase === 'ROUND_COMPLETE');

    socket.emit('STATE_SYNC', {
      tableId,
      roundId,
      phase:          roundState ? roundState.phase : null,
      phaseEndsAt:    roundState ? roundState.phaseEndsAt : null,
      bettingStartsAt: roundState ? roundState.bettingStartsAt : null,
      bettingEndsAt:  rm ? rm.getBetEndTime() : null,
      commitmentHash: roundState ? roundState.commitmentHash : null,
      balance:        parseFloat(balance) || 0,
      serverTime:     Date.now(),
      existingBets,
      winner:         canRevealResult ? roundState.winner : null,
      dragonCard:     canRevealResult ? roundState.dragonCard : null,
      dragonSuit:     canRevealResult ? roundState.dragonSuit : null,
      dragonLabel:    canRevealResult ? roundState.dragonLabel : null,
      tigerCard:      canRevealResult ? roundState.tigerCard : null,
      tigerSuit:      canRevealResult ? roundState.tigerSuit : null,
      tigerLabel:     canRevealResult ? roundState.tigerLabel : null,
      // Multiplayer table state
      betTotals:      ts ? { ...ts.betTotals } : { dragon: 0, tiger: 0, tie: 0 },
      visiblePlayers: ts ? ts.getVisiblePlayers() : [],
      totalPlayers:   ts ? ts.getPlayerCount() : 0,
      roundHistory,
    });

    logger.debug('STATE_SYNC sent', { playerId: socket.playerId, tableId });
    console.log(`[connectionManager] STATE_SYNC emitted to ${socket.playerId}`);
  } catch (err) {
    logger.error('Failed to send STATE_SYNC', { playerId: socket.playerId, error: err.message });
  }
}

module.exports = { handleConnect, handleDisconnect, handleLeave, handleChat };
