const express = require('express');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const db = require('../db/init');
const upload = require('../middleware/upload');
const { requireAuth } = require('./auth');
const { analyzeScreenshot } = require('../ai/imageAnalysis');
const { computeValuation } = require('../ai/valuationEngine');
const { checkDuplicateListing, checkScreenshotAuthenticity, validateUidFormat } = require('../ai/fraudDetection');

const router = express.Router();
const VALID_GAMES = ['free_fire', 'pubg_mobile', 'efootball'];

/**
 * Step 1 — Account Submission
 * POST /api/accounts
 * multipart/form-data: game, uid, loginBinding?, level, rank?, currencyAmount?,
 *   declaredItems (JSON string array), screenshots[] with a matching
 *   screenshotCategories[] array (inventory|rank|rare_item|currency)
 */
router.post('/', requireAuth, upload.array('screenshots', 12), (req, res) => {
  const { game, uid, loginBinding, level, rank, currencyAmount, declaredItems, passStatus } = req.body;

  if (!VALID_GAMES.includes(game)) return res.status(400).json({ error: 'Unsupported game' });
  if (!uid) return res.status(400).json({ error: 'UID is required' });

  const uidCheck = validateUidFormat(game, uid);
  if (!uidCheck.valid) return res.status(400).json({ error: uidCheck.reason });

  const categories = Array.isArray(req.body.screenshotCategories)
    ? req.body.screenshotCategories
    : [req.body.screenshotCategories].filter(Boolean);

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'At least one screenshot is required (inventory, rank, or currency).' });
  }

  const accountId = uuid();
  db.prepare(
    `INSERT INTO accounts (id, seller_id, game, uid, login_binding, level, rank, currency_amount, pass_status, declared_items, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_analysis')`
  ).run(
    accountId,
    req.user.userId,
    game,
    uid,
    loginBinding || null,
    parseInt(level) || 0,
    rank || null,
    parseInt(currencyAmount) || 0,
    passStatus || null,
    declaredItems || '[]'
  );

  // Security System — run before analysis so a flagged account never
  // reaches a public listing.
  const dupCheck = checkDuplicateListing(db, { game, uid, accountId });
  if (dupCheck.flagged) {
    db.prepare(`UPDATE accounts SET status = 'rejected', fraud_flag = 1 WHERE id = ?`).run(accountId);
    return res.status(409).json({ error: dupCheck.reason, accountId, status: 'rejected' });
  }

  req.files.forEach((file, i) => {
    const category = categories[i] || 'inventory';
    const buffer = fs.readFileSync(file.path);
    const authCheck = checkScreenshotAuthenticity(db, {
      accountId,
      perceptualHash: require('crypto').createHash('md5').update(buffer).digest('hex'),
    });
    db.prepare(
      `INSERT INTO screenshots (id, account_id, category, file_path, perceptual_hash) VALUES (?, ?, ?, ?, ?)`
    ).run(uuid(), accountId, category, file.path, require('crypto').createHash('md5').update(buffer).digest('hex'));
    if (authCheck.flagged) {
      db.prepare(`UPDATE accounts SET fraud_flag = 1 WHERE id = ?`).run(accountId);
    }
  });

  res.status(201).json({ accountId, status: 'pending_analysis', message: 'Submitted. Call /api/accounts/:id/analyze to run the AI valuation.' });
});

/**
 * Step 2 & 3 — AI Analysis Engine + Pricing Algorithm
 * POST /api/accounts/:id/analyze
 */
router.post('/:id/analyze', requireAuth, async (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (account.seller_id !== req.user.userId) return res.status(403).json({ error: 'Not your submission' });
  if (account.fraud_flag) return res.status(409).json({ error: 'This submission was flagged by fraud detection and cannot be analyzed.' });

  const screenshots = db.prepare('SELECT * FROM screenshots WHERE account_id = ?').all(account.id);
  const declaredItems = JSON.parse(account.declared_items || '[]');

  let allDetections = [];
  for (const shot of screenshots) {
    const buffer = fs.readFileSync(shot.file_path);
    const { detections } = await analyzeScreenshot({
      buffer,
      filename: shot.file_path,
      category: shot.category,
      declaredItems: shot.category === 'inventory' || shot.category === 'rare_item' ? declaredItems : [],
    });
    db.prepare('UPDATE screenshots SET ai_detections = ? WHERE id = ?').run(JSON.stringify(detections), shot.id);
    allDetections = allDetections.concat(detections);
  }

  const result = computeValuation({
    accountId: account.id,
    game: account.game,
    level: account.level,
    declaredCurrencyAmount: account.currency_amount,
    detections: allDetections,
  });

  const valuationId = uuid();
  db.prepare(
    `INSERT INTO valuations (id, account_id, base_level_score, skin_value_score, rarity_multiplier, rank_bonus,
      currency_equiv_value, demand_index, estimated_value, floor_price, breakdown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    valuationId,
    account.id,
    result.breakdown.baseLevelScore,
    result.breakdown.skinValueScore,
    result.breakdown.rarityMultiplierBonus,
    result.breakdown.rankBonus,
    result.breakdown.currencyEquivalent,
    result.breakdown.demandIndex,
    result.estimatedValue,
    result.floorPrice,
    JSON.stringify(result.breakdown)
  );

  db.prepare(`UPDATE accounts SET status = 'analyzed' WHERE id = ?`).run(account.id);

  res.json({ accountId: account.id, valuationId, ...result });
});

router.get('/:id', requireAuth, (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Not found' });
  const screenshots = db.prepare('SELECT * FROM screenshots WHERE account_id = ?').all(account.id);
  const valuation = db.prepare('SELECT * FROM valuations WHERE account_id = ? ORDER BY created_at DESC LIMIT 1').get(account.id);
  res.json({ ...account, screenshots, valuation: valuation ? { ...valuation, breakdown: JSON.parse(valuation.breakdown) } : null });
});

router.get('/', requireAuth, (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE seller_id = ? ORDER BY created_at DESC').all(req.user.userId);
  res.json(accounts);
});

module.exports = router;
