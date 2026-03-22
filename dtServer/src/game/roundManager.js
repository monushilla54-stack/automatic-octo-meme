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
  BETTING_OPEN: 'BETTING_OPEN',
  BETTING_CLOSE: 'BETTING_CLOSE',
  RESULT_REVEAL: 'RESULT_REVEAL',
  PAYOUT: 'PAYOUT',
  ROUND_COMPLETE: 'ROUND_COMPLETE',
};

class RoundManager extends EventEmitter {
  constructor(tableId) {
    super();
    this.tableId = tableId;
    this.timer = new TimerService();
    this.currentRound = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    logger.info('RoundManager started', { tableId: this.tableId });
    this._runPhase(PHASE.ROUND_INITIALIZATION);
  }

  stop() {
    this._running = false;
    this.timer.stop();
  }

  async getStateSnapshot() {
    if (this.currentRound) return this._toPublicRoundState(this.currentRound);

    const redis = await getClient();
    const raw = await redis.get(`table:${this.tableId}:round`);
    return raw ? this._toPublicRoundState(JSON.parse(raw)) : null;
  }

  getBetEndTime() {
    return this.currentRound ? this.currentRound.bettingEndsAt || null : null;
  }

  getPhaseEndTime() {
    return this.currentRound ? this.currentRound.phaseEndsAt || null : null;
  }

  getCurrentRoundId() {
    return this.currentRound ? this.currentRound.roundId : null;
  }

  _toPublicRoundState(roundState) {
    if (!roundState) return null;

    const publicState = { ...roundState };
    delete publicState.nonce;
    delete publicState._secret;

    const canRevealResult =
      publicState.phase === PHASE.RESULT_REVEAL ||
      publicState.phase === PHASE.PAYOUT ||
      publicState.phase === PHASE.ROUND_COMPLETE;

    if (!canRevealResult) {
      delete publicState.dragonCard;
      delete publicState.dragonSuit;
      delete publicState.tigerCard;
      delete publicState.tigerSuit;
      delete publicState.dragonLabel;
      delete publicState.tigerLabel;
      delete publicState.winner;
    }

    return publicState;
  }

  _markPhase(phase, durationMs = 0, extra = {}) {
    const now = Date.now();
    this.currentRound.phase = phase;
    this.currentRound.phaseStartedAt = now;
    this.currentRound.phaseEndsAt = durationMs > 0 ? now + durationMs : null;
    Object.assign(this.currentRound, extra);
  }

  _emitClientEvent(eventName, phase, data = {}) {
    const serverTime = Date.now();
    this.emit('phase', {
      event: eventName,
      phase,
      data: {
        phase,
        serverTime,
        ...data,
      },
    });
  }

  _emitPhaseEvent(phase, data = {}) {
    this.emit('phase', {
      phase,
      serverTime: Date.now(),
      ...data,
    });
  }

  _runPhase(phase) {
    if (!this._running) return;
    logger.debug('Round phase', { tableId: this.tableId, phase });

    switch (phase) {
      case PHASE.ROUND_INITIALIZATION:
        return this._phaseInit();
      case PHASE.BETTING_OPEN:
        return this._phaseBettingOpen();
      case PHASE.BETTING_CLOSE:
        return this._phaseBettingClose();
      case PHASE.RESULT_REVEAL:
        return this._phaseResultReveal();
      case PHASE.PAYOUT:
        return this._phasePayouts();
      case PHASE.ROUND_COMPLETE:
        return this._phaseComplete();
      default:
        return undefined;
    }
  }

  async _phaseInit() {
    try {
      const { dragonCard, tigerCard, nonce, commitmentHash } = generateRoundCommitment();
      const dbRound = await roundModel.createRound({ tableId: this.tableId, commitmentHash });

      const now = Date.now();
      const bettingStartsAt = now + game.bettingStartDelayDuration;
      const bettingEndsAt = bettingStartsAt + game.bettingPhaseDuration;

      this.currentRound = {
        roundId: dbRound.round_id,
        tableId: this.tableId,
        dragonCard: dragonCard.rank,
        dragonSuit: dragonCard.suit,
        tigerCard: tigerCard.rank,
        tigerSuit: tigerCard.suit,
        nonce,
        commitmentHash,
        phase: PHASE.ROUND_INITIALIZATION,
        startedAt: now,
        phaseStartedAt: now,
        phaseEndsAt: bettingStartsAt,
        bettingStartsAt,
        bettingEndsAt,
      };

      await this._saveToRedis({ ...this.currentRound, _secret: true });

      this._emitPhaseEvent(PHASE.ROUND_INITIALIZATION, {
        tableId: this.tableId,
        roundId: this.currentRound.roundId,
        phaseEndsAt: bettingStartsAt,
        bettingStartsAt,
        bettingEndsAt,
      });

      this._emitClientEvent('roundStart', PHASE.ROUND_INITIALIZATION, {
        tableId: this.tableId,
        roundId: this.currentRound.roundId,
        bettingStartsAt,
        bettingEndsAt,
        commitmentHash,
      });

      this.timer.start(game.bettingStartDelayDuration, null, () => this._runPhase(PHASE.BETTING_OPEN));
    } catch (err) {
      logger.error('Round init failed, retrying in 5s', { tableId: this.tableId, error: err.message });
      setTimeout(() => this._runPhase(PHASE.ROUND_INITIALIZATION), 5000);
    }
  }

