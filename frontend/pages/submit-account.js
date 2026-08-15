import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useWallet } from '../lib/useWallet';
import WalletConnect from '../components/WalletConnect';
import { api } from '../lib/api';
import { TABS } from '../lib/gameThemes';

const GAMES = [
  { value: 'free_fire', label: '🔥 Free Fire', uidFormat: '8-12 digit number' },
  { value: 'pubg_mobile', label: '🪖 PUBG Mobile', uidFormat: '9-12 digit number' },
  { value: 'efootball', label: '⚽ eFootball', uidFormat: '5-20 alphanumeric' },
];

const RANKS = {
  free_fire: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Heroic', 'Grandmaster'],
  pubg_mobile: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Crown', 'Ace', 'Ace Master', 'Ace Dominator', 'Conqueror'],
  efootball: ['Beginner', 'Amateur', 'Semi-Pro', 'Professional', 'Top Rated'],
};

const SUBCATEGORIES = [
  { value: 'gun_skin', label: '🔫 Gun Skin' },
  { value: 'character_bundle', label: '🧑 Character Bundle' },
  { value: 'costume', label: '👘 Costume' },
  { value: 'outfit', label: '👔 Outfit' },
  { value: 'headgear', label: '⛑️ Headgear' },
  { value: 'shoes', label: '👟 Shoes' },
  { value: 'emote', label: '💃 Emote' },
  { value: 'pet', label: '🐾 Pet' },
  { value: 'vehicle', label: '🚗 Vehicle' },
  { value: 'backpack', label: '🎒 Backpack' },
  { value: 'gloo_wall', label: '🧱 Gloo Wall' },
  { value: 'weapon_collection', label: '⚔️ Weapon Collection' },
  { value: 'avatar', label: '🖼️ Avatar' },
  { value: 'frame', label: '🔲 Frame' },
  { value: 'badge', label: '🏅 Badge' },
];

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];
const RARITY_COLORS = { common: '#9AA0AC', rare: '#4FA9F0', epic: '#B15CF0', legendary: '#F0A94F', mythic: '#F04F7A' };

const STEPS = ['Account Info', 'Declare Items', 'AI Valuation', 'Proof Upload', 'Set Price & List'];

