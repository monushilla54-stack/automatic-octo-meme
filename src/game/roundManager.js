'use strict';

const EventEmitter = require('events');
const { getClient } = require('../config/redis');
const roundModel = require('../models/roundModel');
const betModel = require('../models/betModel');
const ledgerService = require('../wallet/ledgerService');
const walletService = require('../wallet/walletService');
const { generateRoundCommitment, cardLabel } = require('./rngService');
const { determineWinner, calculatePayout } = require('./resultEngine');
const TimerService = require('../services/timerService');
const { game } = require('../config/environment');
const logger = require('../utils/logger');

const PHASE = {
  ROUND_INITIALIZATION: 'ROUND_INITIALIZATION',
  BETTING_OPEN:         'BETTING_OPEN',
  BETTING_CLOSE:        'BETTING_CLOSE',
  RESULT_REVEAL:        'RESULT_REVEAL',
  PAYOUT:               'PAYOUT',
  ROUND_COMPLETE:       'ROUND_COMPLETE',
};

class RoundManager extends EventEmitter {
  constructor(tableId) {
    super();
    this.tableId = tableId;
    this.timer   = new TimerService();
    this.currentRound = null;
    this._running     = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    logger.info('RoundManager started', { tableId: this.tableId });
    this._runPhase(PHASE.ROUND_INITIALIZATION);
  }

  stop() { this._running = false; this.timer.stop(); }

  async getStateSnapshot() {
    const redis = await getClient();
    const raw   = await redis.get(`table:${this.tableId}:round`);
    return raw ? JSON.parse(raw) : null;
  }

  getBetEndTime()    { return this.timer.getEndTime(); }
  getCurrentRoundId(){ return this.currentRound ? this.currentRound.roundId : null; }

  // ── Phase state machine ─────────────────────────────

  _runPhase(phase) {
    if (!this._running) return;
    logger.debug('Round phase', { tableId: this.tableId, phase });
    switch (phase) {
      case PHASE.ROUND_INITIALIZATION: return this._phaseInit();
      case PHASE.BETTING_OPEN:         return this._phaseBettingOpen();
      case PHASE.BETTING_CLOSE:        return this._phaseBettingClose();
      case PHASE.RESULT_REVEAL:        return this._phaseResultReveal();
      case PHASE.PAYOUT:               return this._phasePayouts();
      case PHASE.ROUND_COMPLETE:       return this._phaseComplete();
    }
  }

  async _phaseInit() {
    try {
      // Generate cards AND the provably-fair commitment in one step
      const { dragonCard, tigerCard, nonce, commitmentHash } = generateRoundCommitment();

      const dbRound = await roundModel.createRound({ tableId: this.tableId, commitmentHash });

      this.currentRound = {
        roundId: dbRound.round_id,
        tableId: this.tableId,
        dragonCard,
        tigerCard,
        nonce,          // kept secret until RESULT_REVEAL
        commitmentHash, // published immediately on BETTING_OPEN
        phase: PHASE.ROUND_INITIALIZATION,
        startedAt: Date.now(),
      };

      // Save to Redis (cards & nonce are _secret — not broadcast)
      await this._saveToRedis({ ...this.currentRound, _secret: true });

      this.emit('phase', { phase: PHASE.ROUND_INITIALIZATION, tableId: this.tableId });
      this._runPhase(PHASE.BETTING_OPEN);

    } catch (err) {
      logger.error('Round init failed, retrying in 5s', { tableId: this.tableId, error: err.message });
      setTimeout(() => this._runPhase(PHASE.ROUND_INITIALIZATION), 5000);
    }
  }

