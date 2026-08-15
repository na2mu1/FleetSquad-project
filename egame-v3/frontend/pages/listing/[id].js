import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import GameVault from '../../components/GameVault';
import { api } from '../../lib/api';
import { useWallet } from '../../lib/useWallet';
import { getTheme } from '../../lib/gameThemes';

export default function ListingDetail() {
  const router = useRouter();
  const { id } = router.query;
  const wallet = useWallet();
  const [listing, setListing] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState(null);
  const [buyStep, setBuyStep] = useState(null); // null | 'login' | 'processing' | 'redirect' | 'done'
  const [invoiceUrl, setInvoiceUrl] = useState(null);
  const [escrowId, setEscrowId] = useState(null);
  const [showVault, setShowVault] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getListing(id).then(setListing).catch(e => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!listing?.account_id) return;
    api.getInventory(listing.account_id).then(setInventory).catch(() => {});
  }, [listing]);

  if (error) return <Fallback msg={error} />;
  if (!listing) return <Fallback msg="Loading…" loading />;

  const theme = getTheme(listing.game);
  const b = listing.valuation?.breakdown;
  const belowFloor = listing.asking_price < listing.floor_price;

  async function handleBuy() {
    if (!wallet.isConnected) { setBuyStep('login'); return; }
    setBuyStep('processing');
    try {
      const res = await api.createInvoice(id);
      setEscrowId(res.escrowId);
      if (res.mode === 'live' && res.invoiceUrl) {
        setInvoiceUrl(res.invoiceUrl);
        setBuyStep('redirect');
      } else {
        // dev mode — auto-fund via manual escrow path
        await api.fundEscrow(res.escrowId, 'DEV_SIMULATED_TX');
        setBuyStep('done');
      }
    } catch (e) {
      setError(e.message);
      setBuyStep(null);
    }
  }

  return (
    <div className="page" style={{ '--accent': theme.accent }}>
      {/* Game-themed hero */}
      <div className="hero" style={{ background: theme.tabActiveBg }}>
        <div className="heroContent">
          <span className="game">{theme.label}</span>
          <h1>{theme.screenName}</h1>
          <p>Level {listing.level} · {listing.rank || 'Unranked'} · UID {listing.uid}</p>
        </div>
        <VerifBadge type={listing.verification_type} date={listing.verified_at} />
      </div>

      {/* Tab toggle: Inventory | Valuation */}
      <div className="pageTabs">
        <button className={!showVault ? 'active' : ''} onClick={() => setShowVault(false)}>💰 Valuation</button>
        <button className={showVault ? 'active' : ''} onClick={() => setShowVault(true)}>🎒 Inventory</button>
      </div>

      {showVault ? (
        <GameVault
          game={listing.game}
          account={{ uid: listing.uid, level: listing.level, rank: listing.rank, passStatus: listing.pass_status }}
          verification={{ type: listing.verification_type, provider: listing.verification_provider, label: theme.label, verifiedAt: listing.verified_at }}
          inventory={inventory}
        />
      ) : (
        <div className="valuation">
          {belowFloor && (
            <div className="belowFloorNote">
              ℹ️ This listing is priced below the AI's estimated floor (${listing.floor_price?.toFixed(2)}). 
              The seller chose this price — it's allowed.
            </div>
          )}

          {b ? (
            <>
              <div className="estBox">
                <p className="estLabel">AI Estimated Value</p>
                <p className="estVal">${listing.valuation.estimated_value?.toFixed(2)}</p>
                <p className="estSub">Floor reference: ${listing.floor_price?.toFixed(2)}</p>
              </div>
              <div className="breakdown">
                <h3>Breakdown</h3>
                <Row label="Base level score" value={b.baseLevelScore} />
                <Row label="Skin value score" value={b.skinValueScore} sub={b.skinLines?.length ? `${b.skinLines.length} item(s)` : null} />
                <Row label="Rarity multiplier bonus" value={b.rarityMultiplierBonus} />
                <Row label={`Rank bonus${b.detectedRank ? ` (${b.detectedRank})` : ''}`} value={b.rankBonus} />
                <Row label={`Currency (${b.detectedCurrencyAmount?.toLocaleString()} units)`} value={b.currencyEquivalent} />
                <Row label={`Demand index (${b.demandLabel} ×${b.demandMultiplier})`} value={b.demandIndex} />
                <div className="divider" />
                <Row label="Estimated market value" value={listing.valuation.estimated_value} bold />
                <Row label="AI floor reference" value={listing.floor_price} bold accent={theme.accent} />
              </div>
            </>
          ) : (
            <p className="hint">No AI valuation data available.</p>
          )}
        </div>
      )}

      {/* Sticky buy bar */}
      <div className="buyBar">
        <div>
          <span className="k">Asking price</span>
          <span className="price">${listing.asking_price?.toFixed(2)} <small>USDT</small></span>
          {listing.list_type === 'auction' && listing.bids?.length > 0 && (
            <span className="bids">{listing.bids.length} bid(s)</span>
          )}
        </div>
        <button className="buyBtn" onClick={handleBuy} disabled={!!buyStep} style={{ background: theme.accent }}>
          {buyStep === 'processing' ? 'Creating invoice…' : buyStep === 'done' ? '✓ Paid' : 'Buy with USDT'}
        </button>
      </div>

      {/* Buy flow modals */}
      {buyStep === 'login' && (
        <div className="overlay" onClick={() => setBuyStep(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Wallet connect করুন</h3>
            <p className="hint">কিনতে হলে আগে wallet connect করতে হবে।</p>
            <Link href="/dashboard/buyer" className="linkBtn">Go to login →</Link>
          </div>
        </div>
      )}

      {buyStep === 'redirect' && invoiceUrl && (
        <div className="overlay" onClick={() => setBuyStep(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Payment ready 🎉</h3>
            <p className="hint">NOWPayments-এর secure checkout page-এ redirect হবেন। Payment complete হলে escrow-এ funds lock হয়ে যাবে।</p>
            <a href={invoiceUrl} className="linkBtn" style={{ background: theme.accent, color: '#101014' }} target="_blank" rel="noreferrer">
              Pay ${listing.asking_price?.toFixed(2)} USDT →
            </a>
            <button className="ghost" onClick={() => setBuyStep(null)}>Cancel</button>
            <p className="hash">Escrow ID: <code>{escrowId?.slice(0, 16)}…</code></p>
          </div>
        </div>
      )}

      {buyStep === 'done' && (
        <div className="overlay" onClick={() => setBuyStep(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="successIcon">✓</div>
            <h3>Payment recorded!</h3>
            <p className="hint">Escrow funded। Seller now needs to transfer the account. Track status in your buyer dashboard.</p>
            <Link href="/dashboard/buyer" className="linkBtn">Go to Buyer Dashboard →</Link>
          </div>
        </div>
      )}

      <style jsx>{`
        .page { max-width: 480px; margin: 0 auto; padding-bottom: 90px; color: #F4F1EA; font-family: system-ui,sans-serif; }
        .hero { padding: 20px 16px 16px; position: relative; }
        .heroContent .game { font: 700 11px system-ui; text-transform: uppercase; letter-spacing: .07em; color: rgba(0,0,0,.7); }
        .heroContent h1 { margin: 4px 0 2px; font-size: 22px; color: #101014; }
        .heroContent p { margin: 0; font-size: 12.5px; color: rgba(0,0,0,.65); }
        .pageTabs { display: flex; border-bottom: 1px solid #262a3a; margin: 0; }
        .pageTabs button { flex: 1; padding: 12px; background: transparent; border: none; color: #9C9FB0; font: 600 13px system-ui; cursor: pointer; border-bottom: 2px solid transparent; transition: all .15s; }
        .pageTabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
        .valuation { padding: 16px; }
        .belowFloorNote { background: rgba(240,169,79,.1); border: 1px solid rgba(240,169,79,.25); color: #F0A94F; border-radius: 10px; padding: 10px 12px; font-size: 12.5px; margin-bottom: 14px; }
        .estBox { text-align: center; padding: 20px; background: #14161F; border: 1px solid #262a3a; border-radius: 14px; margin-bottom: 14px; }
        .estLabel { margin: 0 0 4px; font-size: 12px; color: #9C9FB0; text-transform: uppercase; letter-spacing: .06em; }
        .estVal { margin: 0 0 4px; font-size: 32px; font-weight: 800; }
        .estSub { margin: 0; font-size: 12px; color: #9C9FB0; }
        .breakdown { background: #14161F; border: 1px solid #262a3a; border-radius: 14px; padding: 14px 16px; }
        .breakdown h3 { margin: 0 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: #9C9FB0; }
        .divider { height: 1px; background: #262a3a; margin: 10px 0; }
        .hint { color: #9C9FB0; font-size: 13px; }
        .buyBar { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; background: #0B0D14; border-top: 1px solid #262a3a; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .k { display: block; font-size: 10px; color: #9C9FB0; text-transform: uppercase; letter-spacing: .06em; }
        .price { font-size: 20px; font-weight: 800; }
        .price small { font-size: 12px; font-weight: 500; color: #9C9FB0; }
        .bids { font-size: 11px; color: #9C9FB0; display: block; }
        .buyBtn { padding: 12px 22px; border-radius: 12px; border: none; font: 700 14px system-ui; cursor: pointer; transition: transform .12s, box-shadow .12s; white-space: nowrap; }
        .buyBtn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 18px color-mix(in srgb, var(--accent) 40%, transparent); }
        .buyBtn:active { transform: scale(.97); }
        .buyBtn:disabled { opacity: .6; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: flex-end; justify-content: center; z-index: 200; animation: fadeIn .15s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .modal { background: #14161F; border: 1px solid #262a3a; border-radius: 20px 20px 0 0; padding: 24px 20px 36px; width: 100%; max-width: 480px; text-align: center; animation: slideUp .25s cubic-bezier(.22,1,.36,1); }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
        .modal h3 { margin: 0 0 8px; font-size: 18px; }
        .successIcon { width: 52px; height: 52px; border-radius: 50%; background: rgba(32,209,121,.15); color: #20D179; font-size: 24px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
        .linkBtn { display: block; margin: 14px 0 6px; padding: 13px; border-radius: 12px; background: #FF7A1A; color: #101014; font: 700 14px system-ui; text-decoration: none; }
        .ghost { width: 100%; padding: 11px; border-radius: 10px; border: 1px solid #262a3a; background: transparent; color: #9C9FB0; font: 600 13px system-ui; cursor: pointer; margin-top: 6px; }
        .hash { font-size: 11px; color: #9C9FB0; margin: 10px 0 0; }
        code { font-family: monospace; }
      `}</style>
    </div>
  );
}

function VerifBadge({ type, date }) {
  const isApi = type === 'api';
  return (
    <div className="vbadge">
      <span className="dot" />
      {isApi ? 'API Verified' : 'Manual Verified'}
      {date && <span className="vdate"> · {new Date(date).toLocaleDateString()}</span>}
      <style jsx>{`
        .vbadge { display: inline-flex; align-items: center; gap: 5px; background: rgba(0,0,0,.35); border-radius: 999px; padding: 5px 10px; font: 600 11px system-ui; color: #fff; margin-top: 10px; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: ${isApi ? '#20D179' : '#F0A94F'}; }
        .vdate { opacity: .7; }
      `}</style>
    </div>
  );
}

function Row({ label, value, bold, accent, sub }) {
  return (
    <div className="row">
      <div>
        <span className="label">{label}</span>
        {sub && <span className="sub"> · {sub}</span>}
      </div>
      <span className="value">${Number(value || 0).toFixed(2)}</span>
      <style jsx>{`
        .row { display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; }
        .label { font-size: 13px; color: ${bold ? '#F4F1EA' : '#9C9FB0'}; font-weight: ${bold ? 700 : 400}; }
        .sub { font-size: 11px; color: #9C9FB0; }
        .value { font-size: 13px; font-weight: ${bold ? 800 : 600}; color: ${accent || '#F4F1EA'}; }
      `}</style>
    </div>
  );
}

function Fallback({ msg, loading }) {
  return (
    <div className="fb">
      {loading && <div className="spin" />}
      <p>{msg}</p>
      <style jsx>{`
        .fb { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #9C9FB0; }
        .spin { width: 28px; height: 28px; border-radius: 50%; border: 3px solid #262a3a; border-top-color: #FF7A1A; animation: spin .7s linear infinite; margin-bottom: 14px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
