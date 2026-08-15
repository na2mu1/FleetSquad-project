import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useWallet } from '../../lib/useWallet';
import { api } from '../../lib/api';

/**
 * Dev-only payment simulation page.
 * Real MFS / Crypto gateway-এ redirect হওয়ার বদলে এই page খোলে।
 * "Confirm Payment" button-এ click করলে backend-এ simulate হয়।
 */
export default function SimulatePayment() {
  const router = useRouter();
  const wallet = useWallet();
  const { depositId, channel, amount, amountUSD, currency } = router.query;
  const [step, setStep] = useState('pending'); // pending | confirming | done | error
  const [result, setResult] = useState(null);
  const [countdown, setCountdown] = useState(5);

  const MFS_ICONS = { bkash:'🟣', nagad:'🟠', rocket:'🔵', upay:'🟢', crypto:'₿' };

  useEffect(() => {
    if (step !== 'pending' || !depositId) return;
    const t = setInterval(() => setCountdown(c => { if (c <= 1) { clearInterval(t); } return c - 1; }), 1000);
    return () => clearInterval(t);
  }, [step, depositId]);

  async function handleConfirm() {
    setStep('confirming');
    try {
      const res = await api.simulateDeposit(depositId);
      setResult(res);
      setStep('done');
    } catch(e) {
      setResult({ error: e.message });
      setStep('error');
    }
  }

  async function handleAutoConfirm() {
    if (countdown > 0) return;
    handleConfirm();
  }

  useEffect(() => {
    if (countdown === 0 && step === 'pending') handleConfirm();
  }, [countdown]);

  const isCrypto = channel === 'crypto';
  const icon = MFS_ICONS[channel] || '💳';

  return (
    <div className="page">
      <div className="card">
        {step === 'pending' && (
          <>
            <div className="providerIcon">{icon}</div>
            <h2>{isCrypto ? `${currency || 'Crypto'} Payment` : `${channel?.charAt(0).toUpperCase()+channel?.slice(1)} Payment`}</h2>
            <p className="subtitle">Development Simulation Mode</p>

            <div className="amountBox">
              {isCrypto ? (
                <>
                  <p className="amtMain">${parseFloat(amountUSD||0).toFixed(2)} <span>USD</span></p>
                  <p className="amtSub">in {currency || 'USDT'}</p>
                </>
              ) : (
                <>
                  <p className="amtMain">৳{parseFloat(amount||0).toLocaleString()}</p>
                  <p className="amtSub">≈ ${parseFloat(amountUSD||0).toFixed(2)} USD</p>
                </>
              )}
            </div>

            <div className="steps">
              <div className="stepItem done">✓ Payment initiated</div>
              <div className="stepItem active">⏳ Awaiting confirmation…</div>
              <div className="stepItem">💰 Balance credit</div>
            </div>

            <p className="autoNote">
              {countdown > 0 ? `Auto-confirming in ${countdown}s…` : 'Confirming…'}
            </p>
            <div className="progressBar"><div className="progress" style={{ width: `${((5-countdown)/5)*100}%` }} /></div>

            <button className="confirmBtn" onClick={handleConfirm} disabled={step!=='pending'}>
              ✓ Confirm Payment Now
            </button>
            <button className="cancelBtn" onClick={() => router.push('/deposit')}>Cancel</button>
          </>
        )}

        {step === 'confirming' && (
          <>
            <div className="spinner" />
            <h2>Processing…</h2>
            <p className="subtitle">Balance credit করা হচ্ছে</p>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div className="successIcon">✓</div>
            <h2>Payment Successful!</h2>
            <div className="resultGrid">
              <RRow label="Amount credited" value={`$${result.amountCredited?.toFixed(2)} USD`} />
              <RRow label="New balance" value={`$${result.newBalance?.toFixed(2)} USD`} />
            </div>
            <button className="confirmBtn green" onClick={() => router.push('/deposit')}>← Back to Wallet</button>
            <button className="cancelBtn" onClick={() => router.push('/')}>Go to Marketplace</button>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="errorIcon">✕</div>
            <h2>Payment Failed</h2>
            <p className="errMsg">{result?.error || 'Unknown error'}</p>
            <button className="confirmBtn" onClick={() => router.push('/deposit')}>← Back</button>
          </>
        )}
      </div>

      <p className="devBadge">🛠 Dev Mode — Real gateway-এ এই page থাকবে না</p>

      <style jsx>{`
        .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; background: #05060a; }
        .card { width: 100%; max-width: 360px; background: #14161F; border: 1px solid #262a3a; border-radius: 20px; padding: 28px 24px; text-align: center; }
        .providerIcon { font-size: 48px; margin-bottom: 12px; }
        h2 { margin: 0 0 4px; font-size: 20px; color: #F4F1EA; font-family: system-ui,sans-serif; }
        .subtitle { margin: 0 0 18px; font-size: 12px; color: #9C9FB0; font-family: system-ui; }
        .amountBox { background: #0B0D14; border-radius: 14px; padding: 16px; margin-bottom: 18px; }
        .amtMain { margin: 0 0 4px; font-size: 30px; font-weight: 900; color: #20D179; font-family: system-ui; }
        .amtMain span { font-size: 14px; font-weight: 400; color: #9C9FB0; }
        .amtSub { margin: 0; font-size: 13px; color: #9C9FB0; font-family: system-ui; }
        .steps { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; text-align: left; }
        .stepItem { font-size: 12.5px; color: #9C9FB0; padding: 6px 10px; border-radius: 8px; font-family: system-ui; }
        .stepItem.done { color: #20D179; background: rgba(32,209,121,.08); }
        .stepItem.active { color: #F0A94F; background: rgba(240,169,79,.08); }
        .autoNote { font-size: 12px; color: #9C9FB0; margin: 8px 0 4px; font-family: system-ui; }
        .progressBar { height: 4px; background: #262a3a; border-radius: 2px; margin-bottom: 18px; overflow: hidden; }
        .progress { height: 100%; background: #FF7A1A; border-radius: 2px; transition: width 1s linear; }
        .confirmBtn { width: 100%; padding: 13px; border-radius: 12px; border: none; background: #FF7A1A; color: #101014; font: 700 14px system-ui; cursor: pointer; margin-bottom: 8px; transition: transform .12s; }
        .confirmBtn:hover:not(:disabled) { transform: translateY(-1px); }
        .confirmBtn.green { background: #20D179; }
        .confirmBtn:disabled { opacity: .6; }
        .cancelBtn { width: 100%; padding: 11px; border-radius: 10px; border: 1px solid #262a3a; background: transparent; color: #9C9FB0; font: 600 13px system-ui; cursor: pointer; }
        .spinner { width: 36px; height: 36px; border: 3px solid #262a3a; border-top-color: #FF7A1A; border-radius: 50%; animation: spin .7s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .successIcon { width: 56px; height: 56px; border-radius: 50%; background: rgba(32,209,121,.15); color: #20D179; font-size: 28px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
        .errorIcon { width: 56px; height: 56px; border-radius: 50%; background: rgba(240,79,122,.15); color: #F04F7A; font-size: 28px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
        .resultGrid { background: #0B0D14; border-radius: 10px; padding: 12px; margin: 14px 0; }
        .errMsg { color: #F04F7A; font-size: 13px; background: rgba(240,79,122,.1); padding: 10px; border-radius: 8px; margin: 10px 0; font-family: system-ui; }
        .devBadge { margin-top: 16px; font-size: 11px; color: #9C9FB0; font-family: system-ui; }
      `}</style>
    </div>
  );
}

function RRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:'13px', fontFamily:'system-ui', color:'#F4F1EA' }}>
      <span style={{ color:'#9C9FB0' }}>{label}</span>
      <span style={{ fontWeight:700 }}>{value}</span>
    </div>
  );
}
