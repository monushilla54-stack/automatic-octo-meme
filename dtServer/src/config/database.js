'use strict';

const logger = require('../utils/logger');

// Demo mode: No Postgres required
async function query(text, params) {
  logger.debug('Mock Query Executed: ' + text);
  return { rows: [] };
}

async function withTransaction(fn) {
  return await fn({});
}

async function testConnection() {
  logger.info('Demo Mode Active: Postgres bypassed.');
}

module.exports = { query, withTransaction, testConnection, pool: null };
