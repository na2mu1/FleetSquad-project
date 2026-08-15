const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/init');
const { requireAuth } = require('./auth');
const { getProvider } = require('../providers/registry');

const router = express.Router();

/** Privacy: buyers never see the full UID pre-purchase — only enough to
 * recognize the account, not enough to search/target it directly. */
function maskUid(uid) {
  if (!uid || uid.length < 5) return '•••••';
  return `${uid.slice(0, 3)}${'•'.repeat(Math.max(3, uid.length - 5))}${uid.slice(-2)}`;
}

/**
 * Step 5 — Listing System
 * POST /api/listings
 * Seller accepts the floor price, sets a higher price, or starts an
 * auction, once the account has status = 'analyzed'.
 */
router.post('/', requireAuth, async (req, res) => {
  const { accountId, listType = 'fixed', askingPrice, auctionEndsAt } = req.body;

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (account.seller_id !== req.user.userId) return res.status(403).json({ error: 'Not your account' });
  if (account.status !== 'analyzed') return res.status(409).json({ error: 'Run AI analysis before listing.' });

  const valuation = db.prepare('SELECT * FROM valuations WHERE account_id = ? ORDER BY created_at DESC LIMIT 1').get(accountId);
  if (!valuation) return res.status(409).json({ error: 'No valuation found for this account.' });

  const proofCount = db.prepare('SELECT COUNT(*) AS c FROM inventory_proofs WHERE account_id = ?').get(accountId).c;
  if (proofCount === 0) {
    return res.status(409).json({ error: 'Upload at least one inventory tab proof (screenshot or video) before listing.' });
  }

  // Floor price is informational only — "here's roughly what the AI
  // thinks your account is worth." The seller decides the real price.
  // Only guard against a literal typo (0 or negative).
  const finalAsk = askingPrice !== undefined && askingPrice !== '' ? parseFloat(askingPrice) : valuation.floor_price;
  if (!(finalAsk > 0)) {
    return res.status(400).json({ error: 'Asking price must be greater than 0.' });
  }

  const provider = await getProvider(account.game);

  const id = uuid();
  db.prepare(
    `INSERT INTO listings (id, account_id, seller_id, list_type, ai_verified, floor_price, asking_price, auction_ends_at,
      verification_type, verification_provider, verified_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(id, accountId, req.user.userId, listType, valuation.floor_price, finalAsk, listType === 'auction' ? auctionEndsAt : null,
    provider.verificationType, provider.id);

  db.prepare(`UPDATE accounts SET status = 'listed' WHERE id = ?`).run(accountId);

  res.status(201).json({
    listingId: id,
    status: 'active',
    badge: 'AI VERIFIED VALUE ESTIMATED',
    verification: provider.verificationType,
    floorPrice: valuation.floor_price,
    askingPrice: finalAsk,
    belowFloor: finalAsk < valuation.floor_price,
  });
});

/** Seller edits the asking price on an active fixed-price listing. Floor
 * price is shown for reference only — no minimum is enforced. */
router.patch('/:id/price', requireAuth, (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  if (listing.seller_id !== req.user.userId) return res.status(403).json({ error: 'Not your listing' });
  if (listing.status !== 'active') return res.status(409).json({ error: 'Only active listings can be repriced.' });
  if (listing.list_type !== 'fixed') return res.status(409).json({ error: 'Auction price is driven by bids, not editable directly.' });

  const { askingPrice } = req.body;
  if (!(parseFloat(askingPrice) > 0)) return res.status(400).json({ error: 'Asking price must be greater than 0.' });

  db.prepare('UPDATE listings SET asking_price = ? WHERE id = ?').run(parseFloat(askingPrice), listing.id);
  res.json({ status: 'updated', askingPrice: parseFloat(askingPrice), floorPrice: listing.floor_price, belowFloor: parseFloat(askingPrice) < listing.floor_price });
});

/** Seller cancels a listing that hasn't sold yet. */
router.post('/:id/cancel', requireAuth, (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  if (listing.seller_id !== req.user.userId) return res.status(403).json({ error: 'Not your listing' });
  if (listing.status !== 'active') return res.status(409).json({ error: 'Only active listings can be cancelled.' });

  db.prepare(`UPDATE listings SET status = 'cancelled' WHERE id = ?`).run(listing.id);
  db.prepare(`UPDATE accounts SET status = 'analyzed' WHERE id = ?`).run(listing.account_id);
  res.json({ status: 'cancelled' });
});

/** Seller's own listings, across all statuses — powers the seller dashboard. */
router.get('/mine/all', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, a.game, a.uid, a.level, a.rank
    FROM listings l JOIN accounts a ON a.id = l.account_id
    WHERE l.seller_id = ? ORDER BY l.created_at DESC
  `).all(req.user.userId);
  res.json(rows);
});

