// Node's built-in SQLite (stable since Node 22.5) — zero native compilation,
// zero external DB setup. Its prepare().run()/.get()/.all() API is a
// near drop-in match for better-sqlite3, so swapping to better-sqlite3
// later (e.g. to support older Node LTS in production) only touches this
// file.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'marketplace.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  wallet_address TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  auth_provider TEXT DEFAULT 'email',
  avatar_url TEXT,
  cover_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  display_name TEXT,
  username TEXT UNIQUE,
  bio TEXT,
  efootball_uid TEXT UNIQUE,
  efootball_name TEXT,
  reputation_score REAL DEFAULT 0,
  total_won_usd REAL DEFAULT 0,
  tournaments_won INTEGER DEFAULT 0,
  tournaments_played INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id),
  game TEXT NOT NULL,                       -- 'free_fire' | 'pubg_mobile' | 'efootball'
  uid TEXT NOT NULL,
  login_binding TEXT,                       -- optional email/id binding, never a password
  level INTEGER,
  rank TEXT,
  currency_amount INTEGER DEFAULT 0,        -- diamonds / UC / coins as declared + detected
  pass_status TEXT,                         -- JSON: {"type":"elite_pass|royale_pass","active":true,"season":"S12"}
  declared_items TEXT,                      -- JSON array of {name, category, rarity} seller-declared
  status TEXT DEFAULT 'pending_analysis',   -- pending_analysis | analyzed | listed | sold | rejected
  fraud_flag INTEGER DEFAULT 0,
  duplicate_of TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS screenshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  category TEXT NOT NULL,                   -- inventory | rank | rare_item | currency
  file_path TEXT NOT NULL,
  perceptual_hash TEXT,                     -- used for duplicate/authenticity checks
  ai_detections TEXT,                       -- JSON: detected items/rarity/confidence
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS valuations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  base_level_score REAL,
  skin_value_score REAL,
  rarity_multiplier REAL,
  rank_bonus REAL,
  currency_equiv_value REAL,
  demand_index REAL,
  estimated_value REAL,
  floor_price REAL,
  breakdown TEXT,                            -- JSON explaining every line item
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  list_type TEXT NOT NULL DEFAULT 'fixed',   -- fixed | auction
  ai_verified INTEGER DEFAULT 1,
  floor_price REAL NOT NULL,
  asking_price REAL NOT NULL,
  auction_ends_at TEXT,
  status TEXT DEFAULT 'active',              -- active | sold | cancelled
  verification_type TEXT DEFAULT 'manual',   -- manual | api_verified
  verification_provider TEXT,                -- e.g. 'screenshot_manual', future: 'garena_official'
  verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Inventory items shown in the game-accurate Vault/Inventory viewer.
-- Populated either by a seller's manual per-tab screenshot/video upload
-- (default today) or, in the future, by an official API provider — see
-- /backend/providers.
CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  tab TEXT NOT NULL,          -- characters | weapons | fashion | emotes | vehicles | collection | others
  subcategory TEXT NOT NULL,  -- gun_skin | character_bundle | emote | pet | vehicle | backpack | gloo_wall |
                               -- weapon_collection | costume | outfit | headgear | shoes | avatar | frame | badge | elite_pass | royale_pass | other
  name TEXT NOT NULL,
  rarity TEXT,                -- common | rare | epic | legendary | mythic
  source TEXT NOT NULL DEFAULT 'manual', -- manual | api:<provider_id>
  proof_media_id TEXT,        -- FK-ish reference into inventory_proofs
  created_at TEXT DEFAULT (datetime('now'))
);

