/**
 * Payment Provider Layer
 * -----------------------
 * Rolling and auditing your own custody smart contract before you have
 * real trading volume is expensive and risky. This interface lets the
 * platform take custody of buyer funds through an established, licensed
 * crypto payment processor instead — they hold the USDT-TRC20 wallet
 * infrastructure and compliance burden; this platform just requests a
 * payment and gets told (via webhook) when it's been paid.
 *
 * `contracts/Escrow.sol` still exists for a fully on-chain future, but
 * for launch, a processor is the faster and safer route to "real money
 * really moves."
 */
class PaymentProvider {
  get id() { throw new Error('must implement id'); }

  /**
   * Creates a payment request for an amount in USD, settled in USDT.
   * Returns { paymentId, payAddress?, payAmount, payCurrency, invoiceUrl?, qrUrl? }
   */
  async createPayment(/* { orderId, amountUsd, payCurrency } */) {
    throw new Error('Not implemented');
  }

  /** Verifies an inbound webhook actually came from the provider. */
  verifyWebhookSignature(/* { rawBody, signatureHeader } */) {
    throw new Error('Not implemented');
  }

  /** Normalizes a webhook payload to { paymentId, status, orderId } where
   * status is one of: 'waiting' | 'confirming' | 'finished' | 'failed' | 'expired' */
  parseWebhookEvent(/* payload */) {
    throw new Error('Not implemented');
  }
}

module.exports = { PaymentProvider };