export default function SubmitAccount() {
  const wallet = useWallet();
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 0 — account info
  const [form, setForm] = useState({ game: 'free_fire', uid: '', level: '', rank: '', currencyAmount: '', passType: '', passActive: false, passSeason: '' });
  const [screenshots, setScreenshots] = useState([]);

  // Step 1 — declared items
  const [items, setItems] = useState([{ name: '', subcategory: 'gun_skin', rarity: 'rare' }]);

  // Step 2 — valuation result
  const [accountId, setAccountId] = useState(null);
  const [valuation, setValuation] = useState(null);

  // Step 3 — inventory proof per tab
  const [proofUploaded, setProofUploaded] = useState({});

  // Step 4 — listing options
  const [listType, setListType] = useState('fixed');
  const [askingPrice, setAskingPrice] = useState('');
  const [auctionEndsAt, setAuctionEndsAt] = useState('');

  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  if (!wallet.isConnected) return <WalletConnect onConnected={() => {}} />;

  /* ── Step handlers ── */
  async function submitAccount() {
    setStatus('Submitting…'); setError('');
    const fd = new FormData();
    fd.append('game', form.game);
    fd.append('uid', form.uid.trim());
    fd.append('level', form.level);
    fd.append('rank', form.rank);
    fd.append('currencyAmount', form.currencyAmount || '0');
    if (form.passType) {
      fd.append('passStatus', JSON.stringify({ type: form.passType, active: form.passActive, season: form.passSeason }));
    }
    fd.append('declaredItems', JSON.stringify(items.filter(i => i.name.trim())));
    screenshots.forEach(f => { fd.append('screenshots', f); fd.append('screenshotCategories', 'inventory'); });
    try {
      const res = await api.submitAccount(fd);
      setAccountId(res.accountId);
      setStatus('Running AI analysis…');
      const val = await api.analyzeAccount(res.accountId);
      setValuation(val);
      setAskingPrice(val.floorPrice.toFixed(2));
      setStatus('');
      setStep(2);
    } catch (e) { setError(e.message); setStatus(''); }
  }

  async function uploadProof(tab, file) {
    const fd = new FormData();
    fd.append('tab', tab);
    fd.append('media', file);
    try {
      await api.uploadInventoryProof(accountId, fd);
      setProofUploaded(p => ({ ...p, [tab]: true }));
    } catch (e) { setError(e.message); }
  }

  async function createListing() {
    setStatus('Publishing listing…'); setError('');
    try {
      const price = parseFloat(askingPrice);
      const res = await api.createListing({
        accountId,
        listType,
        askingPrice: price,
        auctionEndsAt: listType === 'auction' ? auctionEndsAt : undefined,
      });
      router.push(`/listing/${res.listingId}`);
    } catch (e) { setError(e.message); setStatus(''); }
  }

  const proofCount = Object.values(proofUploaded).filter(Boolean).length;
  const gameInfo = GAMES.find(g => g.value === form.game);
  const price = parseFloat(askingPrice) || 0;
  const belowFloor = valuation && price < valuation.floorPrice;

  return (
    <div className="page">
      {/* Step indicator */}
      <div className="stepBar">
        {STEPS.map((s, i) => (
          <div key={s} className={`stepItem ${i === step ? 'active' : i < step ? 'done' : ''}`}>
            <div className="stepDot">{i < step ? '✓' : i + 1}</div>
            <span className="stepLabel">{s}</span>
          </div>
        ))}
      </div>

      {/* ── Step 0: Account Info ── */}
      {step === 0 && (
        <div className="section">
          <h2>Account Information</h2>
          <p className="hint">কোনো password দেওয়ার দরকার নেই। শুধু UID এবং account details দিন।</p>

          <Label>Game</Label>
          <div className="gameGrid">
            {GAMES.map(g => (
              <button key={g.value} className={`gamePick ${form.game === g.value ? 'sel' : ''}`}
                onClick={() => setForm(f => ({ ...f, game: g.value, rank: '' }))}>
                {g.label}
              </button>
            ))}
          </div>

          <Label>UID / Player ID <span className="hint2">({gameInfo?.uidFormat})</span></Label>
          <input value={form.uid} onChange={e => setForm(f => ({ ...f, uid: e.target.value }))} placeholder="Your game UID" />

          <div className="row2">
            <div>
              <Label>Level</Label>
              <input type="number" value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} placeholder="e.g. 80" />
            </div>
            <div>
              <Label>Rank</Label>
              <select value={form.rank} onChange={e => setForm(f => ({ ...f, rank: e.target.value }))}>
                <option value="">— Select rank —</option>
                {(RANKS[form.game] || []).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <Label>Diamonds / UC / Coins</Label>
          <input type="number" value={form.currencyAmount} onChange={e => setForm(f => ({ ...f, currencyAmount: e.target.value }))} placeholder="e.g. 10000" />

          <Label>Elite / Royale Pass</Label>
          <div className="passRow">
            <select value={form.passType} onChange={e => setForm(f => ({ ...f, passType: e.target.value }))}>
              <option value="">None</option>
              <option value="elite_pass">Elite Pass</option>
              <option value="royale_pass">Royale Pass</option>
            </select>
            {form.passType && (
              <>
                <label className="checkLabel">
                  <input type="checkbox" checked={form.passActive} onChange={e => setForm(f => ({ ...f, passActive: e.target.checked }))} />
                  Active
                </label>
                <input value={form.passSeason} onChange={e => setForm(f => ({ ...f, passSeason: e.target.value }))} placeholder="Season e.g. S65" />
              </>
            )}
          </div>

          <Label>Initial screenshots <span className="hint2">(inventory / rank / currency)</span></Label>
          <div className="fileBox" onClick={() => document.getElementById('ss').click()}>
            {screenshots.length > 0 ? `${screenshots.length} file(s) selected` : '📷 Tap to select screenshots'}
            <input id="ss" type="file" multiple accept="image/*" hidden onChange={e => setScreenshots(Array.from(e.target.files))} />
          </div>

          {error && <p className="err">{error}</p>}
          <button className="nextBtn" onClick={() => setStep(1)} disabled={!form.uid || !form.level}>
            Next →
          </button>
        </div>
      )}

      {/* ── Step 1: Declare Items ── */}
      {step === 1 && (
        <div className="section">
          <h2>Declare Items</h2>
          <p className="hint">আপনার account-এর rare/legendary items declare করুন। AI এগুলো দেখে valuation করবে।</p>

          {items.map((it, i) => (
            <div key={i} className="itemRow">
              <input value={it.name} onChange={e => setItems(a => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Item name e.g. AK47 Panther" />
              <select value={it.subcategory} onChange={e => setItems(a => a.map((x, j) => j === i ? { ...x, subcategory: e.target.value } : x))}>
                {SUBCATEGORIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <div className="rarityPicker">
                {RARITIES.map(r => (
                  <button key={r} className={`rBtn ${it.rarity === r ? 'sel' : ''}`}
                    style={it.rarity === r ? { borderColor: RARITY_COLORS[r], color: RARITY_COLORS[r], background: RARITY_COLORS[r] + '22' } : {}}
                    onClick={() => setItems(a => a.map((x, j) => j === i ? { ...x, rarity: r } : x))}>
                    {r}
                  </button>
                ))}
              </div>
              {items.length > 1 && (
                <button className="removeBtn" onClick={() => setItems(a => a.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}

          <button className="addItemBtn" onClick={() => setItems(a => [...a, { name: '', subcategory: 'gun_skin', rarity: 'rare' }])}>
            + Add another item
          </button>

          {error && <p className="err">{error}</p>}
          {status && <p className="statusMsg">⏳ {status}</p>}

          <div className="navRow">
            <button className="backBtn" onClick={() => setStep(0)}>← Back</button>
            <button className="nextBtn" onClick={submitAccount} disabled={!!status}>
              {status || 'Run AI Valuation →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Valuation Result ── */}
      {step === 2 && valuation && (
        <div className="section">
          <h2>AI Valuation Complete ✓</h2>
          <div className="valBox">
            <p className="bigVal">${valuation.estimatedValue.toFixed(2)}</p>
            <p className="valSub">Estimated market value</p>
          </div>

          <div className="breakdown">
            <BRow label="Base level score" v={valuation.breakdown.baseLevelScore} />
            <BRow label="Skin value score" v={valuation.breakdown.skinValueScore} />
            <BRow label="Rarity multiplier bonus" v={valuation.breakdown.rarityMultiplierBonus} />
            <BRow label={`Rank bonus (${valuation.breakdown.detectedRank || '—'})`} v={valuation.breakdown.rankBonus} />
            <BRow label="Currency equivalent" v={valuation.breakdown.currencyEquivalent} />
            <BRow label={`Demand index (${valuation.breakdown.demandLabel})`} v={valuation.breakdown.demandIndex} />
            <div className="bDivider" />
            <BRow label="Floor reference (informational)" v={valuation.floorPrice} bold />
          </div>

          <p className="hint">✅ Floor price হলো AI-এর estimate — এটা শুধু তথ্যের জন্য। আপনি যা চান সেই দামেই list করতে পারবেন।</p>

          <button className="nextBtn" onClick={() => setStep(3)}>Next: Upload Inventory Proof →</button>
        </div>
      )}

      {/* ── Step 3: Inventory Proof Upload ── */}
      {step === 3 && (
        <div className="section">
          <h2>Upload Inventory Proof</h2>
          <p className="hint">প্রতিটি tab-এর screenshot বা video upload করুন। Buyer এগুলো দেখে account যাচাই করবে।</p>

          <div className="tabGrid">
            {TABS.map(t => (
              <div key={t.key} className={`tabCard ${proofUploaded[t.key] ? 'done' : ''}`}>
                <div className="tabCardTop">
                  <span className="tabName">{t.label}</span>
                  {proofUploaded[t.key] && <span className="check">✓</span>}
                </div>
                <label className="uploadLabel">
                  {proofUploaded[t.key] ? 'Change file' : '+ Upload'}
                  <input type="file" accept="image/*,video/*" hidden
                    onChange={e => e.target.files[0] && uploadProof(t.key, e.target.files[0])} />
                </label>
              </div>
            ))}
          </div>

          {error && <p className="err">{error}</p>}
          <p className="proofCount">{proofCount} tab{proofCount !== 1 ? 's' : ''} uploaded</p>

          <div className="navRow">
            <button className="backBtn" onClick={() => setStep(2)}>← Back</button>
            <button className="nextBtn" disabled={proofCount === 0} onClick={() => setStep(4)}>
              Next: Set Price →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Set Price & List ── */}
      {step === 4 && valuation && (
        <div className="section">
          <h2>Set Price &amp; List</h2>

          <Label>Listing type</Label>
          <div className="typeRow">
            {[['fixed', '🏷 Fixed Price'], ['auction', '🔨 Auction']].map(([v, l]) => (
              <button key={v} className={`typePick ${listType === v ? 'sel' : ''}`} onClick={() => setListType(v)}>{l}</button>
            ))}
          </div>

          <Label>
            {listType === 'auction' ? 'Starting bid (USDT)' : 'Asking price (USDT)'}
          </Label>
          <div className="priceInputWrap">
            <span className="pCurrency">$</span>
            <input type="number" step="0.01" value={askingPrice}
              onChange={e => setAskingPrice(e.target.value)} placeholder="0.00" className="priceInput" />
            <span className="pCurrency2">USDT</span>
          </div>

          {valuation && (
            <div className={`floorNote ${belowFloor ? 'warn' : 'ok'}`}>
              {belowFloor
                ? `⚠ AI floor reference: $${valuation.floorPrice.toFixed(2)} — আপনি এর নিচে set করছেন, buyer দেখতে পাবে।`
                : `✓ AI floor reference: $${valuation.floorPrice.toFixed(2)} — আপনার দাম এর উপরে।`}
            </div>
          )}

          {listType === 'auction' && (
            <>
              <Label>Auction ends at</Label>
              <input type="datetime-local" value={auctionEndsAt} onChange={e => setAuctionEndsAt(e.target.value)} />
            </>
          )}

          <div className="summaryBox">
            <SRow label="Your asking price" v={`$${price.toFixed(2)} USDT`} />
            <SRow label="Platform fee (8%)" v={`-$${(price * 0.08).toFixed(2)}`} />
            <div className="sDivider" />
            <SRow label="You receive (92%)" v={`$${(price * 0.92).toFixed(2)} USDT`} bold />
          </div>

          {error && <p className="err">{error}</p>}
          {status && <p className="statusMsg">⏳ {status}</p>}

          <div className="navRow">
            <button className="backBtn" onClick={() => setStep(3)}>← Back</button>
            <button className="nextBtn" onClick={createListing}
              disabled={!!status || !askingPrice || (listType === 'auction' && !auctionEndsAt)}>
              {status || `Publish ${listType === 'auction' ? 'Auction' : 'Listing'} →`}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .page { max-width: 480px; margin: 0 auto; padding: 20px 14px 80px; color: #F4F1EA; font-family: system-ui,sans-serif; }

        /* Step bar */
        .stepBar { display: flex; justify-content: space-between; margin-bottom: 24px; overflow-x: auto; gap: 4px; }
        .stepItem { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; min-width: 52px; }
        .stepDot { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #262a3a; display: flex; align-items: center; justify-content: center; font: 700 11px system-ui; color: #9C9FB0; background: #0B0D14; transition: all .2s; }
        .stepItem.active .stepDot { border-color: #FF7A1A; color: #FF7A1A; box-shadow: 0 0 14px #FF7A1A44; }
        .stepItem.done .stepDot { background: #20D179; border-color: #20D179; color: #101014; }
        .stepLabel { font-size: 9.5px; color: #9C9FB0; text-align: center; white-space: nowrap; }
        .stepItem.active .stepLabel { color: #FF7A1A; font-weight: 700; }
        .stepItem.done .stepLabel { color: #20D179; }

        /* Section */
        .section { animation: fadeUp .25s cubic-bezier(.22,1,.36,1); }
        @keyframes fadeUp { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: none; } }
        h2 { margin: 0 0 4px; font-size: 20px; }
        .hint { color: #9C9FB0; font-size: 12.5px; margin: 0 0 16px; }
        .hint2 { color: #9C9FB0; font-weight: 400; font-size: 11px; }

        /* Game picker */
        .gameGrid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 14px; }
        .gamePick { padding: 10px 6px; border-radius: 10px; border: 1px solid #262a3a; background: #14161F; color: #9C9FB0; font-size: 12px; cursor: pointer; transition: all .15s; }
        .gamePick.sel { border-color: #FF7A1A; color: #FF7A1A; background: rgba(255,122,26,.1); }

        /* Inputs */
        input, select { background: #14161F; border: 1px solid #262a3a; color: #F4F1EA; padding: 10px 12px; border-radius: 10px; font-size: 14px; width: 100%; transition: border-color .15s; margin-bottom: 12px; }
        input:focus, select:focus { outline: none; border-color: #FF7A1A; }
        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .row2 input, .row2 select { margin-bottom: 0; }

        /* Pass row */
        .passRow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
        .passRow select { flex: 1; min-width: 130px; margin-bottom: 0; }
        .passRow input { flex: 1; min-width: 90px; margin-bottom: 0; }
        .checkLabel { display: flex; align-items: center; gap: 5px; font-size: 13px; color: #9C9FB0; white-space: nowrap; cursor: pointer; }
        .checkLabel input { width: auto; margin: 0; padding: 0; }

        /* File box */
        .fileBox { background: #14161F; border: 1px dashed #262a3a; border-radius: 10px; padding: 14px; text-align: center; color: #9C9FB0; font-size: 13px; cursor: pointer; margin-bottom: 14px; transition: border-color .15s; }
        .fileBox:hover { border-color: #FF7A1A; }

        /* Item rows */
        .itemRow { background: #14161F; border: 1px solid #262a3a; border-radius: 12px; padding: 12px; margin-bottom: 10px; position: relative; animation: fadeUp .2s ease; }
        .itemRow input, .itemRow select { margin-bottom: 8px; }
        .rarityPicker { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
        .rBtn { padding: 4px 10px; border-radius: 999px; border: 1px solid #262a3a; background: transparent; color: #9C9FB0; font-size: 10.5px; cursor: pointer; transition: all .12s; text-transform: capitalize; }
        .removeBtn { position: absolute; top: 10px; right: 10px; background: rgba(240,79,122,.15); border: none; color: #F04F7A; border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer; }
        .addItemBtn { width: 100%; padding: 10px; border: 1px dashed #262a3a; background: transparent; color: #9C9FB0; border-radius: 10px; font-size: 13px; cursor: pointer; margin-bottom: 16px; }

        /* Valuation box */
        .valBox { background: linear-gradient(135deg,#14161F,#1a1d2a); border: 1px solid #262a3a; border-radius: 16px; padding: 22px; text-align: center; margin-bottom: 14px; }
        .bigVal { margin: 0 0 4px; font-size: 36px; font-weight: 900; color: #20D179; }
        .valSub { margin: 0; font-size: 12px; color: #9C9FB0; }
        .breakdown { background: #14161F; border: 1px solid #262a3a; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
        .bDivider { height: 1px; background: #262a3a; margin: 8px 0; }

        /* Tab grid */
        .tabGrid { display: grid; grid-template-columns: repeat(2,1fr); gap: 8px; margin-bottom: 12px; }
        .tabCard { background: #14161F; border: 1px solid #262a3a; border-radius: 12px; padding: 12px; transition: border-color .15s; }
        .tabCard.done { border-color: #20D179; }
        .tabCardTop { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .tabName { font-size: 13px; font-weight: 600; }
        .check { color: #20D179; font-size: 14px; font-weight: 700; }
        .uploadLabel { display: block; background: #0B0D14; border: 1px dashed #262a3a; color: #9C9FB0; font-size: 12px; padding: 7px; border-radius: 8px; text-align: center; cursor: pointer; }
        .tabCard.done .uploadLabel { border-color: #20D179; color: #20D179; }
        .proofCount { color: #9C9FB0; font-size: 12px; margin-bottom: 14px; }

        /* Listing type */
        .typeRow { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
        .typePick { padding: 11px; border-radius: 10px; border: 1px solid #262a3a; background: #14161F; color: #9C9FB0; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .typePick.sel { border-color: #FF7A1A; color: #FF7A1A; background: rgba(255,122,26,.1); }

        /* Price input */
        .priceInputWrap { position: relative; display: flex; align-items: center; margin-bottom: 10px; }
        .pCurrency { position: absolute; left: 12px; color: #9C9FB0; font-size: 16px; pointer-events: none; }
        .priceInput { padding-left: 26px !important; padding-right: 50px !important; font-size: 20px !important; font-weight: 700 !important; }
        .pCurrency2 { position: absolute; right: 12px; color: #9C9FB0; font-size: 12px; pointer-events: none; }

        /* Floor note */
        .floorNote { padding: 9px 12px; border-radius: 9px; font-size: 12px; margin-bottom: 14px; }
        .floorNote.ok { background: rgba(32,209,121,.1); color: #20D179; border: 1px solid rgba(32,209,121,.25); }
        .floorNote.warn { background: rgba(240,169,79,.1); color: #F0A94F; border: 1px solid rgba(240,169,79,.25); }

        /* Summary box */
        .summaryBox { background: #14161F; border: 1px solid #262a3a; border-radius: 12px; padding: 14px; margin: 14px 0; }
        .sDivider { height: 1px; background: #262a3a; margin: 8px 0; }

        /* Nav */
        .navRow { display: grid; grid-template-columns: 1fr 2fr; gap: 8px; margin-top: 14px; }
        .backBtn { padding: 12px; border-radius: 11px; border: 1px solid #262a3a; background: transparent; color: #9C9FB0; font-size: 14px; cursor: pointer; }
        .nextBtn { padding: 13px; border-radius: 11px; border: none; background: #FF7A1A; color: #101014; font: 700 14px system-ui; cursor: pointer; transition: transform .12s, box-shadow .12s; }
        .nextBtn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 18px #FF7A1A44; }
        .nextBtn:disabled { opacity: .55; }

        /* Status */
        .err { color: #F04F7A; font-size: 12.5px; background: rgba(240,79,122,.1); padding: 8px 12px; border-radius: 8px; margin: 8px 0; }
        .statusMsg { color: #F0A94F; font-size: 12.5px; margin: 6px 0; }

        /* Label */
        label.lbl, .lbl { display: block; font-size: 11.5px; color: #9C9FB0; margin-bottom: 5px; margin-top: 10px; letter-spacing: .02em; }
      `}</style>
    </div>
  );
}

function Label({ children }) {
  return <p className="lbl" style={{ display:'block',fontSize:'11.5px',color:'#9C9FB0',marginBottom:'5px',marginTop:'10px' }}>{children}</p>;
}

function BRow({ label, v, bold }) {
  return (
    <div style={{ display:'flex',justifyContent:'space-between',padding:'4px 0' }}>
      <span style={{ fontSize:'12.5px',color: bold ? '#F4F1EA' : '#9C9FB0', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize:'12.5px',fontWeight: bold ? 800 : 600, color:'#F4F1EA' }}>${Number(v||0).toFixed(2)}</span>
    </div>
  );
}

function SRow({ label, v, bold }) {
  return (
    <div style={{ display:'flex',justifyContent:'space-between',padding:'4px 0' }}>
      <span style={{ fontSize:'13px',color: bold ? '#F4F1EA' : '#9C9FB0', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize:'13px',fontWeight: bold ? 800 : 600, color: bold ? '#20D179' : '#F4F1EA' }}>{v}</span>
    </div>
  );
}
