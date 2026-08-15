/**
 * Deposit routes — unified entry point for MFS and Crypto deposits.
 *
 * POST /api/deposit/mfs          — initiate bKash/Nagad/Rocket/Upay payment
 * POST /api/deposit/crypto       — create a crypto invoice (NOWPayments)
 * POST /api/deposit/mfs/callback — MFS payment gateway callback (from provider)
 * POST /api/deposit/crypto/webhook — NOWPayments IPN webhook
 * GET  /api/deposit/simulate/complete — dev-only: auto-complete a simulated deposit
 * GET  /api/deposit/history      — caller's deposit history
 * GET  /api/deposit/balance      — caller's internal wallet balance
 */
const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/init');
const { requireAuth } = require('./auth');
const MFS = require('../payments/MFSProvider');
const Crypto = require('../payments/CryptoProvider');

const router = express.Router();

/* ── helpers ─────────────────────────────────────────────────────────── */
function getOrCreateWallet(userId) {
  const w = db.prepare('SELECT * FROM wallet_balances WHERE user_id=?').get(userId);
  if (!w) { db.prepare('INSERT INTO wallet_balances (user_id,balance) VALUES (?,0)').run(userId); }
  return db.prepare('SELECT * FROM wallet_balances WHERE user_id=?').get(userId);
}

function creditWallet(userId, amountUSD) {
  getOrCreateWallet(userId);
  db.prepare("UPDATE wallet_balances SET balance=balance+?, updated_at=datetime('now') WHERE user_id=?").run(amountUSD, userId);
}

function completeDeposit(depositId, providerRef, amountUSD, providerPayload) {
  const dep = db.prepare('SELECT * FROM deposits WHERE id=?').get(depositId);
  if (!dep || dep.status === 'completed') return;
  db.prepare("UPDATE deposits SET status='completed',provider_ref=?,provider_payload=?,completed_at=datetime('now') WHERE id=?")
    .run(providerRef, JSON.stringify(providerPayload), depositId);
  creditWallet(dep.user_id, amountUSD);
}

/* ── GET /balance ──────────────────────────────────────────────────────── */
router.get('/balance', requireAuth, (req, res) => {
  const w = getOrCreateWallet(req.user.userId);
  res.json({ balance: w.balance, currency: 'USD' });
});

