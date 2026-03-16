-- Dragon Tiger Casino Database Schema
-- Run once to initialize the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- WALLET LEDGER
-- Balances are derived by SUM(amount) per player.
-- Debits (bet_lock) are stored as negative values.
-- Credits (payout, deposit, bet_release) are stored as positive.
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20)  NOT NULL CHECK (transaction_type IN ('deposit','bet_lock','bet_release','payout')),
  amount           NUMERIC(14,2) NOT NULL,
  reference_id     VARCHAR(100),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_player_id ON wallet_ledger(player_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reference_id ON wallet_ledger(reference_id);

-- ============================================================
-- ROUNDS
-- ============================================================
CREATE TABLE IF NOT EXISTS rounds (
  round_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id    VARCHAR(50)  NOT NULL,
  dragon_card SMALLINT,
  tiger_card  SMALLINT,
  winner      VARCHAR(6)   CHECK (winner IN ('dragon','tiger','tie')),
  status      VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rounds_table_id ON rounds(table_id);
CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);

-- ============================================================
-- BETS
-- ============================================================
CREATE TABLE IF NOT EXISTS bets (
  bet_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_bet_id VARCHAR(100) NOT NULL UNIQUE,   -- client-supplied idempotency key
  player_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id   UUID         NOT NULL REFERENCES rounds(round_id) ON DELETE CASCADE,
  bet_area   VARCHAR(6)   NOT NULL CHECK (bet_area IN ('dragon','tiger','tie')),
  amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status     VARCHAR(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','won','lost','refunded')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bets_player_id ON bets(player_id);
CREATE INDEX IF NOT EXISTS idx_bets_round_id ON bets(round_id);
CREATE INDEX IF NOT EXISTS idx_bets_client_bet_id ON bets(client_bet_id);

-- ============================================================
-- PAYMENT TRANSACTIONS (Demo)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status         VARCHAR(10)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_player_id ON payment_transactions(player_id);
