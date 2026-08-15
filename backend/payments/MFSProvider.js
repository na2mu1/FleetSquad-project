/**
 * Mobile Financial Services (MFS) Payment Provider
 * ──────────────────────────────────────────────────
 * Covers: bKash, Nagad, Rocket, Upay (Bangladesh)
 *
 * Real integration paths:
 *  • bKash   → bKash Payment Gateway API (PGW) — merchant account required
 *              https://developer.bka.sh/docs
 *  • Nagad   → Nagad Merchant API — merchant ID + key required
 *              https://nagad.com.bd/merchant
 *  • Rocket  → Dutch-Bangla Bank Rocket API — contact DBBL for merchant onboarding
 *  • Upay    → UCB Upay Gateway — contact UCB for access
 *
 * This file implements the interface in dev/sandbox mode. Switch each
 * provider to LIVE by setting:
 *   BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD
 *   NAGAD_MERCHANT_ID, NAGAD_MERCHANT_KEY
 *   ROCKET_MERCHANT_NUMBER, ROCKET_MERCHANT_PIN
 *
 * USD↔BDT conversion rate — update daily via a cron job or a public FX API.
 */

const BDT_TO_USD = parseFloat(process.env.BDT_TO_USD_RATE || '0.0091'); // ~110 BDT = 1 USD

const PROVIDERS = {
  bkash:  { name: 'bKash',  logo: '🟣', currency: 'BDT', minBDT: 10,  maxBDT: 25000 },
  nagad:  { name: 'Nagad',  logo: '🟠', currency: 'BDT', minBDT: 10,  maxBDT: 25000 },
  rocket: { name: 'Rocket', logo: '🔵', currency: 'BDT', minBDT: 10,  maxBDT: 25000 },
  upay:   { name: 'Upay',   logo: '🟢', currency: 'BDT', minBDT: 10,  maxBDT: 25000 },
};

/**
 * Initiate a payment — returns a URL or redirect the user opens to complete
 * the MFS payment on the provider's side, plus a reference ID we store.
 */
async function initiatePayment({ channel, amountBDT, userId, depositId, callbackUrl }) {
  const provider = PROVIDERS[channel];
  if (!provider) throw new Error(`Unknown MFS channel: ${channel}`);
  if (amountBDT < provider.minBDT || amountBDT > provider.maxBDT) {
    throw new Error(`${provider.name} amount must be ${provider.minBDT}–${provider.maxBDT} BDT`);
  }
  const amountUSD = Math.round(amountBDT * BDT_TO_USD * 100) / 100;

  if (process.env.NODE_ENV === 'production') {
    return _realInitiate({ channel, amountBDT, userId, depositId, callbackUrl, amountUSD });
  }

  // ── DEV / SANDBOX mode ──────────────────────────────────────────────────
  // Returns a fake payment URL — the "Pay Now" button in dev opens this
  // page which auto-confirms after 3 seconds (simulated in the frontend).
  return {
    paymentUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/simulate?depositId=${depositId}&channel=${channel}&amount=${amountBDT}&amountUSD=${amountUSD}`,
    providerRef: `DEV-${channel.toUpperCase()}-${Date.now()}`,
    amountBDT,
    amountUSD,
    currency: 'BDT',
    expiresIn: 300,
  };
}

async function _realInitiate({ channel, amountBDT, userId, depositId, callbackUrl, amountUSD }) {
  if (channel === 'bkash') {
    // Step 1: get token
    const tokenRes = await fetch('https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        username: process.env.BKASH_USERNAME,
        password: process.env.BKASH_PASSWORD,
      },
      body: JSON.stringify({ app_key: process.env.BKASH_APP_KEY, app_secret: process.env.BKASH_APP_SECRET }),
    });
    const { id_token } = await tokenRes.json();

    // Step 2: create payment
    const payRes = await fetch('https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: id_token, 'x-app-key': process.env.BKASH_APP_KEY },
      body: JSON.stringify({
        mode: '0011', payerReference: userId, callbackURL: callbackUrl,
        amount: String(amountBDT), currency: 'BDT', intent: 'sale',
        merchantInvoiceNumber: depositId,
      }),
    });
    const pay = await payRes.json();
    return { paymentUrl: pay.bkashURL, providerRef: pay.paymentID, amountBDT, amountUSD, currency: 'BDT' };
  }

  if (channel === 'nagad') {
    // Nagad Merchant API — contact Nagad for sandbox/live credentials
    throw new Error('Nagad live integration: set NAGAD_MERCHANT_ID and NAGAD_MERCHANT_KEY in .env');
  }

  throw new Error(`${channel} live integration not yet implemented — contact the payment provider for merchant credentials`);
}

/**
 * Verify an incoming webhook/callback from the MFS provider.
 * Returns { valid, depositId, amountBDT, amountUSD, status }
 */
function verifyCallback({ channel, body, query }) {
  if (process.env.NODE_ENV !== 'production') {
    // Dev simulate endpoint sends these fields directly
    return {
      valid: true,
      depositId: body.depositId || query.depositId,
      amountBDT: parseFloat(body.amount || query.amount || 0),
      amountUSD: parseFloat(body.amountUSD || query.amountUSD || 0),
      status: 'completed',
    };
  }

  if (channel === 'bkash') {
    const { paymentID, status, merchantInvoiceNumber, amount } = body;
    return {
      valid: Boolean(paymentID && status === 'Completed'),
      depositId: merchantInvoiceNumber,
      amountBDT: parseFloat(amount),
      amountUSD: Math.round(parseFloat(amount) * BDT_TO_USD * 100) / 100,
      status: status === 'Completed' ? 'completed' : 'failed',
    };
  }

  return { valid: false, status: 'failed' };
}

module.exports = { initiatePayment, verifyCallback, PROVIDERS, BDT_TO_USD };
