const express = require('express');
const { v4: uuid } = require('uuid');
const path = require('path');
const db = require('../db/init');
const { requireAuth, requireAdmin } = require('./auth');
const upload = require('../middleware/upload');
const router = express.Router();

function getSetting(key, fb='0') { try { return db.prepare('SELECT value FROM platform_settings WHERE key=?').get(key)?.value || fb; } catch { return fb; } }
function getWallet(userId) {
  let w = db.prepare('SELECT * FROM wallet_balances WHERE user_id=?').get(userId);
  if (!w) { db.prepare('INSERT INTO wallet_balances (user_id,balance) VALUES (?,0)').run(userId); w = { user_id:userId, balance:0 }; }
  return w;
}
function creditWallet(userId, usd) {
  getWallet(userId);
  db.prepare(`UPDATE wallet_balances SET balance=balance+?, updated_at=datetime('now') WHERE user_id=?`).run(usd, userId);
}
function debitWallet(userId, usd) {
  const w = getWallet(userId);
  if (w.balance < usd) throw new Error(`Balance কম! আপনার $${w.balance.toFixed(2)} আছে`);
  db.prepare(`UPDATE wallet_balances SET balance=balance-?, updated_at=datetime('now') WHERE user_id=?`).run(usd, userId);
}

// ── Public: get random payment account ──────────────────────────────────────
router.get('/random-account/:provider', (req, res) => {
  const acc = db.prepare('SELECT * FROM payment_accounts WHERE provider=? AND is_active=1 ORDER BY RANDOM() LIMIT 1').get(req.params.provider);
  if (!acc) return res.status(404).json({ error: `কোনো ${req.params.provider} account পাওয়া যায়নি। Admin-কে জানান।` });
  res.json({ number: acc.number, holder_name: acc.holder_name });
});

// ── Auth: deposit ─────────────────────────────────────────────────────────────
router.post('/deposit', requireAuth, upload.single('screenshot'), (req, res) => {
  const { provider, toNumber, amountBDT, trxId, senderNumber } = req.body;
  if (!provider || !amountBDT || !trxId) return res.status(400).json({ error: 'provider, amountBDT, trxId required' });
  const rate = parseFloat(getSetting('bdt_to_usd_rate','110'));
  const amountUSD = parseFloat(amountBDT) / rate;
  const minBDT = parseFloat(getSetting('min_deposit_bdt','100'));
  if (parseFloat(amountBDT) < minBDT) return res.status(400).json({ error: `সর্বনিম্ন ৳${minBDT} deposit করুন` });
  const id = uuid();
  const screenshotPath = req.file ? req.file.path : null;
  db.prepare('INSERT INTO manual_deposits (id,user_id,provider,to_number,amount_bdt,amount_usd,trx_id,sender_number,screenshot_path) VALUES (?,?,?,?,?,?,?,?,?)').run(id, req.user.userId, provider, toNumber, parseFloat(amountBDT), amountUSD, trxId.trim(), senderNumber||null, screenshotPath);
  res.json({ id, status: 'pending', message: 'Deposit request জমা হয়েছে। Admin verify করলে credit হবে।' });
});

router.get('/my-deposits', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM manual_deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.userId));
});

// ── Auth: withdraw ─────────────────────────────────────────────────────────────
router.post('/withdraw', requireAuth, (req, res) => {
  const { provider, toNumber, holderName, amountUSD } = req.body;
  if (!provider || !toNumber || !amountUSD) return res.status(400).json({ error: 'provider, toNumber, amountUSD required' });
  const rate = parseFloat(getSetting('bdt_to_usd_rate','110'));
  const amountBDT = Math.round(parseFloat(amountUSD) * rate);
  const minBDT = parseFloat(getSetting('min_withdraw_bdt','200'));
  if (amountBDT < minBDT) return res.status(400).json({ error: `সর্বনিম্ন ৳${minBDT} withdraw করুন` });
  try {
    debitWallet(req.user.userId, parseFloat(amountUSD));
  } catch (e) { return res.status(402).json({ error: e.message }); }
  const id = uuid();
  db.prepare('INSERT INTO manual_withdrawals (id,user_id,provider,to_number,holder_name,amount_usd,amount_bdt) VALUES (?,?,?,?,?,?,?)').run(id, req.user.userId, provider, toNumber, holderName||null, parseFloat(amountUSD), amountBDT);
  res.json({ id, status: 'pending', amountBDT });
});

router.get('/my-withdrawals', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM manual_withdrawals WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.userId));
});

