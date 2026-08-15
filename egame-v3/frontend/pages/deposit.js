import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useWallet } from '../lib/useWallet';
import WalletConnect from '../components/WalletConnect';
import { api } from '../lib/api';

const PROVIDERS = [
  { key: 'bkash',  name: 'bKash',  icon: '🟣', color: '#E2136E' },
  { key: 'nagad',  name: 'Nagad',  icon: '🟠', color: '#F7941D' },
  { key: 'rocket', name: 'Rocket', icon: '🔵', color: '#8B2FC9' },
  { key: 'upay',   name: 'Upay',   icon: '🟢', color: '#00A651' },
];

const BDT_TO_USD = 0.0091;

export default function DepositPage() {
  const wallet = useWallet();
  const [balance, setBalance] = useState(null);
  const [tab, setTab] = useState('deposit');
  const [provider, setProvider] = useState('bkash');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState('pick'); // pick → instruction → submit → done
  const [account, setAccount] = useState(null);
  const [trxId, setTrxId] = useState('');
  const [senderNum, setSenderNum] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const ssRef = useRef();

  function toast(msg, ok=true) { setFlash({msg,ok}); setTimeout(()=>setFlash(null),5000); }

  function loadData() {
    if (!wallet.isConnected) return;
    api.getBalance().then(setBalance).catch(()=>{});
    api.getMyDeposits().then(setDeposits).catch(()=>{});
    api.getMyWithdrawals().then(setWithdrawals).catch(()=>{});
  }
  useEffect(loadData, [wallet.isConnected]);

  if (!wallet.isConnected) return <WalletConnect onConnected={()=>{}} />;

  const usdPreview = amount ? (parseFloat(amount)*BDT_TO_USD).toFixed(2) : null;
  const prov = PROVIDERS.find(p=>p.key===provider);

  async function getAccount() {
    if (!amount || parseFloat(amount)<10) { toast('সর্বনিম্ন ১০ টাকা',''); return; }
    setLoading(true);
    try {
      const acc = await api.getRandomAccount(provider);
      setAccount(acc);
      setStep('instruction');
    } catch(e) { toast(e.message, false); }
    finally { setLoading(false); }
  }

  async function submitDeposit() {
    if (!trxId.trim()) { toast('Transaction ID দিন', false); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('provider', provider);
      fd.append('toNumber', account.number);
      fd.append('amountBDT', amount);
      fd.append('trxId', trxId.trim());
      fd.append('senderNumber', senderNum);
      if (screenshot) fd.append('screenshot', screenshot);
      await api.submitDeposit(fd);
      setStep('done');
      toast('জমা সফল! Admin verify করার পর credit হবে।');
      loadData();
    } catch(e) { toast(e.message, false); }
    finally { setLoading(false); }
  }

  function reset() { setStep('pick'); setAccount(null); setTrxId(''); setSenderNum(''); setScreenshot(null); setAmount(''); }

  return (
    <div className="page">
      <header className="hdr">
        <Link href="/" className="back">← Back</Link>
        <h1>💳 Wallet</h1>
        <div className="balChip">${(balance?.balance||0).toFixed(2)} <span>USD</span></div>
      </header>

      {flash && <div className={`flash ${flash.ok===false?'err':'ok'}`}>{flash.msg}</div>}

      <div className="bigTabs">
        <button className={tab==='deposit'?'on':''} onClick={()=>{setTab('deposit');reset();}}>📥 Deposit</button>
        <button className={tab==='withdraw'?'on':''} onClick={()=>setTab('withdraw')}>📤 Withdraw</button>
        <button className={tab==='history'?'on':''} onClick={()=>setTab('history')}>🕑 History</button>
      </div>

      {/* ── DEPOSIT TAB ── */}
      {tab==='deposit' && (
        <div className="body">
          {step==='pick' && (
            <>
              <p className="hint">যে provider-এ টাকা পাঠাবেন সেটি সিলেক্ট করুন।</p>
              <div className="provGrid">
                {PROVIDERS.map(p=>(
                  <button key={p.key} className={`provBtn ${provider===p.key?'sel':''}`}
                    style={provider===p.key?{borderColor:p.color,background:p.color+'18'}:{}}
                    onClick={()=>setProvider(p.key)}>
                    <span className="pIco">{p.icon}</span>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
              <label className="lbl">পরিমাণ (BDT — টাকা)</label>
              <div className="amtBox">
                <span className="amtPfx">৳</span>
                <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" min="10" />
              </div>
              {usdPreview && <p className="usdPrev">≈ ${usdPreview} USD</p>}
              <button className="mainBtn" onClick={getAccount} disabled={loading}>
                {loading?'Loading…':`পরবর্তী — ${prov.name} নম্বর দেখুন →`}
              </button>
            </>
          )}

          {step==='instruction' && account && (
            <div className="instrBox">
              <div className="instrHead" style={{background: prov.color+'22', borderColor: prov.color+'44'}}>
                <span className="instrIco">{prov.icon}</span>
                <div>
                  <p className="instrLabel">{prov.name}-এ পাঠান</p>
                  <p className="instrNum">{account.number}</p>
                  {account.holderName && <p className="instrHolder">{account.holderName}</p>}
                </div>
                <button className="copyBtn" onClick={()=>{navigator.clipboard.writeText(account.number); toast('নম্বর copy হয়েছে!');}}>📋 Copy</button>
              </div>
              <div className="instrAmt">
                <span>পরিমাণ</span>
                <span className="instrAmtVal">৳{parseFloat(amount).toLocaleString()}</span>
              </div>
              <div className="instrSteps">
                <p>১. {prov.name} app খুলুন</p>
                <p>২. "Send Money" বা "Payment" সিলেক্ট করুন</p>
                <p>৩. উপরের নম্বরে ৳{amount} পাঠান</p>
                <p>৪. Transaction ID নিচে দিন</p>
              </div>

              <label className="lbl">Transaction ID (TrxID)</label>
              <input value={trxId} onChange={e=>setTrxId(e.target.value)} placeholder="e.g. 8N3K2A9L1M" />

              <label className="lbl">আপনার {prov.name} নম্বর (optional)</label>
              <input value={senderNum} onChange={e=>setSenderNum(e.target.value)} placeholder="01XXXXXXXXX" />

              <label className="lbl">Screenshot (optional — দ্রুত verify হয়)</label>
              <div className="fileBox" onClick={()=>ssRef.current?.click()}>
                {screenshot ? `✓ ${screenshot.name}` : '📷 Screenshot সংযুক্ত করুন'}
                <input ref={ssRef} type="file" accept="image/*" hidden onChange={e=>setScreenshot(e.target.files[0])} />
              </div>

              <button className="mainBtn" onClick={submitDeposit} disabled={loading}>
                {loading ? 'Submitting…' : '✓ Submit করুন'}
              </button>
              <button className="ghostBtn" onClick={reset}>← পিছে যান</button>
            </div>
          )}

          {step==='done' && (
            <div className="doneBox">
              <div className="doneIcon">✓</div>
              <h3>Deposit Request জমা হয়েছে!</h3>
              <p className="hint">Admin verify করার পর আপনার wallet-এ টাকা যোগ হবে। সাধারণত ১-২ ঘণ্টার মধ্যে হয়।</p>
              <button className="mainBtn" onClick={reset}>আবার Deposit করুন</button>
            </div>
          )}
        </div>
      )}

      {/* ── WITHDRAW TAB ── */}
      {tab==='withdraw' && <WithdrawTab balance={balance} toast={toast} onDone={loadData} />}

      {/* ── HISTORY TAB ── */}
      {tab==='history' && (
        <div className="body">
          <h3 className="secTitle">Deposit History</h3>
          {deposits.length===0 ? <p className="hint">কোনো deposit নেই।</p> : deposits.slice(0,20).map(d=>(
            <div key={d.id} className="histRow">
              <span className="histIco">{PROVIDERS.find(p=>p.key===d.provider)?.icon||'💳'}</span>
              <div className="histInfo">
                <span className="histTitle">{d.provider} ৳{Number(d.amount_bdt).toLocaleString()}</span>
                <span className="histDate">{new Date(d.created_at).toLocaleDateString('bn-BD')}</span>
                {d.trx_id && <span className="histTrx">TrxID: {d.trx_id}</span>}
              </div>
              <div>
                <span className="histUsd">${Number(d.amount_usd).toFixed(2)}</span>
                <span className={`histSt st-${d.status}`}>{d.status==='approved'?'✓ Approved':d.status==='pending'?'⏳ Pending':'✕ Rejected'}</span>
              </div>
            </div>
          ))}

          <h3 className="secTitle">Withdraw History</h3>
          {withdrawals.length===0 ? <p className="hint">কোনো withdrawal নেই।</p> : withdrawals.slice(0,20).map(w=>(
            <div key={w.id} className="histRow">
              <span className="histIco">{PROVIDERS.find(p=>p.key===w.provider)?.icon||'💸'}</span>
              <div className="histInfo">
                <span className="histTitle">{w.provider} → {w.to_number}</span>
                <span className="histDate">{new Date(w.created_at).toLocaleDateString('bn-BD')}</span>
                {w.trx_id && <span className="histTrx">TrxID: {w.trx_id}</span>}
              </div>
              <div>
                <span className="histUsd">-${Number(w.amount_usd).toFixed(2)}</span>
                <span className={`histSt st-${w.status}`}>{w.status==='completed'?'✓ Sent':w.status==='pending'?'⏳ Pending':'✕ Rejected'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .page{max-width:440px;margin:0 auto;padding:18px 14px 80px;color:#F4F1EA;font-family:system-ui,sans-serif;}
        .hdr{display:flex;align-items:center;gap:12px;margin-bottom:18px;}
        .back{color:#9C9FB0;font-size:13px;}
        h1{margin:0;font-size:20px;flex:1;}
        .balChip{background:rgba(32,209,121,.15);color:#20D179;padding:6px 12px;border-radius:999px;font:700 14px system-ui;}
        .balChip span{font-weight:400;color:#9C9FB0;font-size:11px;}
        .flash{padding:10px 14px;border-radius:10px;margin-bottom:14px;font-size:13px;animation:fu .2s ease;}
        .flash.ok{background:rgba(32,209,121,.15);color:#20D179;}
        .flash.err{background:rgba(240,79,122,.15);color:#F04F7A;}
        @keyframes fu{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}
        .bigTabs{display:flex;gap:6px;margin-bottom:18px;}
        .bigTabs button{flex:1;padding:11px;border-radius:11px;border:1px solid #262a3a;background:#14161F;color:#9C9FB0;font:600 13px system-ui;cursor:pointer;transition:all .15s;}
        .bigTabs button.on{border-color:#FF7A1A;color:#FF7A1A;background:rgba(255,122,26,.08);}
        .body{animation:fu .2s ease;}
        .hint{color:#9C9FB0;font-size:12.5px;margin:0 0 14px;}
        .lbl{display:block;font-size:11.5px;color:#9C9FB0;margin:12px 0 5px;}
        .provGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px;}
        .provBtn{display:flex;align-items:center;gap:8px;padding:12px;border-radius:11px;border:1px solid #262a3a;background:#14161F;color:#9C9FB0;font:600 13px system-ui;cursor:pointer;transition:all .15s;}
        .pIco{font-size:20px;}
        .amtBox{position:relative;display:flex;align-items:center;margin-bottom:6px;}
        .amtPfx{position:absolute;left:13px;color:#9C9FB0;font-size:17px;pointer-events:none;}
        input{background:#14161F;border:1px solid #262a3a;color:#F4F1EA;padding:11px 12px 11px 32px;border-radius:10px;font-size:18px;font-weight:700;width:100%;box-sizing:border-box;transition:border-color .15s;margin-bottom:6px;}
        input:focus{outline:none;border-color:#FF7A1A;}
        .usdPrev{color:#20D179;font-size:12px;margin:0 0 14px;}
        .mainBtn{width:100%;padding:13px;border-radius:12px;border:none;background:#FF7A1A;color:#101014;font:700 14px system-ui;cursor:pointer;margin-top:12px;transition:transform .12s,box-shadow .12s;}
        .mainBtn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 18px #FF7A1A44;}
        .mainBtn:disabled{opacity:.6;}
        .ghostBtn{width:100%;margin-top:8px;padding:11px;border-radius:10px;border:1px solid #262a3a;background:transparent;color:#9C9FB0;font:600 13px system-ui;cursor:pointer;}
        .instrBox{background:#14161F;border:1px solid #262a3a;border-radius:14px;padding:16px;animation:fu .2s ease;}
        .instrHead{display:flex;align-items:center;gap:12px;padding:14px;border-radius:10px;border:1px solid;margin-bottom:14px;}
        .instrIco{font-size:30px;flex-shrink:0;}
        .instrLabel{margin:0 0 2px;font-size:11px;color:rgba(0,0,0,.65);}
        .instrNum{margin:0;font-size:22px;font-weight:900;color:#101014;letter-spacing:.03em;}
        .instrHolder{margin:2px 0 0;font-size:12px;color:rgba(0,0,0,.6);}
        .copyBtn{margin-left:auto;padding:7px 12px;border-radius:8px;border:none;background:rgba(0,0,0,.15);color:#101014;font:600 12px system-ui;cursor:pointer;flex-shrink:0;}
        .instrAmt{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #262a3a;margin-bottom:12px;font-size:13px;color:#9C9FB0;}
        .instrAmtVal{font-size:18px;font-weight:800;color:#F4F1EA;}
        .instrSteps{background:#0B0D14;border-radius:9px;padding:12px;margin-bottom:14px;}
        .instrSteps p{margin:4px 0;font-size:13px;color:#9C9FB0;}
        .fileBox{background:#0B0D14;border:1px dashed #262a3a;border-radius:10px;padding:12px;text-align:center;color:#9C9FB0;font-size:12.5px;cursor:pointer;margin-bottom:8px;}
        .doneBox{text-align:center;padding:30px 0;}
        .doneIcon{width:60px;height:60px;border-radius:50%;background:rgba(32,209,121,.15);color:#20D179;font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;}
        .doneBox h3{margin:0 0 8px;font-size:18px;}
        .secTitle{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#9C9FB0;margin:20px 0 10px;}
        .histRow{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#14161F;border-radius:10px;margin-bottom:6px;}
        .histIco{font-size:22px;flex-shrink:0;}
        .histInfo{flex:1;display:flex;flex-direction:column;gap:2px;}
        .histTitle{font-size:13px;font-weight:600;}
        .histDate{font-size:11px;color:#9C9FB0;}
        .histTrx{font-size:10.5px;color:#9C9FB0;font-family:monospace;}
        .histUsd{display:block;font-size:14px;font-weight:700;text-align:right;}
        .histSt{display:block;font-size:10.5px;text-align:right;}
        .st-approved,.st-completed{color:#20D179;}
        .st-pending{color:#F0A94F;}
        .st-rejected{color:#F04F7A;}
      `}</style>
    </div>
  );
}

function WithdrawTab({ balance, toast, onDone }) {
  const [provider, setProvider] = useState('bkash');
  const [toNumber, setToNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [amountUSD, setAmountUSD] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const BDT_PREVIEW = amountUSD ? Math.round(parseFloat(amountUSD)/0.0091).toLocaleString() : null;
  const prov = PROVIDERS.find(p=>p.key===provider);

  async function submit() {
    if (!toNumber || !amountUSD) { toast('সব তথ্য দিন', false); return; }
    if (parseFloat(amountUSD) < 1) { toast('সর্বনিম্ন $1', false); return; }
    if (parseFloat(amountUSD) > (balance?.balance||0)) { toast('Balance কম!', false); return; }
    setLoading(true);
    try {
      await api.submitWithdraw({ provider, toNumber, holderName, amountUSD: parseFloat(amountUSD) });
      setDone(true);
      toast('Withdrawal request জমা হয়েছে!');
      onDone();
    } catch(e) { toast(e.message, false); }
    finally { setLoading(false); }
  }

  if (done) return (
    <div className="doneBox">
      <div className="doneIcon">✓</div>
      <h3>Request জমা হয়েছে!</h3>
      <p style={{color:'#9C9FB0',fontSize:'13px'}}>Admin verify করার পর আপনার {prov.name} নম্বরে পাঠানো হবে।</p>
      <button onClick={()=>setDone(false)} style={{marginTop:'14px',width:'100%',padding:'12px',borderRadius:'11px',border:'none',background:'#FF7A1A',color:'#101014',font:'700 14px system-ui',cursor:'pointer'}}>আবার Withdraw করুন</button>
      <style jsx>{`.doneBox{text-align:center;padding:30px 0;}.doneIcon{width:60px;height:60px;border-radius:50%;background:rgba(32,209,121,.15);color:#20D179;font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;}`}</style>
    </div>
  );

  return (
    <div>
      <p style={{color:'#9C9FB0',fontSize:'12.5px',marginBottom:'14px'}}>আপনার balance: <strong style={{color:'#20D179'}}>${(balance?.balance||0).toFixed(2)}</strong></p>
      <div className="pg">
        {PROVIDERS.map(p=>(
          <button key={p.key} className={`pb ${provider===p.key?'s':''}`} style={provider===p.key?{borderColor:p.color}:{}} onClick={()=>setProvider(p.key)}>
            {p.icon} {p.name}
          </button>
        ))}
      </div>
      <label className="lb">আপনার {prov.name} নম্বর</label>
      <input value={toNumber} onChange={e=>setToNumber(e.target.value)} placeholder="01XXXXXXXXX" style={{background:'#14161F',border:'1px solid #262a3a',color:'#F4F1EA',padding:'11px 12px',borderRadius:'10px',fontSize:'15px',width:'100%',boxSizing:'border-box',marginBottom:'8px'}} />
      <label className="lb">নাম (optional)</label>
      <input value={holderName} onChange={e=>setHolderName(e.target.value)} placeholder="Account holder name" style={{background:'#14161F',border:'1px solid #262a3a',color:'#F4F1EA',padding:'11px 12px',borderRadius:'10px',fontSize:'14px',width:'100%',boxSizing:'border-box',marginBottom:'8px'}} />
      <label className="lb">পরিমাণ (USD)</label>
      <input type="number" value={amountUSD} onChange={e=>setAmountUSD(e.target.value)} placeholder="0.00" min="1" style={{background:'#14161F',border:'1px solid #262a3a',color:'#F4F1EA',padding:'11px 12px',borderRadius:'10px',fontSize:'20px',fontWeight:'700',width:'100%',boxSizing:'border-box',marginBottom:'6px'}} />
      {BDT_PREVIEW && <p style={{color:'#9C9FB0',fontSize:'12px',marginBottom:'14px'}}>≈ ৳{BDT_PREVIEW} BDT</p>}
      <button onClick={submit} disabled={loading} style={{width:'100%',padding:'13px',borderRadius:'12px',border:'none',background:'#FF7A1A',color:'#101014',font:'700 14px system-ui',cursor:'pointer',marginTop:'8px',opacity:loading?.6:1}}>
        {loading?'Processing…':'Withdraw করুন'}
      </button>
      <style jsx>{`
        .pg{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;}
        .pb{display:flex;align-items:center;gap:6px;padding:10px;border-radius:10px;border:1px solid #262a3a;background:#14161F;color:#9C9FB0;font:600 13px system-ui;cursor:pointer;}
        .pb.s{color:#F4F1EA;}
        .lb{display:block;font-size:11.5px;color:#9C9FB0;margin:0 0 5px;}
      `}</style>
    </div>
  );
}
