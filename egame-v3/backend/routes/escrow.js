const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/init');
const { requireAuth } = require('./auth');

const router = express.Router();
const COMMISSION_RATE = 0.08;

/**
 * Step 1 — Buyer sends crypto -> escrow wallet.
 * POST /api/escrow  { listingId, chainTxHash?, escrowId? }
 *
 * Two ways this gets called:
 *  - `escrowId` provided: this is the dev/manual fallback for an escrow
 *    row that POST /api/payments/create-invoice already created (when no
 *    NOWPAYMENTS_API_KEY is configured) — just mark it funded.
 *  - No `escrowId`: standalone simulate-a-deposit path for quick manual
 *    testing without going through the payments flow at all.
 *
 * In a real on-chain deployment, `chainTxHash` is the tx hash from the
 * buyer's WalletConnect session calling Escrow.deposit() (see
 * /contracts/Escrow.sol) instead of a payment processor.
 */
router.post('/', requireAuth, (req, res) => {
  const { listingId, chainTxHash, escrowId } = req.body;

  if (escrowId) {
    const existing = db.prepare('SELECT * FROM escrow_transactions WHERE id = ?').get(escrowId);
    if (!existing) return res.status(404).json({ error: 'Escrow not found' });
    if (existing.status !== 'awaiting_deposit') return res.status(409).json({ error: `Cannot fund from status "${existing.status}"` });

    db.prepare(`UPDATE escrow_transactions SET status = 'funded', chain_tx_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(chainTxHash || null, escrowId);
    db.prepare(`UPDATE listings SET status = 'sold' WHERE id = ?`).run(existing.listing_id);
    return res.json({ escrowId, status: 'funded', amount: existing.amount, commission: existing.commission_amount, sellerPayout: existing.seller_payout });
  }

  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status !== 'active') return res.status(409).json({ error: 'Listing is not active' });

  const amount = listing.asking_price;
  const commission = Math.round(amount * COMMISSION_RATE * 100) / 100;
  const sellerPayout = Math.round((amount - commission) * 100) / 100;

  const id = uuid();
  db.prepare(
    `INSERT INTO escrow_transactions (id, listing_id, buyer_id, seller_id, amount, chain_tx_hash, status, commission_rate, commission_amount, seller_payout)
     VALUES (?, ?, ?, ?, ?, ?, 'funded', ?, ?, ?)`
  ).run(id, listingId, req.user.userId, listing.seller_id, amount, chainTxHash || null, COMMISSION_RATE, commission, sellerPayout);

  db.prepare(`UPDATE listings SET status = 'sold' WHERE id = ?`).run(listingId);

  res.status(201).json({ escrowId: id, status: 'funded', amount, commission, sellerPayout });
});

/** Step 3 — seller marks the manual account transfer (email/password/verification) as done. */
router.post('/:id/transfer-complete', requireAuth, (req, res) => {
  const escrow = db.prepare('SELECT * FROM escrow_transactions WHERE id = ?').get(req.params.id);
  if (!escrow) return res.status(404).json({ error: 'Not found' });
  if (escrow.seller_id !== req.user.userId) return res.status(403).json({ error: 'Not your sale' });
  if (escrow.status !== 'funded') return res.status(409).json({ error: `Cannot transition from status "${escrow.status}"` });

  const hours = parseInt(process.env.AUTO_RELEASE_HOURS || '72', 10);
  db.prepare(
    `UPDATE escrow_transactions SET status = 'transfer_in_progress', auto_release_at = datetime('now', '+' || ? || ' hours'), updated_at = datetime('now') WHERE id = ?`
  ).run(hours, escrow.id);
  res.json({ status: 'transfer_in_progress', autoReleaseInHours: hours, note: 'Buyer must confirm or dispute before this window closes, or funds auto-release to the seller.' });
});

/** Step 4 — buyer confirms receipt/control of the account. */
router.post('/:id/confirm', requireAuth, (req, res) => {
  const escrow = db.prepare('SELECT * FROM escrow_transactions WHERE id = ?').get(req.params.id);
  if (!escrow) return res.status(404).json({ error: 'Not found' });
  if (escrow.buyer_id !== req.user.userId) return res.status(403).json({ error: 'Not your purchase' });
  if (escrow.status !== 'transfer_in_progress') return res.status(409).json({ error: `Cannot confirm from status "${escrow.status}"` });

  db.prepare(`UPDATE escrow_transactions SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?`).run(escrow.id);
  res.json({ status: 'confirmed', message: 'Call /release next to disburse funds.' });
});

/**
 * Step 5 — release funds: 92% seller, 8% platform commission.
 * In production this calls Escrow.release() on-chain; the contract itself
 * enforces the 92/8 split atomically (see contracts/Escrow.sol).
 */
router.post('/:id/release', requireAuth, (req, res) => {
  const escrow = db.prepare('SELECT * FROM escrow_transactions WHERE id = ?').get(req.params.id);
  if (!escrow) return res.status(404).json({ error: 'Not found' });
  if (escrow.status !== 'confirmed') return res.status(409).json({ error: `Cannot release from status "${escrow.status}"` });

  db.prepare(`UPDATE escrow_transactions SET status = 'released', updated_at = datetime('now') WHERE id = ?`).run(escrow.id);
  db.prepare(`INSERT INTO reputation_events (id, user_id, event_type, delta, related_escrow_id) VALUES (?, ?, 'trade_completed', 1, ?)`).run(uuid(), escrow.seller_id, escrow.id);
  db.prepare(`INSERT INTO reputation_events (id, user_id, event_type, delta, related_escrow_id) VALUES (?, ?, 'trade_completed', 1, ?)`).run(uuid(), escrow.buyer_id, escrow.id);
  res.json({
    status: 'released',
    sellerPayout: escrow.seller_payout,
    platformCommission: escrow.commission_amount,
    commissionRate: escrow.commission_rate,
  });
});

/** Raise a dispute at any point after funding. Requires evidence — an
 * unsubstantiated claim from either side shouldn't be able to freeze funds. */
const upload = require('../middleware/upload');
router.post('/:id/dispute', requireAuth, upload.array('evidence', 6), (req, res) => {
  const { reason } = req.body;
  const escrow = db.prepare('SELECT * FROM escrow_transactions WHERE id = ?').get(req.params.id);
  if (!escrow) return res.status(404).json({ error: 'Not found' });
  if (![escrow.buyer_id, escrow.seller_id].includes(req.user.userId)) return res.status(403).json({ error: 'Not a party to this escrow' });
  if (!reason || reason.trim().length < 10) return res.status(400).json({ error: 'A specific reason (10+ characters) is required.' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'At least one evidence file (screenshot/video/chat log) is required to open a dispute.' });

  const evidencePaths = req.files.map(f => f.path);
  db.prepare(`UPDATE escrow_transactions SET status = 'disputed', updated_at = datetime('now') WHERE id = ?`).run(escrow.id);
  db.prepare('INSERT INTO disputes (id, escrow_id, raised_by, reason, evidence_files) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), escrow.id, req.user.userId, reason, JSON.stringify(evidencePaths));
  res.json({ status: 'disputed', evidenceCount: evidencePaths.length });
});

/**
 * Auto-release sweep — in production this is invoked by a scheduled job
 * (cron / queue worker) every few minutes, not by a user request.
 * Protects sellers from buyers who go silent after receiving the account.
 */
router.post('/process-auto-release', (req, res) => {
  const due = db.prepare(
    `SELECT * FROM escrow_transactions WHERE status = 'transfer_in_progress' AND auto_release_at IS NOT NULL AND auto_release_at <= datetime('now')`
  ).all();
  for (const escrow of due) {
    db.prepare(`UPDATE escrow_transactions SET status = 'released', updated_at = datetime('now') WHERE id = ?`).run(escrow.id);
    db.prepare(`INSERT INTO reputation_events (id, user_id, event_type, delta, related_escrow_id) VALUES (?, ?, 'trade_completed', 1, ?)`).run(uuid(), escrow.seller_id, escrow.id);
  }
  res.json({ released: due.length });
});

router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM escrow_transactions WHERE buyer_id = ? OR seller_id = ? ORDER BY created_at DESC`
  ).all(req.user.userId, req.user.userId);
  res.json(rows);
});

module.exports = router;