/* ── GET /history ──────────────────────────────────────────────────────── */
router.get('/history', requireAuth, (req, res) => {
  const deps = db.prepare('SELECT * FROM deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.userId);
  res.json(deps);
});

/* ── GET /channels ─────────────────────────────────────────────────────── */
router.get('/channels', (req, res) => {
  res.json({
    mfs: Object.entries(MFS.PROVIDERS).map(([key, p]) => ({ key, ...p })),
    crypto: Crypto.SUPPORTED_COINS,
    bdtToUsd: MFS.BDT_TO_USD,
  });
});

/* ── POST /mfs ─────────────────────────────────────────────────────────── */
router.post('/mfs', requireAuth, async (req, res) => {
  const { channel, amountBDT } = req.body;
  if (!channel || !amountBDT) return res.status(400).json({ error: 'channel and amountBDT required' });

  const depositId = uuid();
  const amountUSD = Math.round(parseFloat(amountBDT) * MFS.BDT_TO_USD * 100) / 100;

  db.prepare('INSERT INTO deposits (id,user_id,channel,amount_local,amount_usd,currency,status) VALUES (?,?,?,?,?,?,?)')
    .run(depositId, req.user.userId, channel, parseFloat(amountBDT), amountUSD, 'BDT', 'pending');

  try {
    const result = await MFS.initiatePayment({
      channel, amountBDT: parseFloat(amountBDT), userId: req.user.userId,
      depositId, callbackUrl: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/deposit/mfs/callback`,
    });
    db.prepare('UPDATE deposits SET provider_ref=? WHERE id=?').run(result.providerRef, depositId);
    res.json({ depositId, ...result });
  } catch (e) {
    db.prepare('UPDATE deposits SET status="failed" WHERE id=?').run(depositId);
    res.status(502).json({ error: e.message });
  }
});

/* ── POST /mfs/callback — MFS provider redirects/POSTs here ─────────────── */
router.post('/mfs/callback', (req, res) => {
  const channel = req.query.channel || req.body.channel || 'bkash';
  const result = MFS.verifyCallback({ channel, body: req.body, query: req.query });
  if (!result.valid) return res.status(400).json({ error: 'Invalid callback' });
  if (result.depositId) completeDeposit(result.depositId, result.providerRef || 'MFS-CB', result.amountUSD, req.body);
  res.json({ ok: true });
});

/* ── GET /mfs/callback — bKash redirects here with query params ─────────── */
router.get('/mfs/callback', (req, res) => {
  const result = MFS.verifyCallback({ channel: req.query.channel || 'bkash', body: {}, query: req.query });
  if (result.depositId && result.valid) completeDeposit(result.depositId, req.query.paymentID || 'MFS-GET', result.amountUSD, req.query);
  // Redirect to frontend success page
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendUrl}/payment/success?depositId=${result.depositId || ''}`);
});

/* ── POST /crypto ──────────────────────────────────────────────────────── */
router.post('/crypto', requireAuth, async (req, res) => {
  const { amountUSD, currency = 'USDT' } = req.body;
  if (!amountUSD || amountUSD < 1) return res.status(400).json({ error: 'amountUSD must be >= 1' });

  const depositId = uuid();
  db.prepare('INSERT INTO deposits (id,user_id,channel,amount_local,amount_usd,currency,status) VALUES (?,?,?,?,?,?,?)')
    .run(depositId, req.user.userId, 'crypto', parseFloat(amountUSD), parseFloat(amountUSD), currency, 'pending');

  try {
    const result = await Crypto.createInvoice({
      amountUSD: parseFloat(amountUSD), currency, depositId,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?depositId=${depositId}`,
      cancelUrl:  `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancelled`,
    });
    db.prepare('UPDATE deposits SET provider_ref=? WHERE id=?').run(result.paymentId, depositId);
    res.json({ depositId, ...result });
  } catch (e) {
    db.prepare('UPDATE deposits SET status="failed" WHERE id=?').run(depositId);
    res.status(502).json({ error: e.message });
  }
});

/* ── POST /crypto/webhook — NOWPayments IPN ─────────────────────────────── */
router.post('/crypto/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-nowpayments-sig'] || '';
  const raw = req.body.toString();
  if (!Crypto.verifyWebhook(raw, sig)) return res.status(401).json({ error: 'Bad signature' });

  const parsed = Crypto.parseWebhook(JSON.parse(raw));
  if (parsed.status === 'completed' && parsed.depositId) {
    completeDeposit(parsed.depositId, parsed.providerRef, parsed.amountUSD, JSON.parse(raw));
  } else if (parsed.status === 'failed' && parsed.depositId) {
    db.prepare('UPDATE deposits SET status="failed" WHERE id=?').run(parsed.depositId);
  }
  res.json({ ok: true });
});

/* ── GET /simulate/complete — DEV ONLY: simulate successful payment ──────── */
router.get('/simulate/complete', requireAuth, (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Not in production' });
  const { depositId } = req.query;
  if (!depositId) return res.status(400).json({ error: 'depositId required' });
  const dep = db.prepare('SELECT * FROM deposits WHERE id=? AND user_id=?').get(depositId, req.user.userId);
  if (!dep) return res.status(404).json({ error: 'Deposit not found' });
  if (dep.status === 'completed') return res.json({ alreadyCompleted: true, balance: getOrCreateWallet(req.user.userId).balance });

  completeDeposit(depositId, 'SIMULATED', dep.amount_usd, { simulated: true });
  const wallet = getOrCreateWallet(req.user.userId);
  res.json({ ok: true, amountCredited: dep.amount_usd, newBalance: wallet.balance });
});

module.exports = { router, creditWallet, getOrCreateWallet };
