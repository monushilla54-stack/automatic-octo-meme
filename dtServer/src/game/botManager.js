'use strict';

const logger = require('../utils/logger');
const tableManager = require('./tableManager');
const betManager = require('./betManager');
const walletService = require('../wallet/walletService');

const DEMO_BOTS = [
    { id: 'bot_101', name: 'DemoBot_101', balance: 125000 },
    { id: 'bot_202', name: 'DemoBot_202', balance: 94000 },
    { id: 'bot_303', name: 'DemoBot_303', balance: 350000 },
    { id: 'bot_404', name: 'DemoBot_404', balance: 67000 },
    { id: 'bot_505', name: 'DemoBot_505', balance: 21000 },
];

const BET_AREAS = ['dragon', 'tiger', 'tie'];
const BET_AMOUNTS = [100, 500, 1000];

let botInterval = null;

function init() {
    logger.info('Demo Bots Engine Initialized');
    
    // Periodically check tables and place random bets if in BETTING phase
    botInterval = setInterval(async () => {
        try {
            const tables = tableManager.listTables();
            for (const table of tables) {
                const tableId = table.tableId;
                const ts = tableManager.getTableState(tableId);
                const rm = tableManager.getRoundManager(tableId);
                
                if (!ts || !rm) continue;

                // Only bet if the round phase is BETTING
                const state = await rm.getStateSnapshot();
                if (!state || state.phase !== 'BETTING_OPEN') continue;

                // Add bots to table if they aren't there yet
                let addedBots = false;
                for (const bot of DEMO_BOTS) {
                    if (!ts._players.has(bot.id)) {
                        await walletService.updateBalance(bot.id, bot.balance);
                        ts.upsertPlayer({
                            playerId: bot.id,
                            username: bot.name,
                            balance: bot.balance,
                            socketId: null
                        });
                        addedBots = true;
                    }
                }

                if (addedBots) {
                    ts.broadcastPlayerState();
                }

                // Randomly decide if a bot should bet this tick (approx 60% chance)
                if (Math.random() < 0.6) {
                    // Pick 1 to 3 random bots to bet in this single tick
                    const numBets = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3 bots
                    for (let i = 0; i < numBets; i++) {
                        const randomBot = DEMO_BOTS[Math.floor(Math.random() * DEMO_BOTS.length)];
                        const roundId = rm.getCurrentRoundId();
                        if (!roundId) continue;

                        const betsThisTurn = Math.floor(Math.random() * 3) + 1;
                        const shuffledAreas = [...BET_AREAS].sort(() => Math.random() - 0.5);
                        const selectedAreas = shuffledAreas.slice(0, betsThisTurn);

                        for (const randomArea of selectedAreas) {
                            const randomAmount = BET_AMOUNTS[Math.floor(Math.random() * BET_AMOUNTS.length)];

                            const betResult = await betManager.processBet({
                                playerId: randomBot.id,
                                roundId,
                                tableId,
                                betEndTime: rm.getBetEndTime(),
                                data: {
                                    type: 'PLACE_BET',
                                    area: randomArea,
                                    amount: randomAmount,
                                    betId: `botbet_${roundId}_${randomBot.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                                    timestamp: Date.now(),
                                }
                            });

                            if (!betResult.success) continue;

                            const balance = await walletService.getBalance(randomBot.id);
                            ts.recordBet(randomBot.id, randomArea, randomAmount);
                            ts.updateBalance(randomBot.id, balance);
                            ts.broadcastBetTotals();
                            ts.broadcastBetPlaced(randomBot.id, randomBot.name, randomArea, randomAmount);
                            ts.broadcastPlayerState();

                            logger.verbose(`Bot ${randomBot.name} bet ${randomAmount} on ${randomArea}`);
                        }
                    }
                }
            }
        } catch (err) {
            logger.error('Bot Engine Error', { error: err.message });
        }
    }, 400); // Check every 400ms instead of 1.5s
}

function shutdown() {
    if (botInterval) clearInterval(botInterval);
}

module.exports = { init, shutdown };
