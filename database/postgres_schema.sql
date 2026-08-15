-- e-Game Marketplace — production Postgres schema
-- Mirrors backend/db/init.js (SQLite, used for local dev) 1:1 in structure.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TYPE game_type AS ENUM ('free_fire', 'pubg_mobile', 'efootball');
CREATE TYPE account_status AS ENUM ('pending_analysis', 'analyzed', 'listed', 'sold', 'rejected');
CREATE TYPE list_type AS ENUM ('fixed', 'auction');
CREATE TYPE listing_status AS ENUM ('active', 'sold', 'cancelled');
CREATE TYPE verification_type AS ENUM ('manual', 'api');
CREATE TYPE escrow_status AS ENUM ('awaiting_deposit', 'funded', 'transfer_in_progress', 'confirmed', 'released', 'disputed', 'refunded');
CREATE TYPE dispute_status AS ENUM ('open', 'resolved_buyer', 'resolved_seller');
CREATE TYPE media_type AS ENUM ('image', 'video');
CREATE TYPE inventory_tab AS ENUM ('characters', 'weapons', 'fashion', 'emotes', 'vehicles', 'collection', 'others');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  display_name TEXT,
  reputation_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id),
  game game_type NOT NULL,
  uid TEXT NOT NULL,
  login_binding TEXT,
  level INTEGER DEFAULT 0,
  rank TEXT,
  currency_amount INTEGER DEFAULT 0,
  pass_status JSONB,
  declared_items JSONB DEFAULT '[]',
  status account_status DEFAULT 'pending_analysis',
  fraud_flag BOOLEAN DEFAULT false,
  duplicate_of UUID REFERENCES accounts(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_accounts_game_uid ON accounts(game, uid);
CREATE INDEX idx_accounts_seller ON accounts(seller_id);

CREATE TABLE screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  file_path TEXT NOT NULL,
  perceptual_hash TEXT,
  ai_detections JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_screenshots_hash ON screenshots(perceptual_hash);

CREATE TABLE valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  base_level_score NUMERIC,
  skin_value_score NUMERIC,
  rarity_multiplier NUMERIC,
  rank_bonus NUMERIC,
  currency_equiv_value NUMERIC,
  demand_index NUMERIC,
  estimated_value NUMERIC,
  floor_price NUMERIC,
  breakdown JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_valuations_account ON valuations(account_id);

CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  list_type list_type NOT NULL DEFAULT 'fixed',
  ai_verified BOOLEAN DEFAULT true,
  floor_price NUMERIC NOT NULL,
  asking_price NUMERIC NOT NULL,
  auction_ends_at TIMESTAMPTZ,
  status listing_status DEFAULT 'active',
  verification_type verification_type DEFAULT 'manual',
  verification_provider TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_listings_status_game ON listings(status);

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tab inventory_tab NOT NULL,
  subcategory TEXT NOT NULL,
  name TEXT NOT NULL,
  rarity TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  proof_media_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_inventory_items_account_tab ON inventory_items(account_id, tab);

CREATE TABLE inventory_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tab inventory_tab NOT NULL,
  media_type media_type NOT NULL,
  file_path TEXT NOT NULL, -- or an S3/object-storage URL in production
  perceptual_hash TEXT,
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_inventory_proofs_account_tab ON inventory_proofs(account_id, tab);
CREATE INDEX idx_inventory_proofs_hash ON inventory_proofs(perceptual_hash);

CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_id UUID NOT NULL REFERENCES users(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USDT-TRC20',
  chain_tx_hash TEXT,
  status escrow_status DEFAULT 'awaiting_deposit',
  commission_rate NUMERIC DEFAULT 0.08,
  commission_amount NUMERIC,
  seller_payout NUMERIC,
  auto_release_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_escrow_parties ON escrow_transactions(buyer_id, seller_id);
CREATE INDEX idx_escrow_auto_release ON escrow_transactions(status, auto_release_at);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES escrow_transactions(id),
  raised_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  evidence_files JSONB DEFAULT '[]',
  status dispute_status DEFAULT 'open',
  resolution_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  delta NUMERIC NOT NULL,
  related_escrow_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_reputation_user ON reputation_events(user_id);

CREATE TABLE fraud_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  rule_triggered TEXT NOT NULL,
  details JSONB,
  severity TEXT DEFAULT 'low',
  created_at TIMESTAMPTZ DEFAULT now()
);