router.get('/balance', requireAuth, (req, res) => {
  const w = getWallet(req.user.userId);
  const rate = parseFloat(getSetting('bdt_to_usd_rate','110'));
  res.json({ balance: w.balance, balanceBdt: Math.round(w.balance * rate) });
});

// ── Admin: payment accounts ───────────────────────────────────────────────────
router.get('/accounts', requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM payment_accounts ORDER BY provider,created_at DESC').all());
});
router.post('/accounts', requireAuth, requireAdmin, (req, res) => {
  const { provider, number, holderName } = req.body;
  if (!provider || !number) return res.status(400).json({ error: 'provider and number required' });
  const id = uuid();
  db.prepare('INSERT INTO payment_accounts (id,provider,number,holder_name,is_active) VALUES (?,?,?,?,1)').run(id, provider, number.trim(), holderName||null);
  res.status(201).json({ id });
});
router.patch('/accounts/:id', requireAuth, requireAdmin, (req, res) => {
  const { isActive } = req.body;
  db.prepare('UPDATE payment_accounts SET is_active=? WHERE id=?').run(isActive?1:0, req.params.id);
  res.json({ ok: true });
});
router.delete('/accounts/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM payment_accounts WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Admin: deposits ───────────────────────────────────────────────────────────
router.get('/deposits/all', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT d.*,u.display_name FROM manual_deposits d JOIN users u ON u.id=d.user_id';
  if (status) sql += ` WHERE d.status='${status.replace(/'/g,"''")}'`;
  sql += ' ORDER BY d.created_at DESC LIMIT 100';
  res.json(db.prepare(sql).all());
});
router.post('/deposits/:id/approve', requireAuth, requireAdmin, (req, res) => {
  const dep = db.prepare('SELECT * FROM manual_deposits WHERE id=?').get(req.params.id);
  if (!dep) return res.status(404).json({ error: 'Not found' });
  if (dep.status !== 'pending') return res.status(409).json({ error: 'Already processed' });
  db.prepare(`UPDATE manual_deposits SET status='approved',reviewed_by=?,reviewed_at=datetime('now'),admin_note=? WHERE id=?`).run(req.user.userId, req.body.note||null, req.params.id);
  creditWallet(dep.user_id, dep.amount_usd);
  const w = getWallet(dep.user_id);
  const rate = parseFloat(getSetting('bdt_to_usd_rate','110'));
  res.json({ ok: true, credited: dep.amount_usd, amountBdt: dep.amount_bdt, newBalance: w.balance, newBalanceBdt: Math.round(w.balance*rate) });
});
router.post('/deposits/:id/reject', requireAuth, requireAdmin, (req, res) => {
  const dep = db.prepare('SELECT * FROM manual_deposits WHERE id=?').get(req.params.id);
  if (!dep) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE manual_deposits SET status='rejected',reviewed_by=?,reviewed_at=datetime('now'),admin_note=? WHERE id=?`).run(req.user.userId, req.body.note||'', req.params.id);
  res.json({ ok: true });
});

// ── Admin: withdrawals ────────────────────────────────────────────────────────
router.get('/withdrawals/all', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT w.*,u.display_name FROM manual_withdrawals w JOIN users u ON u.id=w.user_id';
  if (status) sql += ` WHERE w.status='${status.replace(/'/g,"''")}'`;
  sql += ' ORDER BY w.created_at DESC LIMIT 100';
  res.json(db.prepare(sql).all());
});
router.post('/withdrawals/:id/approve', requireAuth, requireAdmin, (req, res) => {
  const w = db.prepare('SELECT * FROM manual_withdrawals WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  const { trxId, note } = req.body;
  if (!trxId) return res.status(400).json({ error: 'trxId required' });
  db.prepare(`UPDATE manual_withdrawals SET status='completed',trx_id=?,admin_note=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?`).run(trxId, note||null, req.user.userId, req.params.id);
  res.json({ ok: true });
});
router.post('/withdrawals/:id/reject', requireAuth, requireAdmin, (req, res) => {
  const w = db.prepare('SELECT * FROM manual_withdrawals WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE manual_withdrawals SET status='rejected',admin_note=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?`).run(req.body.note||'', req.user.userId, req.params.id);
  creditWallet(w.user_id, w.amount_usd);
  const rate = parseFloat(getSetting('bdt_to_usd_rate','110'));
  res.json({ ok: true, refundedBdt: Math.round(w.amount_usd*rate) });
});

module.exports = { router, creditWallet, debitWallet, getWallet, getSetting };
