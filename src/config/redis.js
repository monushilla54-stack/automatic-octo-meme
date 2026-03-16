'use strict';

const { createClient } = require('redis');
const logger = require('../utils/logger');

let client = null;

function createInMemoryStub() {
  const sets = {}, hashes = {}, strings = {};
  logger.warn('Redis not available — using in-memory stub (dev only)');
  return {
    isReady: true, isStub: true,
    ping: async () => 'PONG',
    get:  async (k)      => strings[k] || null,
    set:  async (k, v)   => { strings[k] = v; },
    del:  async (k)      => { delete sets[k]; delete hashes[k]; delete strings[k]; },
    expire: async ()     => {},
    sAdd: async (k, v)   => { if (!sets[k]) sets[k] = new Set(); if (sets[k].has(v)) return 0; sets[k].add(v); return 1; },
    sRem: async (k, v)   => { sets[k] && sets[k].delete(v); },
    hIncrByFloat: async (k, f, by) => {
      if (!hashes[k]) hashes[k] = {};
      hashes[k][f] = (parseFloat(hashes[k][f] || 0) + parseFloat(by)).toFixed(2);
      return hashes[k][f];
    },
  };
}

async function getClient() {
  if (client && (client.isReady || client.isStub)) return client;

  const isOptional = process.env.REDIS_OPTIONAL === 'true';
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  // Try to connect with a short timeout; fall back to stub if optional
  try {
    const c = createClient({ url, socket: { connectTimeout: 800, reconnectStrategy: false } });
    c.on('error', () => {}); // suppress during probe

    await Promise.race([
      c.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1000)),
    ]);

    await c.ping();
    client = c;
    client.on('error', (err) => logger.warn('Redis error', { msg: err.message }));
    logger.info('Redis connected');
  } catch {
    if (isOptional) {
      client = createInMemoryStub();
    } else {
      throw new Error('Redis unavailable. Set REDIS_OPTIONAL=true to use in-memory fallback.');
    }
  }

  return client;
}

async function testConnection() {
  const c = await getClient();
  if (c.isStub) { logger.warn('Redis: in-memory stub active (set REDIS_OPTIONAL=false for production)'); return; }
  await c.ping();
  logger.info('Redis ping OK');
}

module.exports = { getClient, testConnection };
