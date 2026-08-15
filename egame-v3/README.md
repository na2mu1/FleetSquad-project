# 🎮 e-Game Marketplace

AI-appraised gaming account marketplace (Free Fire / PUBG Mobile / eFootball)
with escrow-protected USDT payments and a game-accurate Vault/Inventory
viewer so buyers can inspect an account before paying.

```
egame-marketplace/
├── backend/            Express API — accounts, AI valuation, listings, escrow, admin
│   ├── ai/             Image analysis, pricing algorithm, fraud detection
│   ├── providers/      Pluggable inventory-data providers (manual + future official APIs)
│   ├── routes/
│   └── db/             SQLite (dev) — see database/postgres_schema.sql for production
├── frontend/           Next.js — marketplace, submit flow, listing + Vault UI
├── contracts/          Escrow.sol (Solidity) + deployment notes
├── database/           Production Postgres schema
└── docs/               Deployment guide
```

## Quick start
See `docs/DEPLOYMENT.md` — two `npm install && npm run dev` commands and
you have the full submit → AI valuation → inventory proof → list → buy →
escrow flow running locally.

## What actually works right now (tested end-to-end)
- Seller submits UID + declared items + screenshots → AI valuation engine
  computes `Base Level Score + Skin Value Score + Rarity Multiplier +
  Rank Bonus + Currency Equivalent + Demand Index`, then floor price at
  0.70–0.85× estimated value — exactly the formula from the spec, with a
  full transparent breakdown.
- Fraud checks run before analysis: duplicate UID detection, reused
  screenshot detection (perceptual hash), UID format validation.
- Seller uploads per-tab inventory proof (screenshot or video) → buyer
  browses it in a game-accurate Vault (Free Fire) / Inventory (PUBG
  Mobile) / Player Collection (eFootball) viewer with the same tab
  structure the real games use.
- Listing enforces the AI floor price and requires at least one inventory
  proof before it can go live.
- Buyer deposits → escrow funds → seller marks transfer complete → buyer
  confirms → 92/8 split releases. A 72-hour auto-release protects sellers
  from a buyer who goes silent; disputes require actual evidence to open.

## Anti-fraud, end to end
Both directions of fraud (a dishonest seller, a dishonest buyer) are
addressed structurally, not just by policy text:

**Protecting buyers from sellers:**
- Funds never reach the seller until the buyer explicitly confirms
- Duplicate-listing and reused-screenshot detection before a listing ever goes live
- AI valuation + floor price stop obvious lowballing/overpricing manipulation
- Disputes freeze the payout and go to admin review

**Protecting sellers from buyers:**
- Once escrowed, a buyer can't just take the account and vanish — the
  72h auto-release sends funds to the seller if the buyer never confirms
  or disputes
- Disputes require uploaded evidence (10+ character reason, at least one
  file) — a bare accusation can't freeze a seller's payout
- The losing side of a resolved dispute takes a visible reputation hit
  (`reputation_events`), so repeat bad-faith actors become identifiable

**Structural limits (be aware of these):**
- No system can *guarantee* zero fraud in a manual-handoff marketplace —
  the account transfer step itself (email/password change) still requires
  trust between two anonymous parties, which is exactly why escrow +
  auto-release + evidence-gated disputes exist as the mitigation, not a
  guarantee.
- Real production hardening still needed: rate-limiting per wallet,
  KYC/soft identity checks for high-value trades, and a human admin
  actually reviewing disputes/fraud logs (the backend exposes the data;
  it doesn't make the judgment call for you).

## No official inventory API exists for these games (checked)
Searched GitHub and each publisher's developer site. Every "Free Fire
API" found is an unofficial, reverse-engineered, fan-run service that
disclaims Garena affiliation — several clearly cross into ToS-violating
territory (guest-account automation, protobuf-reversed client flows).
KRAFTON's official PUBG API covers PC/console match stats only, not PUBG
Mobile and not cosmetics. Konami has no public eFootball API. None of
these are integrated. The manual screenshot/video proof system is the
real, compliant answer today — see `backend/providers/officialProviders.js`
for the extension point if that ever changes.

## Full requirement-by-requirement status
See the table at the bottom of `docs/DEPLOYMENT.md`.
