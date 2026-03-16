'use strict';

const logger = require('../utils/logger');

const MAX_VISIBLE = 7;
const ROTATION_INTERVAL_MS = 30_000;

// Avatar options (emoji index → client renders icon)
const AVATARS = ['🐉', '🐯', '🦁', '🐻', '🦊', '🐺', '🦅', '🌊'];

function avatarFor(playerId) {
  let hash = 0;
  for (const c of String(playerId)) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return hash % AVATARS.length;
}

/**
 * In-memory state for a single game table.
 * Tracks all connected players, bet pools, per-player bets, and visible player list.
 */
class TableState {
  constructor(tableId, io) {
    this.tableId  = tableId;
    this._io      = io;

    /** @type {Map<string, PlayerRecord>} all players on the table */
    this._players = new Map();

    /** Bet totals across all players for the current round */
    this.betTotals = { dragon: 0, tiger: 0, tie: 0 };

    /** Per-player bets: playerId → [{area, amount}] */
    this._roundBets = new Map();

    /** Ordered list of up to 7 visible player IDs */
    this._visibleIds = [];

    /** Round result history — last 12 rounds, server-authoritative */
    this._history = [];

    this._rotationTimer = null;
    this._startRotation();
  }

  // ═══════════════════════════════════════════════
  // Player management
  // ═══════════════════════════════════════════════

  /**
   * Add or update a player record.
   */
  upsertPlayer({ playerId, username, balance, socketId }) {
    const existing = this._players.get(playerId);
    const avatarIdx = existing ? existing.avatarIdx : avatarFor(playerId);
    const record = {
      playerId,
      username,
      balance:         parseFloat(balance) || 0,
      socketId,
      avatarIdx,
      currentBets:     existing ? existing.currentBets : { dragon: 0, tiger: 0, tie: 0 },
      isVisible:       false,
      connectionStatus:'connected',
      connectedAt:     existing ? existing.connectedAt : Date.now(),
      lastBetAt:       existing ? existing.lastBetAt : 0,
    };
    this._players.set(playerId, record);
    this._recalcVisible();
    return record;
  }

  setDisconnected(playerId) {
    const p = this._players.get(playerId);
    if (p) { p.connectionStatus = 'disconnected'; }
  }

  setConnected(playerId, socketId) {
    const p = this._players.get(playerId);
    if (p) { p.connectionStatus = 'connected'; p.socketId = socketId; }
  }

  removePlayer(playerId) {
    this._players.delete(playerId);
    this._recalcVisible();
  }

  updateBalance(playerId, balance) {
    const p = this._players.get(playerId);
    if (p) p.balance = parseFloat(balance) || 0;
  }

  // ═══════════════════════════════════════════════
  // Bet tracking
  // ═══════════════════════════════════════════════

  /**
   * Record a confirmed bet from the server. Updates pool totals and per-player bets.
   * Returns the updated betTotals.
   */
  recordBet(playerId, area, amount) {
    const amt = parseFloat(amount);
    // Pool totals
    this.betTotals[area] = (this.betTotals[area] || 0) + amt;
    // Per-player bets
    if (!this._roundBets.has(playerId)) this._roundBets.set(playerId, []);
    this._roundBets.get(playerId).push({ area, amount: amt });
    // Player current bets
    const p = this._players.get(playerId);
    if (p) {
      p.currentBets[area] = (p.currentBets[area] || 0) + amt;
      p.lastBetAt = Date.now();
    }
    // Re-evaluate visible (bettors get priority)
    this._recalcVisible();
    return { ...this.betTotals };
  }

  /**
   * Push a round result to the history queue (max 12 entries, server-authoritative).
   */
  pushHistory(winner, dragonLabel, tigerLabel) {
    this._history.push({ winner, dragonLabel, tigerLabel, ts: Date.now() });
    if (this._history.length > 12) this._history.shift();
    // Broadcast updated history to all players in the room
    this._io.to(this.tableId).emit('ROUND_HISTORY', { history: this.getHistory() });
  }

  getHistory() { return [...this._history]; }

  /**
   * Reset all bet state between rounds.
   */
  resetRound() {
    this.betTotals = { dragon: 0, tiger: 0, tie: 0 };
    this._roundBets.clear();
    for (const p of this._players.values()) {
      p.currentBets = { dragon: 0, tiger: 0, tie: 0 };
      p.lastBetAt   = 0;
    }
    this._recalcVisible();
  }

  // ═══════════════════════════════════════════════
  // Visible player list
  // ═══════════════════════════════════════════════

  _recalcVisible(currentPlayerId) {
    const all = [...this._players.values()];
    const now = Date.now();
    const RECENT_BET_WINDOW = 30_000; // 30s

    // Candidates: sort by (recent bettor first, then highest balance)
    const scored = all.map(p => ({
      p,
      score: (now - p.lastBetAt < RECENT_BET_WINDOW ? 1000 : 0) + p.balance / 1_000_000,
    })).sort((a, b) => b.score - a.score);

    // Reset isVisible
    all.forEach(p => { p.isVisible = false; });

    // Pick top MAX_VISIBLE; always keep currentPlayerId if provided
    let chosen = [];
    if (currentPlayerId && this._players.has(currentPlayerId)) {
      chosen.push(currentPlayerId);
      this._players.get(currentPlayerId).isVisible = true;
    }

    for (const { p } of scored) {
      if (chosen.length >= MAX_VISIBLE) break;
      if (chosen.includes(p.playerId)) continue;
      p.isVisible = true;
      chosen.push(p.playerId);
    }

    this._visibleIds = chosen;
  }

  getVisiblePlayers() {
    return this._visibleIds
      .map(id => this._players.get(id))
      .filter(Boolean)
      .map((p, i) => ({
        playerId:   p.playerId,
        username:   p.username,
        balance:    p.balance,
        avatarIdx:  p.avatarIdx,
        seatIndex:  i,             // 0-6 → client maps to seat positions
        currentBets:p.currentBets,
        connectionStatus: p.connectionStatus,
      }));
  }

  getPlayerCount() { return this._players.size; }

  // ═══════════════════════════════════════════════
  // Broadcasts
  // ═══════════════════════════════════════════════

  broadcastBetTotals() {
    this._io.to(this.tableId).emit('TABLE_UPDATE', {
      dragonTotal: this.betTotals.dragon,
      tigerTotal:  this.betTotals.tiger,
      tieTotal:    this.betTotals.tie,
    });
  }

  broadcastPlayerState() {
    this._io.to(this.tableId).emit('PLAYER_STATE', {
      visiblePlayers: this.getVisiblePlayers(),
      totalPlayers: this._players.size,
    });
  }

  /** Emit PLAYER_BET to the table so others can animate the chip */
  broadcastBetPlaced(playerId, username, area, amount) {
    this._io.to(this.tableId).emit('PLAYER_BET', { playerId, username, area, amount });
  }

  // ═══════════════════════════════════════════════
  // Rotation
  // ═══════════════════════════════════════════════

  _startRotation() {
    this._rotationTimer = setInterval(() => {
      if (this._players.size <= MAX_VISIBLE) return; // no need to rotate if few players
      this._recalcVisible();
      this.broadcastPlayerState();
      logger.debug('Visible player rotation', { tableId: this.tableId, visible: this._visibleIds.length });
    }, ROTATION_INTERVAL_MS);
  }

  destroy() {
    if (this._rotationTimer) clearInterval(this._rotationTimer);
  }
}

module.exports = { TableState };
