'use strict';

const { Pool } = require('pg');
const { databaseUrl } = require('./environment');
const logger = require('../utils/logger');

// Supabase via PgBouncer requires SSL and no prepared statements
const isSupabase = databaseUrl.includes('supabase.com');

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error', { code: err.code, detail: err.message });
});

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    logger.debug('Query ok', { ms: Date.now() - start, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('Query error', { text, code: err.code, detail: err.message });
    throw err;
  }
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function testConnection() {
  const result = await query('SELECT NOW()');
  logger.info('PostgreSQL connected', { serverTime: result.rows[0].now });
}

module.exports = { query, withTransaction, testConnection, pool };
