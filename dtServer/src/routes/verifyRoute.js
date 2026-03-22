'use strict';

const express = require('express');
const { getRoundById } = require('../models/roundModel');
const { verifyCommitment } = require('../game/rngService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /verify/:roundId
 *
 * Public endpoint — anyone can verify a completed round.
 *
 * Returns:
 *   {
 *     roundId, dragonCard, tigerCard, winner,
 *     commitmentHash, nonce,
 *     verified: true/false,
 *     howToVerify: "SHA256('Suit-rank:Suit-rank:nonce') === commitmentHash"
 *   }
 */
router.get('/:roundId', async (req, res) => {
  try {
    const round = await getRoundById(req.params.roundId);

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    if (!round.server_nonce) {
      return res.status(202).json({ message: 'Round not yet complete — nonce will be available after reveal' });
    }

    const verified = verifyCommitment({
      dragonCard:     round.dragon_card,
      tigerCard:      round.tiger_card,
      nonce:          round.server_nonce,
      commitmentHash: round.commitment_hash,
    });

    logger.info('Round verified', { roundId: round.round_id, verified });

    return res.json({
      roundId:        round.round_id,
      dragonCard:     round.dragon_card,
      tigerCard:      round.tiger_card,
      winner:         round.winner,
      commitmentHash: round.commitment_hash,
      nonce:          round.server_nonce,
      verified,
      howToVerify: 'SHA256(`${dragonCard.suit}-${dragonCard.rank}:${tigerCard.suit}-${tigerCard.rank}:${nonce}`) must equal commitmentHash',
      createdAt:   round.created_at,
    });

  } catch (err) {
    logger.error('Verify endpoint error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
