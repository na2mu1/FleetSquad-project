const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../db/init');
const upload = require('../middleware/upload');
const { requireAuth } = require('./auth');
const { getProvider, TABS } = require('../providers/registry');
const { checkScreenshotAuthenticity } = require('../ai/fraudDetection');

const router = express.Router({ mergeParams: true });
const VALID_TABS = ['characters', 'weapons', 'fashion', 'emotes', 'vehicles', 'collection', 'others'];

function assertOwnership(req, res, account) {
  if (!account) { res.status(404).json({ error: 'Account not found' }); return false; }
  if (account.seller_id !== req.user.userId) { res.status(403).json({ error: 'Not your account' }); return false; }
  return true;
}

/**
 * Seller declares one inventory item under a tab, e.g.
 * { tab: 'weapons', subcategory: 'gun_skin', name: 'AN94 - Panther Blessing', rarity: 'legendary' }
 * This is the ground truth the buyer sees next to the proof media.
 */
router.post('/:accountId/inventory/items', requireAuth, (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.accountId);
  if (!assertOwnership(req, res, account)) return;

  const { tab, subcategory, name, rarity } = req.body;
  if (!VALID_TABS.includes(tab)) return res.status(400).json({ error: `tab must be one of ${VALID_TABS.join(', ')}` });
  if (!subcategory || !name) return res.status(400).json({ error: 'subcategory and name are required' });

  const id = uuid();
  db.prepare(
    `INSERT INTO inventory_items (id, account_id, tab, subcategory, name, rarity, source) VALUES (?, ?, ?, ?, ?, ?, 'manual')`
  ).run(id, account.id, tab, subcategory, name, rarity || null);

  res.status(201).json({ id });
});

/**
 * Seller uploads a screenshot or short video as proof for one tab
 * (e.g. a Vault "Weapons" tab screenshot, or a screen recording panning
 * across the Fashion tab). Buyers browse these in the same tab layout.
 */
router.post('/:accountId/inventory/proof', requireAuth, upload.single('media'), (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.accountId);
  if (!assertOwnership(req, res, account)) return;
  if (!req.file) return res.status(400).json({ error: 'media file is required' });

  const { tab, capturedAt } = req.body;
  if (!VALID_TABS.includes(tab)) return res.status(400).json({ error: `tab must be one of ${VALID_TABS.join(', ')}` });

  const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  const buffer = fs.readFileSync(req.file.path);
  const hash = crypto.createHash('md5').update(buffer).digest('hex');

  const authCheck = checkScreenshotAuthenticity(db, { accountId: account.id, perceptualHash: hash });
  if (authCheck.flagged) {
    db.prepare(`UPDATE accounts SET fraud_flag = 1 WHERE id = ?`).run(account.id);
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO inventory_proofs (id, account_id, tab, media_type, file_path, perceptual_hash, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, account.id, tab, mediaType, req.file.path, hash, capturedAt || new Date().toISOString());

  res.status(201).json({ id, mediaType, flaggedForReview: authCheck.flagged });
});

/**
 * Buyer-facing vault view — routed through the provider registry so it
 * transparently returns official-API data if/when that ever becomes
 * available, or the manual upload set today, without the caller caring
 * which one it got.
 */
router.get('/:accountId/inventory', async (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const provider = await getProvider(account.game);
  try {
    const data = await provider.fetchInventory({ accountId: account.id, game: account.game, uid: account.uid });
    res.json({
      game: account.game,
      verification: {
        type: provider.verificationType,
        provider: provider.id,
        label: provider.label,
      },
      ...data,
    });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

module.exports = router;
