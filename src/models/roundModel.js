'use strict';

const { query } = require('../config/database');

async function createRound({ tableId, commitmentHash }) {
  const result = await query(
    `INSERT INTO rounds (table_id, commitment_hash)
     VALUES ($1, $2)
     RETURNING round_id, table_id, commitment_hash, status, created_at`,
    [tableId, commitmentHash]
  );
  return result.rows[0];
}

/**
 * Persist result and reveal the nonce (completes the commit-reveal).
 */
async function updateRoundResult({ roundId, dragonCard, tigerCard, winner, nonce }) {
  const result = await query(
    `UPDATE rounds
     SET dragon_card = $1, tiger_card = $2, winner = $3, server_nonce = $4, status = 'complete'
     WHERE round_id = $5
     RETURNING *`,
    [dragonCard, tigerCard, winner, nonce, roundId]
  );
  return result.rows[0];
}

async function getActiveRound(tableId) {
  const result = await query(
    `SELECT * FROM rounds WHERE table_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [tableId]
  );
  return result.rows[0] || null;
}

/**
 * Fetch a completed round by ID for provably-fair verification.
 */
async function getRoundById(roundId) {
  const result = await query(
    `SELECT round_id, dragon_card, tiger_card, winner, commitment_hash, server_nonce, created_at
     FROM rounds WHERE round_id = $1`,
    [roundId]
  );
  return result.rows[0] || null;
}

module.exports = { createRound, updateRoundResult, getActiveRound, getRoundById };
