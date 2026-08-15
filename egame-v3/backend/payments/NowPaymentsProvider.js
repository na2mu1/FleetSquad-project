const crypto = require('crypto');
const { PaymentProvider } = require('./PaymentProvider');

const API_BASE = 'https://api.nowpayments.io/v1';

/**
 * NOWPayments (nowpayments.io) — a real, established crypto payment
 * processor supporting USDT-TRC20 among 300+ currencies, with a
 * documented public REST API and IPN (Instant Payment Notification)
 * webhooks. This class is a genuine integration against their documented
 * API shape, not a mock — you only need to create an account and set
 * NOWPAYMENTS_API_KEY / NOWPAYMENTS_IPN_SECRET to go live.
 *
 * Why a processor instead of routing straight into our own wallet:
 * NOWPayments (or any similar licensed processor — Coinbase Commerce,
 * BitPay, CoinGate are drop-in alternatives implementing this same
 * interface) handles the custody, chain-monitoring, and compliance
 * burden. Our backend never touches private keys.
 *
 * Docs referenced: https://documenter.getpostman.com/view/7907941/S1a32n38
 */
class NowPaymentsProvider extends PaymentProvider {
  get id() { return 'nowpayments'; }

  get apiKey() { return process.env.NOWPAYMENTS_API_KEY; }
  get ipnSecret() { return process.env.NOWPAYMENTS_IPN_SECRET; }

  async isConfigured() {
    return Boolean(this.apiKey);
  }

  /**
   * Creates an invoice (hosted checkout page) for the given USD amount,
   * payable in USDT-TRC20. Using the hosted invoice endpoint rather than
   * the raw payment endpoint means the buyer gets a NOWPayments-hosted
   * page with a QR code and live status — no custom wallet UI needed.
   */
  async createPayment({ orderId, amountUsd, payCurrency = 'usdttrc20' }) {
    const res = await fetch(`${API_BASE}/invoice`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: amountUsd,
        price_currency: 'usd',
        pay_currency: payCurrency,
        order_id: orderId,
        order_description: `e-Game Marketplace escrow deposit — order ${orderId}`,
        ipn_callback_url: process.env.NOWPAYMENTS_IPN_URL, // e.g. https://yourapi.com/api/payments/webhook
        success_url: process.env.NOWPAYMENTS_SUCCESS_URL,
        cancel_url: process.env.NOWPAYMENTS_CANCEL_URL,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`NOWPayments invoice creation failed: ${res.status} ${body}`);
    }

    const data = await res.json();
    return {
      paymentId: data.id,
      invoiceUrl: data.invoice_url,
      payAmount: data.price_amount,
      payCurrency,
      orderId,
    };
  }

  /** NOWPayments signs IPN callbacks with HMAC-SHA512 over the
   * alphabetically-sorted, JSON-stringified body, using your IPN secret. */
  verifyWebhookSignature({ rawBody, signatureHeader }) {
    if (!this.ipnSecret) return false;
    const sorted = JSON.stringify(sortKeysDeep(JSON.parse(rawBody)));
    const expected = crypto.createHmac('sha512', this.ipnSecret).update(sorted).digest('hex');
    return expected === signatureHeader;
  }

  parseWebhookEvent(payload) {
    // NOWPayments statuses: waiting, confirming, confirmed, sending, finished, failed, refunded, expired
    const statusMap = {
      waiting: 'waiting',
      confirming: 'confirming',
      confirmed: 'confirming',
      sending: 'confirming',
      finished: 'finished',
      failed: 'failed',
      refunded: 'failed',
      expired: 'expired',
    };
    return {
      paymentId: payload.payment_id || payload.id,
      status: statusMap[payload.payment_status] || 'waiting',
      orderId: payload.order_id,
    };
  }
}

function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, k) => {
      acc[k] = sortKeysDeep(obj[k]);
      return acc;
    }, {});
  }
  return obj;
}

module.exports = { NowPaymentsProvider };
