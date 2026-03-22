'use strict';

const connectionManager = require('./connectionManager');
const betManager        = require('../game/betManager');
const tableManager      = require('../game/tableManager');
const roundModel        = require('../models/roundModel');
const walletService     = require('../wallet/walletService');
const logger            = require('../utils/logger');

function registerEvents(ws) {
  const { playerId, username } = ws;

  // ── Provide .emit() compatibility proxy for downstream files 
  if (!ws.emit) {
    ws.emit = ws.emitEvent || ((event, data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ event, data }));
    });
  }

  // ── Connection lifecycle ──────────────────────────────
  connectionManager.handleConnect(ws).catch((err) => {
    logger.error('handleConnect error', { playerId, error: err.message });
    ws.close();
  });

  ws.on('close', (code, reason) => {
    connectionManager.handleDisconnect(ws);
    logger.info('WebSocket disconnected', { playerId, code });
  });

  // ── Native WebSocket Message Router ───────────────────
  ws.on('message', async (messageData) => {
    try {
      const parsed = JSON.parse(messageData.toString());
      if (!parsed.event) return;

      const eventName = parsed.event;
      const data = parsed.data || {};

      if (eventName === 'TABLE_LEAVE') {
        connectionManager.handleLeave(ws);
      } 
      else if (eventName === 'CHAT_MESSAGE') {
        connectionManager.handleChat(ws, data);
      } 
      else if (eventName === 'PLACE_BET') {
        await handlePlaceBet(ws, playerId, username, data);
      } 
      else if (eventName === 'REQUEST_STATE') {
        await handleRequestState(ws, playerId);
      }
    } catch (err) {
      logger.warn('Failed to parse WebSocket message', { error: err.message });
    }
  });
}

// ── Event Handlers ──────────────────────────────────────
async function handlePlaceBet(ws, playerId, username, data) {
  try {
    const tableId = ws.tableId || tableManager.getPlayerTable(playerId);
    if (!tableId) return _reply(ws, 'BET_REJECTED', { reason: 'not_in_table' });

    const rm = tableManager.getRoundManager(tableId);
    if (!rm) return _reply(ws, 'BET_REJECTED', { reason: 'no_active_table' });

    const roundId = rm.getCurrentRoundId();
    if (!roundId) return _reply(ws, 'BET_REJECTED', { reason: 'no_active_round' });

    const result = await betManager.processBet({
      playerId, roundId, tableId,
      betEndTime: rm.getBetEndTime(),
      data,
    });

    logger.debug('Bet processing result', { playerId, success: result.success, reason: result.reason });

    if (!result.success) {
      logger.warn('Bet rejected', { playerId, reason: result.reason });
      return _reply(ws, 'BET_REJECTED', { reason: result.reason, betId: data.betId });
    }

    const balance = await walletService.getBalance(playerId);
    const area = result.bet.bet_area;
    const amount = parseFloat(result.bet.amount);

    // ── Update TableState ─────────────────────────────
    const ts = tableManager.getTableState(tableId);
    if (ts) {
      ts.recordBet(playerId, area, amount);
      ts.updateBalance(playerId, balance);
      ts.broadcastBetTotals();              // TABLE_UPDATE to room
      ts.broadcastBetPlaced(playerId, username, area, amount); // PLAYER_BET chip animation
      ts.broadcastPlayerState();            // PLAYER_STATE with updated balances
    }

    // ── Reply to bettor ───────────────────────────────
    _reply(ws, 'BET_ACCEPTED', {
      betId: data.betId,
      area,
      amount,
      roundId,
      balance,
    });

    tableManager.updatePlayerBalance(playerId, balance);
    ws.emit('balanceUpdate', { playerId, balance });

  } catch (err) {
    logger.error('PLACE_BET handler error', { playerId, error: err.message });
    _reply(ws, 'BET_REJECTED', { reason: 'server_error' });
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

  const payload = {
    tableId,
    roundId: rm ? rm.getCurrentRoundId() : null,
    phase: roundState ? roundState.phase : null,
    phaseEndsAt: roundState ? roundState.phaseEndsAt : null,
    bettingStartsAt: roundState ? roundState.bettingStartsAt : null,
    bettingEndsAt: rm ? rm.getBetEndTime() : null,
    commitmentHash: roundState ? roundState.commitmentHash : null,
    serverTime: Date.now(),
    balance,
    winner:
      roundState &&
      (roundState.phase === 'RESULT_REVEAL' || roundState.phase === 'PAYOUT' || roundState.phase === 'ROUND_COMPLETE')
        ? roundState.winner
        : null,
    dragonCard:
      roundState &&
      (roundState.phase === 'RESULT_REVEAL' || roundState.phase === 'PAYOUT' || roundState.phase === 'ROUND_COMPLETE')
        ? roundState.dragonCard
        : null,
    dragonSuit:
      roundState &&
      (roundState.phase === 'RESULT_REVEAL' || roundState.phase === 'PAYOUT' || roundState.phase === 'ROUND_COMPLETE')
        ? roundState.dragonSuit
        : null,
    dragonLabel:
      roundState &&
      (roundState.phase === 'RESULT_REVEAL' || roundState.phase === 'PAYOUT' || roundState.phase === 'ROUND_COMPLETE')
        ? roundState.dragonLabel
        : null,
    tigerCard:
      roundState &&
      (roundState.phase === 'RESULT_REVEAL' || roundState.phase === 'PAYOUT' || roundState.phase === 'ROUND_COMPLETE')
        ? roundState.tigerCard
        : null,
    tigerSuit:
      roundState &&
      (roundState.phase === 'RESULT_REVEAL' || roundState.phase === 'PAYOUT' || roundState.phase === 'ROUND_COMPLETE')
        ? roundState.tigerSuit
        : null,
    tigerLabel:
      roundState &&
      (roundState.phase === 'RESULT_REVEAL' || roundState.phase === 'PAYOUT' || roundState.phase === 'ROUND_COMPLETE')
        ? roundState.tigerLabel
        : null,
    betTotals: ts ? { ...ts.betTotals } : { dragon: 0, tiger: 0, tie: 0 },
    visiblePlayers: ts ? ts.getVisiblePlayers() : [],
    totalPlayers: ts ? ts.getPlayerCount() : 0,
    roundHistory,
  };

  ws.emit('STATE_SYNC', payload);
}

function _reply(ws, eventName, payload) {
  ws.emit(eventName, payload);
}

module.exports = { registerEvents };