  async _phaseBettingOpen() {
    const remainingMs = Math.max(0, (this.currentRound?.bettingEndsAt || 0) - Date.now());
    this._markPhase(PHASE.BETTING_OPEN, remainingMs);
    await this._saveToRedis({ ...this.currentRound, _secret: true });

    this._emitPhaseEvent(PHASE.BETTING_OPEN, {
      tableId: this.tableId,
      roundId: this.currentRound.roundId,
      phaseEndsAt: this.currentRound.phaseEndsAt,
      bettingStartsAt: this.currentRound.bettingStartsAt,
      bettingEndsAt: this.currentRound.bettingEndsAt,
    });

    this.emit('tick', {
      event: 'timerUpdate',
      data: { timeRemaining: remainingMs },
    });

    this.timer.start(
      remainingMs,
      (remaining) => {
        this.emit('tick', {
          event: 'timerUpdate',
          data: { timeRemaining: remaining },
        });
      },
      () => this._runPhase(PHASE.BETTING_CLOSE)
    );
  }

  async _phaseBettingClose() {
    this._markPhase(PHASE.BETTING_CLOSE, game.bettingStopDuration);
    await this._saveToRedis({ ...this.currentRound, _secret: true });

    this._emitPhaseEvent(PHASE.BETTING_CLOSE, {
      tableId: this.tableId,
      roundId: this.currentRound.roundId,
      phaseEndsAt: this.currentRound.phaseEndsAt,
      bettingEndsAt: this.currentRound.bettingEndsAt,
    });

    this.timer.start(game.bettingStopDuration, null, () => this._runPhase(PHASE.RESULT_REVEAL));
  }

  async _phaseResultReveal() {
    const { dragonCard, dragonSuit, tigerCard, tigerSuit, nonce, commitmentHash, roundId } = this.currentRound;
    const winner = determineWinner(dragonCard, tigerCard);

    await roundModel.updateRoundResult({ roundId, dragonCard, dragonSuit, tigerCard, tigerSuit, winner, nonce });

    this._markPhase(PHASE.RESULT_REVEAL, game.revealPhaseDuration, {
      winner,
      dragonLabel: cardLabel(dragonCard),
      tigerLabel: cardLabel(tigerCard),
    });

    await this._saveToRedis({ ...this.currentRound, _secret: true });

    this._emitClientEvent('roundResult', PHASE.RESULT_REVEAL, {
      tableId: this.tableId,
      roundId,
      phaseEndsAt: this.currentRound.phaseEndsAt,
      dragonCard,
      dragonSuit,
      dragonLabel: this.currentRound.dragonLabel,
      tigerCard,
      tigerSuit,
      tigerLabel: this.currentRound.tigerLabel,
      winner,
      proof: {
        nonce,
        commitmentHash,
        verifyUrl: `/verify/${roundId}`,
      },
    });

    this.timer.start(game.revealPhaseDuration, null, () => this._runPhase(PHASE.PAYOUT));
  }

  async _phasePayouts() {
    const { roundId, winner, tableId } = this.currentRound;
    this._markPhase(PHASE.PAYOUT, game.payoutPhaseDuration);
    await this._saveToRedis({ ...this.currentRound, _secret: true });

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
        payoutSummary.push({
          playerId: bet.player_id,
          betArea: bet.bet_area,
          amount: parseFloat(bet.amount),
          payout,
          newBalance,
        });
      }

      logger.info('Payouts distributed', { roundId, tableId, betsCount: bets.length });
      this._emitPhaseEvent(PHASE.PAYOUT, {
        tableId,
        roundId,
        winner,
        payoutSummary,
        phaseEndsAt: this.currentRound.phaseEndsAt,
      });
    } catch (err) {
      logger.error('Payout phase error', { roundId, error: err.message });
    }

    const redis = await getClient();
    await redis.del(`table:${tableId}:bets`);
    this.timer.start(game.payoutPhaseDuration, null, () => this._runPhase(PHASE.ROUND_COMPLETE));
  }

  async _phaseComplete() {
    this._markPhase(PHASE.ROUND_COMPLETE, game.roundCompleteDelayDuration);
    await this._saveToRedis({ ...this.currentRound, _secret: true });

    logger.info('Round complete', { tableId: this.tableId, roundId: this.currentRound.roundId });
    this._emitPhaseEvent(PHASE.ROUND_COMPLETE, {
      tableId: this.tableId,
      roundId: this.currentRound.roundId,
      winner: this.currentRound.winner,
      phaseEndsAt: this.currentRound.phaseEndsAt,
    });

    this.timer.start(game.roundCompleteDelayDuration, null, () => {
      this.currentRound = null;
      this._runPhase(PHASE.ROUND_INITIALIZATION);
    });
  }

  async _saveToRedis(state) {
    const redis = await getClient();
    await redis.set(`table:${this.tableId}:round`, JSON.stringify(state), { EX: 300 });
  }
}

module.exports = { RoundManager, PHASE };
