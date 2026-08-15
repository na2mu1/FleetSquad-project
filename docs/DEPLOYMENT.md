# Deployment Guide

## 1. Local development (fastest path to a working demo)

### Backend
```bash
cd backend
cp .env.example .env      # edit JWT_SECRET; leave ANTHROPIC_API_KEY blank for heuristic mode
npm install
npm run dev               # http://localhost:4000, SQLite file auto-created
```
Requires **Node.js 22.5+** (uses the built-in `node:sqlite` module — no
native compilation, no separate database server needed for local dev).

### Frontend
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_BASE=http://localhost:4000" > .env.local
npm run dev                # http://localhost:3000
```

Try it: go to `/submit-account`, connect any `0x...` string as a wallet
(dev mode skips real signature verification — see the TODO in
`backend/routes/auth.js`), submit an account, watch the AI valuation run,
upload a screenshot per inventory tab, list it, then open `/` to see it in
the marketplace and `/listing/:id` to see the Vault viewer + buy flow.

## 2. Moving to production

### Database
Swap SQLite for the provided Postgres schema:
```bash
createdb egame_marketplace
psql egame_marketplace < database/postgres_schema.sql
```
Then replace `backend/db/init.js` with a `pg` (or Prisma/Drizzle) client.
The query shapes in the routes are plain SQL and translate directly —
only the connection layer changes.

### File storage
Screenshots/videos currently land on local disk (`backend/uploads`).
Before production, point `middleware/upload.js` at S3/R2/Cloud Storage
instead (multer has drop-in S3 storage engines) — local disk doesn't
survive a redeploy or scale past one instance.

### Backend hosting
Any Node host works (Railway, Render, Fly.io, a plain VPS behind nginx).
Put it behind HTTPS and set real environment variables:
- `JWT_SECRET` — long random string
- `ANTHROPIC_API_KEY` — enables real vision-based screenshot analysis
  instead of the heuristic fallback (see `backend/ai/imageAnalysis.js`)
- `AUTO_RELEASE_HOURS` — escrow auto-release window (default 72)
- `FREE_FIRE_API_ENABLED` / `PUBG_MOBILE_API_ENABLED` / `EFOOTBALL_API_ENABLED`
  — flip to `true` only once you've implemented a real, ToS-compliant
  provider in `backend/providers/officialProviders.js`

Also wire up a scheduled job (cron / queue) that calls
`POST /api/escrow/process-auto-release` every few minutes — right now
that route only fires when something happens to hit it.

### Frontend hosting
Vercel is the path of least resistance for Next.js; any Node host works
too (`npm run build && npm run start`). Set `NEXT_PUBLIC_API_BASE` to
your deployed backend URL.

### Wallet / crypto payments
This MVP simulates escrow entirely in the backend DB so the full seller
→ buyer → dispute flow is testable today without touching a chain. To go
live with real USDT:
1. Deploy `contracts/Escrow.sol` (read `contracts/README.md` first — audit
   required, and decide EVM vs. TVM/Tron for real USDT-TRC20 support).
2. Add WalletConnect (`@walletconnect/web3-provider` or `wagmi` +
   `@web3modal/wagmi`) to the frontend buy button so it calls
   `Escrow.deposit()` directly instead of `POST /api/escrow`.
3. Pass the resulting transaction hash into `POST /api/escrow` as
   `chainTxHash` so the backend keeps mirroring state for the dashboards.
4. Add a small chain indexer that listens for `Released` / `Disputed` /
   `AutoReleased` contract events and updates `escrow_transactions`
   accordingly — don't rely solely on users' browsers to report outcomes.

## 3. What's stubbed vs. real today

| Piece | Status |
|---|---|
| AI valuation formula (level/skin/rarity/rank/currency/demand) | **Real**, fully implemented, matches the spec's formula |
| Image "recognition" | Heuristic (deterministic, offline) by default; real Claude-vision path included, gated behind `ANTHROPIC_API_KEY` |
| Fraud detection (duplicate UID, reused screenshots, UID format) | **Real**, runs on every submission |
| Escrow lifecycle + 92/8 split + auto-release + disputes | **Real** in the backend DB; on-chain contract provided but not deployed |
| Official Free Fire / PUBG Mobile / eFootball inventory APIs | **None exist** (verified via search) — manual screenshot/video proof is the real system, not a placeholder |
| WalletConnect / real signature verification | Stubbed — `auth.js` trusts the address as given; see inline TODO |
| Admin dashboard | Disputes + fraud logs endpoints built; no admin UI page yet |
| Buyer/seller dashboards (beyond submit + listing + marketplace pages) | Not yet built |
