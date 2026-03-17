'use strict';

require('dotenv').config();
const Joi = require('joi');

const schema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  DATABASE_URL: Joi.string().optional(),
  REDIS_URL: Joi.string().optional(),
  JWT_SECRET: Joi.string().default('development_secret_hit_the_jackpot'),
  BCRYPT_ROUNDS: Joi.number().integer().min(10).default(12),
  MIN_BET_AMOUNT: Joi.number().positive().default(1),
  MAX_BET_AMOUNT: Joi.number().positive().default(10000),
  BETTING_START_DELAY_DURATION: Joi.number().integer().positive().default(1000),
  BETTING_PHASE_DURATION: Joi.number().integer().positive().default(12000),
  BETTING_STOP_DURATION:  Joi.number().integer().positive().default(1000),
  REVEAL_PHASE_DURATION:  Joi.number().integer().positive().default(3000),
  PAYOUT_PHASE_DURATION: Joi.number().integer().positive().default(2000),
  ROUND_COMPLETE_DELAY_DURATION: Joi.number().integer().positive().default(3000),
  SETTLEMENT_PHASE_DURATION: Joi.number().integer().positive().default(3000),
}).unknown(true);

const { error, value: env } = schema.validate(process.env);

if (error) {
  logger.warn(`Environment validation failed: ${error.message}. Proceeding in DEMO mode with defaults.`);
}

module.exports = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  jwtSecret: env.JWT_SECRET,
  bcryptRounds: env.BCRYPT_ROUNDS,
  game: {
    minBet: env.MIN_BET_AMOUNT,
    maxBet: env.MAX_BET_AMOUNT,
    maxPlayersPerTable: env.MAX_PLAYERS_PER_TABLE,
    bettingStartDelayDuration: env.BETTING_START_DELAY_DURATION,
    bettingPhaseDuration: env.BETTING_PHASE_DURATION,
    bettingStopDuration:  env.BETTING_STOP_DURATION,
    revealPhaseDuration:  env.REVEAL_PHASE_DURATION,
    payoutPhaseDuration: env.PAYOUT_PHASE_DURATION,
    roundCompleteDelayDuration: env.ROUND_COMPLETE_DELAY_DURATION || env.SETTLEMENT_PHASE_DURATION,
  },
};