/**
 * Buyer browse + filter
 * GET /api/listings?game=free_fire&minPrice=&maxPrice=&rank=&listType=
 */
router.get('/', (req, res) => {
  const { game, minPrice, maxPrice, rank, listType } = req.query;

  let sql = `
    SELECT l.*, a.game, a.uid, a.level, a.rank, a.currency_amount, a.pass_status, u.display_name AS seller_name
    FROM listings l
    JOIN accounts a ON a.id = l.account_id
    JOIN users u ON u.id = l.seller_id
    WHERE l.status = 'active'
  `;
  const params = [];
  if (game) { sql += ' AND a.game = ?'; params.push(game); }
  if (rank) { sql += ' AND a.rank = ?'; params.push(rank); }
  if (listType) { sql += ' AND l.list_type = ?'; params.push(listType); }
  if (minPrice) { sql += ' AND l.asking_price >= ?'; params.push(parseFloat(minPrice)); }
  if (maxPrice) { sql += ' AND l.asking_price <= ?'; params.push(parseFloat(maxPrice)); }
  sql += ' ORDER BY l.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => ({ ...r, uid: maskUid(r.uid), pass_status: r.pass_status ? JSON.parse(r.pass_status) : null })));
});

router.get('/:id', (req, res) => {
  const listing = db.prepare(`
    SELECT l.*, a.game, a.uid, a.level, a.rank, a.currency_amount, a.pass_status
    FROM listings l JOIN accounts a ON a.id = l.account_id WHERE l.id = ?
  `).get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const valuation = db.prepare('SELECT * FROM valuations WHERE account_id = ? ORDER BY created_at DESC LIMIT 1').get(listing.account_id);
  const screenshots = db.prepare('SELECT id, category, file_path, ai_detections FROM screenshots WHERE account_id = ?').all(listing.account_id);
  const bids = db.prepare('SELECT * FROM bids WHERE listing_id = ? ORDER BY amount DESC').all(listing.id);

  res.json({
    ...listing,
    uid: maskUid(listing.uid),
    pass_status: listing.pass_status ? JSON.parse(listing.pass_status) : null,
    valuation: valuation ? { ...valuation, breakdown: JSON.parse(valuation.breakdown) } : null,
    screenshots: screenshots.map(s => ({ ...s, ai_detections: JSON.parse(s.ai_detections || '[]') })),
    bids,
  });
});

/** POST /api/listings/:id/bid — auction bidding */
router.post('/:id/bid', requireAuth, (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  if (listing.list_type !== 'auction') return res.status(400).json({ error: 'This listing is not an auction.' });
  if (listing.status !== 'active') return res.status(409).json({ error: 'Auction is not active.' });

  const { amount } = req.body;
  const topBid = db.prepare('SELECT MAX(amount) AS top FROM bids WHERE listing_id = ?').get(listing.id);
  const currentTop = topBid.top || listing.floor_price;
  if (parseFloat(amount) <= currentTop) {
    return res.status(400).json({ error: `Bid must exceed the current top bid of $${currentTop.toFixed(2)}.` });
  }

  db.prepare('INSERT INTO bids (id, listing_id, buyer_id, amount) VALUES (?, ?, ?, ?)').run(uuid(), listing.id, req.user.userId, amount);
  res.status(201).json({ message: 'Bid placed', amount });
});

module.exports = router;
