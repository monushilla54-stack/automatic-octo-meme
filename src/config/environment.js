'use strict';

require('dotenv').config();
const Joi = require('joi');

const schema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  BCRYPT_ROUNDS: Joi.number().integer().min(10).default(12),
  MIN_BET_AMOUNT: Joi.number().positive().default(1),
  MAX_BET_AMOUNT: Joi.number().positive().default(10000),
  MAX_PLAYERS_PER_TABLE: Joi.number().integer().positive().default(100),
  BETTING_PHASE_DURATION: Joi.number().integer().positive().default(10000),
  REVEAL_PHASE_DURATION: Joi.number().integer().positive().default(3000),
  SETTLEMENT_PHASE_DURATION: Joi.number().integer().positive().default(2000),
}).unknown(true);

const { error, value: env } = schema.validate(process.env);

if (error) {
  throw new Error(`Environment validation failed: ${error.message}`);
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
    bettingPhaseDuration: env.BETTING_PHASE_DURATION,
    revealPhaseDuration: env.REVEAL_PHASE_DURATION,
    settlementPhaseDuration: env.SETTLEMENT_PHASE_DURATION,
  },
};
