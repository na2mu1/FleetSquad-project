const express = require('express');
const db = require('../db/init');
const { requireAuth, requireAdmin } = require('./auth');
const router = express.Router();

function getSetting(key, fallback = null) {
  try { const r = db.prepare('SELECT value FROM platform_settings WHERE key=?').get(key); return r ? r.value : fallback; } catch { return fallback; }
}
function getAll() {
  try { const rows = db.prepare('SELECT * FROM platform_settings').all(); const o = {}; rows.forEach(r => o[r.key] = r.value); return o; } catch { return {}; }
}

router.get('/public', (req, res) => {
  const r = parseFloat(getSetting('bdt_to_usd_rate', '110'));
  res.json({
    bdtToUsd: 1/r, usdToBdt: r, siteName: getSetting('site_name','eGame Marketplace'),
    siteCurrency: 'BDT', minDepositBdt: parseFloat(getSetting('min_deposit_bdt','100')),
    minWithdrawBdt: parseFloat(getSetting('min_withdraw_bdt','200')),
    listingCommissionPct: parseFloat(getSetting('listing_commission_pct','8')),
    tournamentPlatformPct: parseFloat(getSetting('tournament_platform_pct','12')),
    tournamentCreatorPct: parseFloat(getSetting('tournament_creator_pct','3')),
    tournamentWinnerPct: parseFloat(getSetting('tournament_winner_pct','85')),
  });
});
router.get('/', requireAuth, requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM platform_settings ORDER BY key').all()));
router.patch('/', requireAuth, requireAdmin, (req, res) => {
  const updates = req.body; const changed = [];
  for (const [key, value] of Object.entries(updates)) {
    const ex = db.prepare('SELECT key FROM platform_settings WHERE key=?').get(key);
    if (ex) { db.prepare(`UPDATE platform_settings SET value=?, updated_at=datetime('now') WHERE key=?`).run(String(value), key); changed.push(key); }
  }
  res.json({ updated: changed, settings: getAll() });
});
module.exports = { router, getSetting, getAll };
