/**
 * Crypto Deposit Provider
 * ────────────────────────
 * Uses NOWPayments (https://nowpayments.io) — supports 300+ coins.
 * For this app: USDT (TRC20/ERC20), BTC, ETH, BNB are the main ones.
 *
 * Set in .env:
 *   NOWPAYMENTS_API_KEY=your_live_key
 *   NOWPAYMENTS_IPN_SECRET=your_ipn_secret
 *
 * Without a key → dev sandbox mode (simulated payment, no real crypto).
 */

const crypto = require('crypto');
const BASE = 'https://api.nowpayments.io/v1';

const SUPPORTED_COINS = [
  { symbol: 'USDT', name: 'Tether (TRC20)',  network: 'TRC20', logo: '💚' },
  { symbol: 'USDTERC20', name: 'Tether (ERC20)', network: 'ERC20', logo: '💚' },
  { symbol: 'BTC',  name: 'Bitcoin',          network: 'BTC',   logo: '🟡' },
  { symbol: 'ETH',  name: 'Ethereum',         network: 'ETH',   logo: '🔷' },
  { symbol: 'BNB',  name: 'BNB (BSC)',        network: 'BSC',   logo: '🟨' },
  { symbol: 'LTC',  name: 'Litecoin',         network: 'LTC',   logo: '⚪' },
];

async function np(path, method = 'GET', body = null) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `NOWPayments error ${res.status}`);
  return data;
}

/**
 * Create a crypto payment invoice.
 * Returns { paymentId, payAddress, payAmount, payCurrency, paymentUrl, amountUSD }
 */
async function createInvoice({ amountUSD, currency = 'USDT', depositId, successUrl, cancelUrl }) {
  if (!process.env.NOWPAYMENTS_API_KEY) {
    // Dev mode — simulate
    return {
      paymentId: `DEV-CRYPTO-${Date.now()}`,
      payAddress: '0xDEV_SIMULATED_CRYPTO_ADDRESS',
      payAmount: amountUSD, // 1:1 in dev
      payCurrency: currency,
      paymentUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/simulate?depositId=${depositId}&channel=crypto&amountUSD=${amountUSD}&currency=${currency}`,
      amountUSD,
      mode: 'dev',
    };
  }

  // Real NOWPayments flow
  const invoice = await np('/invoice', 'POST', {
    price_amount: amountUSD,
    price_currency: 'usd',
    pay_currency: currency.toLowerCase(),
    order_id: depositId,
    order_description: `e-Game Marketplace deposit #${depositId}`,
    success_url: successUrl || process.env.NOWPAYMENTS_SUCCESS_URL,
    cancel_url: cancelUrl || process.env.NOWPAYMENTS_CANCEL_URL,
    ipn_callback_url: process.env.NOWPAYMENTS_IPN_URL,
  });

  return {
    paymentId: invoice.id,
    paymentUrl: invoice.invoice_url,
    amountUSD,
    payCurrency: currency,
    mode: 'live',
  };
}

/**
 * Verify NOWPayments IPN webhook signature.
 * They sign the JSON body with HMAC-SHA512 using the IPN secret.
 */
function verifyWebhook(rawBody, signature) {
  if (!process.env.NOWPAYMENTS_IPN_SECRET) return true; // dev: skip
  const expected = crypto
    .createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET)
    .update(JSON.stringify(JSON.parse(rawBody)))
    .digest('hex');
  return expected === signature;
}

/**
 * Parse an IPN webhook body into a normalized deposit update.
 */
function parseWebhook(body) {
  return {
    providerRef: String(body.payment_id),
    depositId: body.order_id,
    status: body.payment_status === 'finished' ? 'completed'
          : body.payment_status === 'failed'   ? 'failed'
          : 'pending',
    amountUSD: parseFloat(body.price_amount || 0),
  };
}

module.exports = { createInvoice, verifyWebhook, parseWebhook, SUPPORTED_COINS };
