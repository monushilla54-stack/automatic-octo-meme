-- Migration 002: Provably Fair Commit-Reveal
-- Adds commitment_hash (published before betting) and server_nonce (revealed after result)

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS commitment_hash VARCHAR(64);
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS server_nonce   VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_rounds_commitment ON rounds(commitment_hash);
