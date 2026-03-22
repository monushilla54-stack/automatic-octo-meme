'use strict';

const connectionManager = require('./connectionManager');
const betManager = require('../game/betManager');
const tableManager = require('../game/tableManager');
const roundModel = require('../models/roundModel');
const walletService = require('../wallet/walletService');
const logger = require('../utils/logger');

function sendToSocket(ws, eventName, payload) {
  if (!ws) return;

  if (typeof ws.sendEvent === 'function') {
    ws.sendEvent(eventName, payload);
    return;
  }

  if (typeof ws.emitEvent === 'function') {
    ws.emitEvent(eventName, payload);
    return;
  }

  if (ws.readyState === 1 && typeof ws.send === 'function') {
    ws.send(JSON.stringify({ event: eventName, data: payload }));
  }
}

function registerEvents(ws) {
  const { playerId, username } = ws;

  connectionManager.handleConnect(ws).catch((err) => {
    logger.error('handleConnect error', { playerId, error: err.message });
    ws.close();
  });

  ws.on('close', (code) => {
    connectionManager.handleDisconnect(ws);
    logger.info('WebSocket disconnected', { playerId, code });
  });

  ws.on('message', async (messageData) => {
    try {
      const parsed = JSON.parse(messageData.toString());
      if (!parsed.event) return;

      const eventName = parsed.event;
      const data = parsed.data || {};

      if (eventName === 'TABLE_LEAVE') {
        connectionManager.handleLeave(ws);
      } else if (eventName === 'CHAT_MESSAGE') {
        connectionManager.handleChat(ws, data);
      } else if (eventName === 'PLACE_BET') {
        await handlePlaceBet(ws, playerId, username, data);
      } else if (eventName === 'REQUEST_STATE') {
        await handleRequestState(ws, playerId);
      }
    } catch (err) {
      logger.warn('Failed to parse WebSocket message', { error: err.message });
    }
  });
}

async function handlePlaceBet(ws, playerId, username, data) {
  try {
    const tableId = ws.tableId || tableManager.getPlayerTable(playerId);
    if (!tableId) return reply(ws, 'BET_REJECTED', { reason: 'not_in_table' });

    const rm = tableManager.getRoundManager(tableId);
    if (!rm) return reply(ws, 'BET_REJECTED', { reason: 'no_active_table' });

    const roundId = rm.getCurrentRoundId();
    if (!roundId) return reply(ws, 'BET_REJECTED', { reason: 'no_active_round' });

    const result = await betManager.processBet({
      playerId,
      roundId,
      tableId,
      betEndTime: rm.getBetEndTime(),
      data,
    });

    logger.debug('Bet processing result', { playerId, success: result.success, reason: result.reason });

    if (!result.success) {
      logger.warn('Bet rejected', { playerId, reason: result.reason });
      return reply(ws, 'BET_REJECTED', { reason: result.reason, betId: data.betId });
    }

    const balance = await walletService.getBalance(playerId);
    const area = result.bet.bet_area;
    const amount = parseFloat(result.bet.amount);

    const ts = tableManager.getTableState(tableId);
    if (ts) {
      ts.recordBet(playerId, area, amount);
      ts.updateBalance(playerId, balance);
      ts.broadcastBetTotals();
      ts.broadcastBetPlaced(playerId, username, area, amount);
      ts.broadcastPlayerState();
    }

    reply(ws, 'BET_ACCEPTED', {
      betId: data.betId,
      area,
      amount,
      roundId,
      balance,
    });

    tableManager.updatePlayerBalance(playerId, balance);
    sendToSocket(ws, 'balanceUpdate', { playerId, balance });
  } catch (err) {
    logger.error('PLACE_BET handler error', { playerId, error: err.message });
    reply(ws, 'BET_REJECTED', { reason: 'server_error' });
  }
}

async function handleRequestState(ws, playerId) {
  const tableId = ws.tableId || tableManager.getPlayerTable(playerId);
  if (!tableId) return;

  const rm = tableManager.getRoundManager(tableId);
  const ts = tableManager.getTableState(tableId);
  const roundState = rm ? await rm.getStateSnapshot() : null;
  const balance = await walletService.getBalance(playerId);
  const roundHistory = await roundModel.getRecentHistoryForTable(tableId, 10);

  const canReveal =
    roundState &&
    (roundState.phase === 'RESULT_REVEAL' ||
      roundState.phase === 'PAYOUT' ||
      roundState.phase === 'ROUND_COMPLETE');

  sendToSocket(ws, 'STATE_SYNC', {
    tableId,
    roundId: rm ? rm.getCurrentRoundId() : null,
    phase: roundState ? roundState.phase : null,
    phaseEndsAt: roundState ? roundState.phaseEndsAt : null,
    bettingStartsAt: roundState ? roundState.bettingStartsAt : null,
    bettingEndsAt: rm ? rm.getBetEndTime() : null,
    commitmentHash: roundState ? roundState.commitmentHash : null,
    serverTime: Date.now(),
    balance,
    winner: canReveal ? roundState.winner : null,
    dragonCard: canReveal ? roundState.dragonCard : null,
    dragonSuit: canReveal ? roundState.dragonSuit : null,
    dragonLabel: canReveal ? roundState.dragonLabel : null,
    tigerCard: canReveal ? roundState.tigerCard : null,
    tigerSuit: canReveal ? roundState.tigerSuit : null,
    tigerLabel: canReveal ? roundState.tigerLabel : null,
    betTotals: ts ? { ...ts.betTotals } : { dragon: 0, tiger: 0, tie: 0 },
    visiblePlayers: ts ? ts.getVisiblePlayers() : [],
    totalPlayers: ts ? ts.getPlayerCount() : 0,
    roundHistory,
  });
}

function reply(ws, eventName, payload) {
  sendToSocket(ws, eventName, payload);
}

module.exports = { registerEvents };
