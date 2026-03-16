'use strict';

const { RoundManager } = require('./roundManager');
const { TableState }   = require('./tableState');
const { game } = require('../config/environment');
const logger = require('../utils/logger');

class TableManager {
  constructor() {
    this._tables    = new Map();
    this._nextTableId = 1;
    this._io = null;
  }

  init(io) {
    this._io = io;
    this._createTable();
  }

  // ── Create a table with its own RoundManager + TableState ──
  _createTable() {
    const tableId  = `table_${this._nextTableId++}`;
    const rm       = new RoundManager(tableId);
    const state    = new TableState(tableId, this._io);

    const table = { tableId, roundManager: rm, state };
    this._tables.set(tableId, table);

    // Forward round phase events to the room
    rm.on('phase', (event) => {
      if (!this._io) return;

      // On new round — reset bet pools and player bet tracking
      if (event.phase === 'ROUND_INITIALIZATION') {
        state.resetRound();
        state.broadcastBetTotals();
        state.broadcastPlayerState();
      }

      // On result — push winner to server-authoritative round history
      if (event.phase === 'RESULT_REVEAL' && event.winner) {
        state.pushHistory(event.winner, event.dragonLabel, event.tigerLabel);
      }

      this._io.to(tableId).emit(event.phase, event);
    });

    rm.on('tick', (event) => {
      if (this._io) this._io.to(tableId).emit('TIMER_TICK', event);
    });

    rm.start();
    logger.info('Table created', { tableId });
    return table;
  }

  // ── Player lifecycle ──────────────────────────────────────

  async assignPlayer(playerId, username, balance, socketId) {
    // Find a table with capacity
    let table = null;
    for (const t of this._tables.values()) {
      if (t.state.getPlayerCount() < game.maxPlayersPerTable) { table = t; break; }
    }
    if (!table) table = this._createTable(); // overflow

    const tableId = table.tableId;
    table.state.upsertPlayer({ playerId, username, balance, socketId });

    logger.info('Player assigned', { playerId, tableId, total: table.state.getPlayerCount() });
    return tableId;
  }

  updatePlayer(playerId, { balance, socketId }) {
    for (const t of this._tables.values()) {
      const p = t.state._players.get(playerId);
      if (p) {
        if (balance !== undefined) p.balance = parseFloat(balance) || 0;
        if (socketId)              p.socketId = socketId;
        t.state.setConnected(playerId, socketId || p.socketId);
        return t.tableId;
      }
    }
    return null;
  }

  markDisconnected(playerId) {
    for (const t of this._tables.values()) {
      if (t.state._players.has(playerId)) {
        t.state.setDisconnected(playerId);
        return t.tableId;
      }
    }
    return null;
  }

  removePlayer(playerId) {
    for (const [tableId, t] of this._tables) {
      if (t.state._players.has(playerId)) {
        t.state.removePlayer(playerId);
        logger.info('Player removed', { playerId, tableId });
        return tableId;
      }
    }
    return null;
  }

  updatePlayerBalance(playerId, balance) {
    for (const t of this._tables.values()) {
      if (t.state._players.has(playerId)) {
        t.state.updateBalance(playerId, balance);
        return;
      }
    }
  }

  getPlayerTable(playerId) {
    for (const [tableId, t] of this._tables) {
      if (t.state._players.has(playerId)) return tableId;
    }
    return null;
  }

  getTable(tableId) { return this._tables.get(tableId) || null; }

  getRoundManager(tableId) {
    const t = this._tables.get(tableId);
    return t ? t.roundManager : null;
  }

  getTableState(tableId) {
    const t = this._tables.get(tableId);
    return t ? t.state : null;
  }

  listTables() {
    return [...this._tables.values()].map(t => ({
      tableId: t.tableId,
      playerCount: t.state.getPlayerCount(),
    }));
  }
}

module.exports = new TableManager();
