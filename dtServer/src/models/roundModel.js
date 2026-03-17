'use strict';

const { cardLabel } = require('../game/rngService');

// In-Memory Rounds Store: Array of round objects
const demoRounds = [
    {
        round_id: 'seed_1',
        table_id: 'table_1',
        status: 'complete',
        winner: 'dragon',
        dragon_card: 10,
        tiger_card: 5,
        completed_at: new Date(Date.now() - 60000).toISOString()
    },
    {
        round_id: 'seed_2',
        table_id: 'table_1',
        status: 'complete',
        winner: 'tiger',
        dragon_card: 3,
        tiger_card: 12,
        completed_at: new Date(Date.now() - 30000).toISOString()
    }
];

async function createRound({ tableId, commitmentHash }) {
    const round = {
        round_id: `round_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        table_id: tableId,
        commitment_hash: commitmentHash,
        status: 'active',
        created_at: new Date().toISOString()
    };
    demoRounds.push(round);
    return round;
}

/**
 * Persist result and reveal the nonce (completes the commit-reveal).
 */
async function updateRoundResult({ roundId, dragonCard, tigerCard, winner, nonce }) {
    const round = demoRounds.find(r => r.round_id === roundId);
    if (round) {
        round.dragon_card = dragonCard;
        round.tiger_card = tigerCard;
        round.winner = winner;
        round.server_nonce = nonce;
        round.status = 'complete';
        round.completed_at = new Date().toISOString();
    }
    return round;
}

async function getActiveRound(tableId) {
    // Find the most recently added active round for this table
    const activeRounds = demoRounds.filter(r => r.table_id === tableId && r.status === 'active');
    return activeRounds.length > 0 ? activeRounds[activeRounds.length - 1] : null;
}

/**
 * Fetch a completed round by ID for provably-fair verification.
 */
async function getRoundById(roundId) {
    return demoRounds.find(r => r.round_id === roundId) || null;
}

function toHistoryEntry(round) {
    return {
        roundId: round.round_id,
        winner: round.winner,
        dragonLabel: round.dragon_card ? cardLabel(round.dragon_card) : '',
        tigerLabel: round.tiger_card ? cardLabel(round.tiger_card) : '',
        ts: Date.parse(round.completed_at || round.created_at) || Date.now(),
    };
}

async function getRecentHistoryForTable(tableId, limit = 10) {
    return demoRounds
        .filter((round) => round.table_id === tableId && round.status === 'complete' && round.winner)
        .sort((a, b) => {
            const aTs = Date.parse(a.completed_at || a.created_at) || 0;
            const bTs = Date.parse(b.completed_at || b.created_at) || 0;
            return bTs - aTs;
        })
        .slice(0, limit)
        .reverse()
        .map(toHistoryEntry);
}

module.exports = {
    createRound,
    updateRoundResult,
    getActiveRound,
    getRoundById,
    getRecentHistoryForTable,
};