  _phaseBettingOpen() {
    const { commitmentHash, roundId } = this.currentRound;
    const bettingEndsAt = Date.now() + game.bettingPhaseDuration;
    this.currentRound.phase = PHASE.BETTING_OPEN;

    // ✅ Publish the commitment hash — proves cards are already fixed
    this.emit('phase', {
      phase: PHASE.BETTING_OPEN,
      tableId:      this.tableId,
      roundId,
      bettingEndsAt,
      commitmentHash,  // SHA256(dragonCard:tigerCard:nonce) — verifiable after reveal
    });

    this.timer.start(
      game.bettingPhaseDuration,
      (remaining) => this.emit('tick', { tableId: this.tableId, remaining }),
      () => this._runPhase(PHASE.BETTING_CLOSE)
    );
  }

  _phaseBettingClose() {
    this.currentRound.phase = PHASE.BETTING_CLOSE;
    this.emit('phase', { phase: PHASE.BETTING_CLOSE, tableId: this.tableId });
    setTimeout(() => this._runPhase(PHASE.RESULT_REVEAL), 500);
  }

  async _phaseResultReveal() {
    const { dragonCard, tigerCard, nonce, commitmentHash, roundId } = this.currentRound;
    const winner = determineWinner(dragonCard, tigerCard);

    await roundModel.updateRoundResult({ roundId, dragonCard, tigerCard, winner, nonce });
    this.currentRound.winner = winner;
    this.currentRound.phase  = PHASE.RESULT_REVEAL;

    // ✅ Reveal cards + nonce — anyone can now verify the hash themselves
    this.emit('phase', {
      phase: PHASE.RESULT_REVEAL,
      tableId:        this.tableId,
      roundId,
      dragonCard,
      dragonLabel:    cardLabel(dragonCard),
      tigerCard,
      tigerLabel:     cardLabel(tigerCard),
      winner,
      // Provably fair reveal packet
      proof: {
        nonce,
        commitmentHash,
        // How to verify: SHA256(`${dragonCard}:${tigerCard}:${nonce}`) === commitmentHash
        verifyUrl: `/verify/${roundId}`,
      },
    });

    this.timer.start(game.revealPhaseDuration, null, () => this._runPhase(PHASE.PAYOUT));
  }

  async _phasePayouts() {
    const { roundId, winner, tableId } = this.currentRound;
    this.currentRound.phase = PHASE.PAYOUT;

    try {
      const bets = await betModel.getBetsForRound(roundId);
      const payoutSummary = [];

      for (const bet of bets) {
        const payout = calculatePayout(bet.bet_area, winner, parseFloat(bet.amount));
        if (payout > 0) {
          await ledgerService.creditEntry(bet.player_id, payout, bet.bet_id, 'payout');
          await betModel.updateBetStatus(bet.bet_id, 'won');
        } else {
          await betModel.updateBetStatus(bet.bet_id, 'lost');
        }
        const newBalance = await walletService.getBalance(bet.player_id);
        payoutSummary.push({ playerId: bet.player_id, betArea: bet.bet_area, amount: parseFloat(bet.amount), payout, newBalance });
      }

      logger.info('Payouts distributed', { roundId, tableId, betsCount: bets.length });
      this.emit('phase', { phase: PHASE.PAYOUT, tableId, roundId, winner, payoutSummary });
    } catch (err) {
      logger.error('Payout phase error', { roundId, error: err.message });
    }

    const redis = await getClient();
    await redis.del(`table:${tableId}:bets`);
    this.timer.start(game.settlementPhaseDuration, null, () => this._runPhase(PHASE.ROUND_COMPLETE));
  }

  _phaseComplete() {
    logger.info('Round complete', { tableId: this.tableId, roundId: this.currentRound.roundId });
    this.emit('phase', { phase: PHASE.ROUND_COMPLETE, tableId: this.tableId, roundId: this.currentRound.roundId });
    this.currentRound = null;
    setImmediate(() => this._runPhase(PHASE.ROUND_INITIALIZATION));
  }

  async _saveToRedis(state) {
    const redis = await getClient();
    await redis.set(`table:${this.tableId}:round`, JSON.stringify(state), { EX: 300 });
  }
}

module.exports = { RoundManager, PHASE };
