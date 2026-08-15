const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/init');
const { requireAuth } = require('./auth');
const { NowPaymentsProvider } = require('../payments/NowPaymentsProvider');

const router = express.Router();
const provider = new NowPaymentsProvider();
const COMMISSION_RATE = 0.08;

/**
 * POST /api/payments/webhook
 * Called by the payment processor (NOWPayments IPN) when a payment's
 * status changes. Verifies the signature before trusting anything in
 * the body — this endpoint is public by necessity (the processor calls
 * it, not a logged-in user) so signature verification is the only thing
 * standing between us and a forged "payment received" event.
 *
 * NOTE: defined before the router-level express.json() below so it keeps
 * the raw body needed for HMAC verification; every other route in this
 * file gets normal JSON parsing via the middleware that follows.
 */
router.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body.toString('utf8');
  const signature = req.headers['x-nowpayments-sig'];

  if (!provider.verifyWebhookSignature({ rawBody, signatureHeader: signature })) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const payload = JSON.parse(rawBody);
  const event = provider.parseWebhookEvent(payload);
  const escrow = db.prepare('SELECT * FROM escrow_transactions WHERE id = ?').get(event.orderId);
  if (!escrow) return res.status(404).json({ error: 'Unknown order' });

  if (event.status === 'finished' && escrow.status === 'awaiting_deposit') {
    db.prepare(`UPDATE escrow_transactions SET status = 'funded', updated_at = datetime('now') WHERE id = ?`).run(escrow.id);
    db.prepare(`UPDATE listings SET status = 'sold' WHERE id = ?`).run(escrow.listing_id);
  } else if (event.status === 'failed' || event.status === 'expired') {
    db.prepare(`UPDATE escrow_transactions SET status = 'refunded', updated_at = datetime('now') WHERE id = ?`).run(escrow.id);
  }

  res.json({ received: true });
});

// Everything below needs a normal parsed JSON body.
router.use(express.json());

/**
 * POST /api/payments/create-invoice  { listingId }
 * Buyer clicks "Buy" -> we create an escrow_transactions row
 * (status='awaiting_deposit') and a hosted invoice with the payment
 * processor. Frontend redirects the buyer to invoiceUrl to actually pay.
 */
router.post('/create-invoice', requireAuth, async (req, res) => {
  const { listingId } = req.body;
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status !== 'active') return res.status(409).json({ error: 'Listing is not active' });

  const amount = listing.asking_price;
  const commission = Math.round(amount * COMMISSION_RATE * 100) / 100;
  const sellerPayout = Math.round((amount - commission) * 100) / 100;
  const escrowId = uuid();

  db.prepare(
    `INSERT INTO escrow_transactions (id, listing_id, buyer_id, seller_id, amount, status, commission_rate, commission_amount, seller_payout, payment_provider)
     VALUES (?, ?, ?, ?, ?, 'awaiting_deposit', ?, ?, ?, ?)`
  ).run(escrowId, listingId, req.user.userId, listing.seller_id, amount, COMMISSION_RATE, commission, sellerPayout, provider.id);

  if (!(await provider.isConfigured())) {
    // Dev fallback: no NOWPAYMENTS_API_KEY set. Return the escrow row so
    // the existing manual `POST /api/escrow` deposit-confirm flow (see
    // escrow.js) still works end to end for local testing.
    return res.status(201).json({
      escrowId,
      mode: 'dev_manual',
      message: 'No payment processor configured — use POST /api/escrow with a chainTxHash to simulate a deposit.',
      amount,
    });
  }

  try {
    const invoice = await provider.createPayment({ orderId: escrowId, amountUsd: amount });
    db.prepare('UPDATE escrow_transactions SET payment_id = ?, invoice_url = ? WHERE id = ?')
      .run(invoice.paymentId, invoice.invoiceUrl, escrowId);
    res.status(201).json({ escrowId, mode: 'live', invoiceUrl: invoice.invoiceUrl, amount });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/** Buyer polls this while waiting on the hosted invoice page. */
router.get('/status/:escrowId', requireAuth, (req, res) => {
  const escrow = db.prepare('SELECT status, invoice_url FROM escrow_transactions WHERE id = ?').get(req.params.escrowId);
  if (!escrow) return res.status(404).json({ error: 'Not found' });
  res.json(escrow);
});

module.exports = router;
