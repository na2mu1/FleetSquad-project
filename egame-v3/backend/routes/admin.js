const express = require('express');
const db = require('../db/init');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/disputes', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, e.amount, e.listing_id, e.buyer_id, e.seller_id
    FROM disputes d JOIN escrow_transactions e ON e.id = d.escrow_id
    ORDER BY d.created_at DESC
  `).all();
  res.json(rows.map(r => ({ ...r, evidence_files: JSON.parse(r.evidence_files || '[]') })));
});

const { v4: uuid } = require('uuid');
router.post('/disputes/:id/resolve', (req, res) => {
  const { resolution, note } = req.body; // resolution: 'resolved_buyer' | 'resolved_seller'
  if (!['resolved_buyer', 'resolved_seller'].includes(resolution)) {
    return res.status(400).json({ error: 'resolution must be resolved_buyer or resolved_seller' });
  }
  db.prepare('UPDATE disputes SET status = ?, resolution_note = ? WHERE id = ?').run(resolution, note || null, req.params.id);
  const dispute = db.prepare('SELECT * FROM disputes WHERE id = ?').get(req.params.id);
  const escrow = db.prepare('SELECT * FROM escrow_transactions WHERE id = ?').get(dispute.escrow_id);
  const finalEscrowStatus = resolution === 'resolved_buyer' ? 'refunded' : 'released';
  db.prepare(`UPDATE escrow_transactions SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(finalEscrowStatus, dispute.escrow_id);

  // Whoever's claim did NOT hold up takes a reputation hit, so repeated
  // bad-faith disputes or bad-faith sales become visible over time.
  const loserId = resolution === 'resolved_buyer' ? escrow.seller_id : escrow.buyer_id;
  db.prepare(`INSERT INTO reputation_events (id, user_id, event_type, delta, related_escrow_id) VALUES (?, ?, 'dispute_lost', -5, ?)`).run(uuid(), loserId, escrow.id);

  res.json({ status: 'resolved', finalEscrowStatus });
});

router.get('/fraud-logs', (req, res) => {
  res.json(db.prepare('SELECT * FROM fraud_logs ORDER BY created_at DESC').all());
});

module.exports = router;