-- Per-tab screenshot/video proof the seller uploads, browsable by the
-- buyer in the same tab structure as the game's own inventory UI.
CREATE TABLE IF NOT EXISTS inventory_proofs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  tab TEXT NOT NULL,
  media_type TEXT NOT NULL,   -- image | video
  file_path TEXT NOT NULL,
  perceptual_hash TEXT,
  captured_at TEXT,           -- seller-declared capture time, shown to buyer for freshness
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bids (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS escrow_transactions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USDT-TRC20',
  chain_tx_hash TEXT,                        -- populated once a real chain integration is wired in
  payment_provider TEXT,                     -- e.g. 'nowpayments'
  payment_id TEXT,                           -- processor's payment/invoice id
  invoice_url TEXT,                          -- hosted checkout page for the buyer
  status TEXT DEFAULT 'awaiting_deposit',
  -- awaiting_deposit -> funded -> transfer_in_progress -> confirmed -> released | disputed | refunded
  commission_rate REAL DEFAULT 0.08,
  commission_amount REAL,
  seller_payout REAL,
  -- Anti-fraud: once the seller marks the manual transfer done, a
  -- countdown starts. If the buyer neither confirms nor disputes before
  -- this deadline, funds auto-release to the seller — this stops a
  -- dishonest buyer from taking control of the account and simply never
  -- clicking "confirm" to keep the seller's money locked forever.
  auto_release_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  escrow_id TEXT NOT NULL REFERENCES escrow_transactions(id),
  raised_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  evidence_files TEXT,                       -- JSON array of uploaded proof file paths
  status TEXT DEFAULT 'open',                -- open | resolved_buyer | resolved_seller
  resolution_note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Tracks reputation-affecting outcomes so repeat offenders (sellers who
-- get disputed-and-lose, buyers who dispute in bad faith and lose) become
-- visible before they can transact again.
CREATE TABLE IF NOT EXISTS reputation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,  -- trade_completed | dispute_lost | dispute_won | fraud_flagged
  delta REAL NOT NULL,
  related_escrow_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fraud_logs (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  rule_triggered TEXT NOT NULL,
  details TEXT,
  severity TEXT DEFAULT 'low',               -- low | medium | high
  created_at TEXT DEFAULT (datetime('now'))
);
`);


/* v2-specific match table — references tournaments_v2 */
db.exec(`
CREATE TABLE IF NOT EXISTS tournament_matches_v2 (
  id             TEXT PRIMARY KEY,
  tournament_id  TEXT NOT NULL REFERENCES tournaments_v2(id),
  round          INTEGER NOT NULL,
  match_number   INTEGER NOT NULL,
  player1_id     TEXT REFERENCES users(id),
  player2_id     TEXT REFERENCES users(id),
  status         TEXT DEFAULT 'pending',
  winner_id      TEXT REFERENCES users(id),
  loser_id       TEXT REFERENCES users(id),
  result_note    TEXT,
  declared_by    TEXT REFERENCES users(id),
  declared_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_tmv2_tournament ON tournament_matches_v2(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tmv2_round      ON tournament_matches_v2(tournament_id, round);
`);

// Safe migration for pre-existing databases created before email/Google
// auth was added — ALTER TABLE fails silently if the column already exists.
for (const col of [
  'email TEXT',
  'password_hash TEXT',
  "auth_provider TEXT DEFAULT 'email'",
  'avatar_url TEXT',
]) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch (e) { /* already exists */ }
}

module.exports = db;

/* ─────────────────────────────────────────────────────────────────────────
   PAYMENT & DEPOSIT SYSTEM
   ──────────────────────────────────────────────────────────────────────── */

/* Internal wallet — every user has one balance in USD equivalent.
   Funded by MFS (bKash/Nagad/Rocket) or crypto deposits.
   Used for marketplace purchases, tournament entry fees, prize payouts. */
db.exec(`
CREATE TABLE IF NOT EXISTS wallet_balances (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  balance    REAL NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

/* Every deposit attempt, regardless of channel or status */
CREATE TABLE IF NOT EXISTS deposits (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  channel          TEXT NOT NULL,   -- 'bkash'|'nagad'|'rocket'|'upay'|'crypto'
  amount_local     REAL NOT NULL,   -- BDT for MFS, USD for crypto
  amount_usd       REAL NOT NULL,   -- converted to USD at deposit time
  currency         TEXT NOT NULL,   -- 'BDT' or 'USDT'|'BTC'|'ETH' etc.
  provider_ref     TEXT,            -- gateway transaction/payment id
  provider_payload TEXT,            -- JSON: full webhook/callback body
  status           TEXT DEFAULT 'pending', -- pending|completed|failed|refunded
  created_at       TEXT DEFAULT (datetime('now')),
  completed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_deposits_user   ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_ref    ON deposits(provider_ref);

/* Withdrawals / payouts (prize money, escrow release) */
CREATE TABLE IF NOT EXISTS withdrawals (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  channel      TEXT NOT NULL,
  amount_usd   REAL NOT NULL,
  amount_local REAL,
  account_no   TEXT,       -- bKash/Nagad number or crypto address
  status       TEXT DEFAULT 'pending', -- pending|processing|completed|failed
  admin_note   TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
`);

/* ─────────────────────────────────────────────────────────────────────────
   TOURNAMENT SYSTEM
   ──────────────────────────────────────────────────────────────────────── */
db.exec(`
CREATE TABLE IF NOT EXISTS tournaments (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  game          TEXT NOT NULL,          -- free_fire|pubg_mobile|efootball|other
  description   TEXT,
  entry_fee_usd REAL NOT NULL DEFAULT 0,
  prize_pool_usd REAL NOT NULL DEFAULT 0,
  prize_breakdown TEXT,                  -- JSON: [{place:1,amount:500},{place:2,amount:200}]
  max_players   INTEGER DEFAULT 32,
  status        TEXT DEFAULT 'upcoming', -- upcoming|registration|ongoing|completed|cancelled
  start_at      TEXT NOT NULL,
  end_at        TEXT,
  rules         TEXT,
  banner_url    TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournament_participants (
  id              TEXT PRIMARY KEY,
  tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  game_uid        TEXT,                 -- in-game UID to verify participation
  entry_fee_paid  REAL NOT NULL DEFAULT 0,
  deposit_id      TEXT REFERENCES deposits(id),
  status          TEXT DEFAULT 'registered', -- registered|checked_in|eliminated|winner
  placement       INTEGER,              -- 1st, 2nd, 3rd …
  prize_won_usd   REAL DEFAULT 0,
  joined_at       TEXT DEFAULT (datetime('now')),
  UNIQUE(tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tp_tournament ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tp_user       ON tournament_participants(user_id);

CREATE TABLE IF NOT EXISTS tournament_results (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  placement     INTEGER NOT NULL,
  prize_usd     REAL NOT NULL DEFAULT 0,
  paid_out      INTEGER DEFAULT 0,      -- 0/1 boolean
  paid_at       TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
`);

/* ─────────────────────────────────────────────────────────────────────────
   MANUAL MFS PAYMENT ACCOUNTS (Admin-managed bKash/Nagad numbers)
   ──────────────────────────────────────────────────────────────────────── */
db.exec(`
CREATE TABLE IF NOT EXISTS mfs_accounts (
  id          TEXT PRIMARY KEY,
  channel     TEXT NOT NULL,      -- 'bkash' | 'nagad' | 'rocket' | 'upay'
  number      TEXT NOT NULL,      -- e.g. 01XXXXXXXXX
  account_name TEXT,              -- display name
  is_active   INTEGER DEFAULT 1,
  priority    INTEGER DEFAULT 0,  -- higher = more likely to be picked
  created_at  TEXT DEFAULT (datetime('now'))
);


/* Manual withdrawal requests — user requests payout, admin sends manually */
CREATE TABLE IF NOT EXISTS manual_withdrawals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  provider        TEXT NOT NULL,
  to_number       TEXT NOT NULL,
  holder_name     TEXT,
  amount_usd      REAL NOT NULL,
  amount_bdt      REAL NOT NULL,
  status          TEXT DEFAULT 'pending',
  admin_note      TEXT,
  trx_id          TEXT,
  reviewed_by     TEXT REFERENCES users(id),
  created_at      TEXT DEFAULT (datetime('now')),
  completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_manual_wd_user   ON manual_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_wd_status ON manual_withdrawals(status);

/* ─────────────────────────────────────────────────────────────────────────
   UPGRADED TOURNAMENT: anyone can create, bracket + match management
   ──────────────────────────────────────────────────────────────────────── */

/* Tournament matches — auto-generated bracket */
CREATE TABLE IF NOT EXISTS tournament_matches (
  id              TEXT PRIMARY KEY,
  tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
  round           INTEGER NOT NULL,   -- 1 = first round, 2 = quarterfinal, etc.
  match_number    INTEGER NOT NULL,   -- position in this round
  player1_id      TEXT REFERENCES users(id),
  player2_id      TEXT REFERENCES users(id),
  winner_id       TEXT REFERENCES users(id),
  loser_id        TEXT REFERENCES users(id),
  status          TEXT DEFAULT 'pending', -- pending|ongoing|completed|walkover
  scheduled_at    TEXT,
  completed_at    TEXT,
  result_note     TEXT,               -- organizer's note (score, etc.)
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tm_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tm_round      ON tournament_matches(tournament_id, round);
`);

/* ─────────────────────────────────────────────────────────────────────────
   MANUAL PAYMENT SYSTEM (bKash/Nagad manual verification)
   ──────────────────────────────────────────────────────────────────────── */
db.exec(`
/* Admin-managed payment account numbers shown to depositors */
CREATE TABLE IF NOT EXISTS payment_accounts (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,   -- 'bkash' | 'nagad' | 'rocket' | 'upay'
  number      TEXT NOT NULL,
  holder_name TEXT,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

/* Manual deposit requests — player submits TrxID, admin approves */
CREATE TABLE IF NOT EXISTS manual_deposits (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  provider        TEXT NOT NULL,
  to_number       TEXT NOT NULL,   -- which account number we showed them
  amount_bdt      REAL NOT NULL,
  amount_usd      REAL NOT NULL,
  trx_id          TEXT NOT NULL,   -- transaction ID from bKash/Nagad
  sender_number   TEXT,            -- player's bKash/Nagad number
  screenshot_path TEXT,            -- optional proof screenshot
  status          TEXT DEFAULT 'pending', -- pending|approved|rejected
  admin_note      TEXT,
  reviewed_by     TEXT REFERENCES users(id),
  reviewed_at     TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_md_user   ON manual_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_md_status ON manual_deposits(status);

/* Manual withdrawal requests */
CREATE TABLE IF NOT EXISTS manual_withdrawals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  provider        TEXT NOT NULL,
  to_number       TEXT NOT NULL,   -- player's bKash/Nagad number
  holder_name     TEXT,
  amount_usd      REAL NOT NULL,
  amount_bdt      REAL NOT NULL,
  status          TEXT DEFAULT 'pending', -- pending|processing|completed|rejected
  admin_note      TEXT,
  trx_id          TEXT,            -- filled by admin when sent
  reviewed_by     TEXT REFERENCES users(id),
  reviewed_at     TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mw_user   ON manual_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_mw_status ON manual_withdrawals(status);
`);

/* ─────────────────────────────────────────────────────────────────────────
   UPGRADED TOURNAMENT SYSTEM
   ──────────────────────────────────────────────────────────────────────── */
db.exec(`
CREATE TABLE IF NOT EXISTS tournaments_v2 (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  game            TEXT NOT NULL,
  description     TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),  -- any user, not just admin
  creator_name    TEXT,

  -- Slots & entry
  max_players     INTEGER NOT NULL DEFAULT 8,    -- 4|8|16|32|64
  entry_fee_usd   REAL NOT NULL DEFAULT 0,
  entry_fee_bdt   REAL NOT NULL DEFAULT 0,

  -- Prize distribution
  prize_pool_usd  REAL DEFAULT 0,  -- accumulates as players join
  platform_pct    REAL DEFAULT 12, -- 12% to platform
  creator_pct     REAL DEFAULT 3,  -- 3% to creator
  winner_pct      REAL DEFAULT 85, -- 85% to winner (100-12-3)

  -- Schedule & status
  status          TEXT DEFAULT 'open',
  -- open → in_progress → completed | cancelled
  start_at        TEXT,
  end_at          TEXT,
  rules           TEXT,
  bracket_type    TEXT DEFAULT 'single_elimination',
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

/* Match bracket — auto-generated when tournament starts */
CREATE TABLE IF NOT EXISTS tournament_matches (
  id              TEXT PRIMARY KEY,
  tournament_id   TEXT NOT NULL REFERENCES tournaments_v2(id),
  round           INTEGER NOT NULL,   -- 1 = quarterfinal etc.
  match_number    INTEGER NOT NULL,   -- position in bracket
  player1_id      TEXT REFERENCES users(id),
  player2_id      TEXT REFERENCES users(id),
  winner_id       TEXT REFERENCES users(id),
  loser_id        TEXT REFERENCES users(id),
  status          TEXT DEFAULT 'pending',  -- pending|in_progress|completed|walkover
  result_note     TEXT,   -- creator's note on the result
  declared_at     TEXT,
  declared_by     TEXT REFERENCES users(id),
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tm_tournament ON tournament_matches(tournament_id);

/* v2 participants */
CREATE TABLE IF NOT EXISTS tournament_players (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments_v2(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  game_uid      TEXT,
  entry_paid    REAL DEFAULT 0,
  status        TEXT DEFAULT 'active',  -- active|eliminated|winner
  placement     INTEGER,
  prize_won_usd REAL DEFAULT 0,
  joined_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tp2_tournament ON tournament_players(tournament_id);
`);

/* ── NEW TABLES (added for v3 upgrade) ──────────────────────────────────── */
db.exec(`
/* Profile extensions */
CREATE TABLE IF NOT EXISTS player_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  player_name TEXT NOT NULL,
  overall_rating INTEGER,
  position TEXT,
  team TEXT,
  league TEXT,
  card_type TEXT DEFAULT 'standard',
  card_image_url TEXT,
  is_maxed INTEGER DEFAULT 0,
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_player_cards_user ON player_cards(user_id);

CREATE TABLE IF NOT EXISTS user_trophies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tournament_id TEXT,
  tournament_title TEXT NOT NULL,
  placement INTEGER NOT NULL,
  prize_usd REAL DEFAULT 0,
  game TEXT,
  earned_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trophies_user ON user_trophies(user_id);

/* Platform settings (commissions, rates) */
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  label TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO platform_settings (key,value,label) VALUES
  ('listing_commission_pct',  '8',    'Listing sale commission (%)'),
  ('tournament_platform_pct', '12',   'Tournament platform cut (%)'),
  ('tournament_creator_pct',  '3',    'Tournament creator cut (%)'),
  ('tournament_winner_pct',   '85',   'Tournament winner payout (%)'),
  ('bdt_to_usd_rate',         '110',  'BDT per 1 USD'),
  ('min_deposit_bdt',         '100',  'Minimum deposit (BDT)'),
  ('min_withdraw_bdt',        '200',  'Minimum withdrawal (BDT)'),
  ('site_name',               'eGame Marketplace','Site name'),
  ('site_currency',           'BDT',  'Display currency');

/* Manual payment accounts (bKash/Nagad/Rocket numbers) */
CREATE TABLE IF NOT EXISTS payment_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  number TEXT NOT NULL,
  holder_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_provider ON payment_accounts(provider,is_active);

/* Manual deposits */
CREATE TABLE IF NOT EXISTS manual_deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  to_number TEXT NOT NULL,
  amount_bdt REAL NOT NULL,
  amount_usd REAL NOT NULL,
  trx_id TEXT,
  sender_number TEXT,
  screenshot_path TEXT,
  status TEXT DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_manual_deposits_user   ON manual_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_deposits_status ON manual_deposits(status);

/* Manual withdrawals */
CREATE TABLE IF NOT EXISTS manual_withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  to_number TEXT NOT NULL,
  holder_name TEXT,
  amount_usd REAL NOT NULL,
  amount_bdt REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  admin_note TEXT,
  trx_id TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_manual_withdrawals_user ON manual_withdrawals(user_id);

/* Tournaments V2 */
CREATE TABLE IF NOT EXISTS tournaments_v2 (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  game TEXT NOT NULL,
  description TEXT,
  rules TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  creator_name TEXT NOT NULL,
  max_players INTEGER DEFAULT 8,
  entry_fee_usd REAL DEFAULT 0,
  entry_fee_bdt REAL DEFAULT 0,
  prize_pool_usd REAL DEFAULT 0,
  prize_breakdown TEXT DEFAULT '[]',
  status TEXT DEFAULT 'open',
  start_at TEXT NOT NULL,
  end_at TEXT,
  banner_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_t2_status ON tournaments_v2(status);

CREATE TABLE IF NOT EXISTS tournament_players (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments_v2(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  display_name TEXT,
  username TEXT,
  game_uid TEXT,
  entry_paid REAL DEFAULT 0,
  status TEXT DEFAULT 'registered',
  placement INTEGER,
  prize_won_usd REAL DEFAULT 0,
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tournament_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_tp_tournament ON tournament_players(tournament_id);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments_v2(id),
  round INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  player1_id TEXT REFERENCES users(id),
  player2_id TEXT REFERENCES users(id),
  p1_name TEXT,
  p2_name TEXT,
  status TEXT DEFAULT 'pending',
  winner_id TEXT REFERENCES users(id),
  loser_id TEXT REFERENCES users(id),
  winner_name TEXT,
  declared_by TEXT REFERENCES users(id),
  declared_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tm_tournament ON tournament_matches(tournament_id,round);
`);

/* Add missing columns to users table if needed */
try {
  db.exec(`ALTER TABLE users ADD COLUMN username TEXT UNIQUE`);
} catch(e) { /* already exists */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN efootball_uid TEXT`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN efootball_name TEXT`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN bio TEXT`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN cover_url TEXT`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN total_won_usd REAL DEFAULT 0`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN tournaments_won INTEGER DEFAULT 0`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN tournaments_played INTEGER DEFAULT 0`);
} catch(e) {}
