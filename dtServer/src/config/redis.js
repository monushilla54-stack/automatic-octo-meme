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
  if (!client) {
    client = createInMemoryStub();
  }
  return client;
}

async function testConnection() {
  const c = await getClient();
  logger.warn('Redis: in-memory stub active (DEMO MODE)');
}

module.exports = { getClient, testConnection };
