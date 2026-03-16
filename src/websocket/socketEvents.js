'use strict';

const connectionManager = require('./connectionManager');
const betManager        = require('../game/betManager');
const tableManager      = require('../game/tableManager');
const walletService     = require('../wallet/walletService');
const logger            = require('../utils/logger');

function registerEvents(socket) {
  const { playerId, username } = socket;

  // ── Connection lifecycle ──────────────────────────────
  connectionManager.handleConnect(socket).catch((err) => {
    logger.error('handleConnect error', { playerId, error: err.message });
    socket.disconnect(true);
  });

  socket.on('disconnect', (reason) => {
    connectionManager.handleDisconnect(socket);
    logger.info('Socket disconnected', { playerId, reason });
  });

  socket.on('TABLE_LEAVE', () => connectionManager.handleLeave(socket));

  // ── CHAT_MESSAGE ──────────────────────────────────────
  socket.on('CHAT_MESSAGE', (data) => connectionManager.handleChat(socket, data));

  // ── PLACE_BET ─────────────────────────────────────────
  socket.on('PLACE_BET', async (data, ack) => {
    try {
      const tableId = socket.tableId || tableManager.getPlayerTable(playerId);
      if (!tableId) return _reply(ack, socket, 'BET_REJECTED', { reason: 'not_in_table' });

      const rm = tableManager.getRoundManager(tableId);
      if (!rm)  return _reply(ack, socket, 'BET_REJECTED', { reason: 'no_active_table' });

      const roundId = rm.getCurrentRoundId();
      if (!roundId) return _reply(ack, socket, 'BET_REJECTED', { reason: 'no_active_round' });

      const result = await betManager.processBet({
        playerId, roundId, tableId,
        betEndTime: rm.getBetEndTime(),
        data,
      });

      if (!result.success) {
        logger.warn('Bet rejected', { playerId, reason: result.reason });
        return _reply(ack, socket, 'BET_REJECTED', { reason: result.reason, betId: data.betId });
      }

      const balance = await walletService.getBalance(playerId);
      const area    = result.bet.bet_area;
      const amount  = parseFloat(result.bet.amount);

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
      _reply(ack, socket, 'BET_ACCEPTED', {
        betId:  data.betId,
        area,
        amount,
        roundId,
        balance,
      });

      tableManager.updatePlayerBalance(playerId, balance);
      socket.emit('BALANCE_UPDATE', { balance });

    } catch (err) {
      logger.error('PLACE_BET handler error', { playerId, error: err.message });
      _reply(ack, socket, 'BET_REJECTED', { reason: 'server_error' });
    }
  });

  // ── REQUEST_STATE ─────────────────────────────────────
  socket.on('REQUEST_STATE', async (_, ack) => {
    const tableId = socket.tableId || tableManager.getPlayerTable(playerId);
    if (!tableId) return;

    const rm  = tableManager.getRoundManager(tableId);
    const ts  = tableManager.getTableState(tableId);
    const roundState = rm ? await rm.getStateSnapshot() : null;
    const balance    = await walletService.getBalance(playerId);

    const payload = {
      tableId,
      phase:          roundState ? roundState.phase : null,
      bettingEndsAt:  rm ? rm.getBetEndTime() : null,
      commitmentHash: roundState ? roundState.commitmentHash : null,
      balance,
      betTotals:      ts ? { ...ts.betTotals } : { dragon: 0, tiger: 0, tie: 0 },
      visiblePlayers: ts ? ts.getVisiblePlayers() : [],
      totalPlayers:   ts ? ts.getPlayerCount() : 0,
    };

    if (ack) ack(payload);
    else socket.emit('STATE_SYNC', payload);
  });
}

function _reply(ack, socket, eventName, payload) {
  if (typeof ack === 'function') ack({ event: eventName, ...payload });
  else socket.emit(eventName, payload);
}

module.exports = { registerEvents };
