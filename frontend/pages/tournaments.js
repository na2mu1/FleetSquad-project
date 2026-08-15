import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '../lib/useWallet';
import { api } from '../lib/api';

const GAMES = ['free_fire','pubg_mobile','efootball','other'];
const GAME_CFG = {
  free_fire:   { label:'🔥 Free Fire',   color:'#FF7A1A', bg:'linear-gradient(135deg,#FF7A1A,#FF3D2E)' },
  pubg_mobile: { label:'🪖 PUBG Mobile', color:'#D8B65A', bg:'linear-gradient(135deg,#D8B65A,#8C6D2F)' },
  efootball:   { label:'⚽ eFootball',   color:'#20D179', bg:'linear-gradient(135deg,#20D179,#0E8F52)' },
  other:       { label:'🎮 Other',       color:'#4FA9F0', bg:'linear-gradient(135deg,#4FA9F0,#2060B0)' },
};
const STATUS_CFG = {
  open:        { label:'✅ Registration Open', color:'#20D179' },
  in_progress: { label:'🔴 Live',              color:'#F04F7A' },
  completed:   { label:'✓ Completed',          color:'#9C9FB0' },
  cancelled:   { label:'✕ Cancelled',          color:'#9C9FB0' },
};

export default function Tournaments() {
  const wallet = useWallet();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    api.listTournaments(filter ? { status: filter } : {}).then(setList).finally(() => setLoading(false));
  }
  useEffect(() => { setLoading(true); load(); }, [filter]);

  const myId = wallet.token ? (() => { try { return JSON.parse(atob(wallet.token.split('.')[1])).userId; } catch { return null; } })() : null;

  return (
    <div className="page">
      <header className="hdr">
        <div>
          <h1>🏆 Tournaments</h1>
          <p className="sub">যে কেউ tournament create করতে পারবে</p>
        </div>
        <Link href="/" className="back">← Market</Link>
      </header>

      <div className="topBar">
        <div className="filters">
          {[['','All'],['open','Open'],['in_progress','Live'],['completed','Done']].map(([v,l])=>(
            <button key={v} className={filter===v?'on':''} onClick={()=>setFilter(v)}>{l}</button>
          ))}
        </div>
        {wallet.isConnected && (
          <button className="createBtn" onClick={()=>setShowCreate(s=>!s)}>
            {showCreate ? '✕' : '+ Create'}
          </button>
        )}
      </div>

      {showCreate && <CreateForm onCreated={()=>{ setShowCreate(false); load(); }} />}

      {loading ? (
        <div className="skels">{[...Array(3)].map((_,i)=><div key={i} className="skel" />)}</div>
      ) : list.length === 0 ? (
        <div className="empty">
          <p>কোনো tournament নেই।</p>
          {wallet.isConnected && <button className="createBtn2" onClick={()=>setShowCreate(true)}>প্রথম tournament বানান</button>}
        </div>
      ) : (
        <div className="grid">
          {list.map(t => <TCard key={t.id} t={t} myId={myId} />)}
        </div>
      )}

      <style jsx>{`
        .page{max-width:680px;margin:0 auto;padding:22px 14px 60px;color:#F4F1EA;font-family:system-ui,sans-serif;}
        .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;}
        h1{margin:0 0 2px;font-size:22px;} .sub{margin:0;font-size:12px;color:#9C9FB0;}
        .back{color:#9C9FB0;font-size:13px;margin-top:4px;}
        .topBar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;flex-wrap:wrap;}
        .filters{display:flex;gap:5px;flex-wrap:wrap;}
        .filters button{padding:7px 12px;border-radius:999px;border:1px solid #262a3a;background:transparent;color:#9C9FB0;font:600 11.5px system-ui;cursor:pointer;transition:all .14s;}
        .filters button.on{background:#FF7A1A;color:#101014;border-color:#FF7A1A;}
        .createBtn{padding:9px 16px;border-radius:10px;border:none;background:#FF7A1A;color:#101014;font:700 13px system-ui;cursor:pointer;white-space:nowrap;}
        .createBtn2{margin-top:12px;padding:10px 20px;border-radius:10px;border:none;background:#FF7A1A;color:#101014;font:700 13px system-ui;cursor:pointer;}
        .skels{display:flex;flex-direction:column;gap:10px;}
        .skel{height:160px;background:#14161F;border-radius:14px;animation:pulse 1.4s infinite;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.5;}}
        .empty{text-align:center;padding:50px 0;color:#9C9FB0;}
        .grid{display:flex;flex-direction:column;gap:12px;}
      `}</style>
    </div>
  );
}

function TCard({ t, myId }) {
  const g = GAME_CFG[t.game] || GAME_CFG.other;
  const s = STATUS_CFG[t.status] || STATUS_CFG.open;
  const spotsLeft = t.max_players - (t.player_count || 0);
  const isCreator = myId === t.created_by;
  return (
    <Link href={`/tournament/${t.id}`} className="card">
      <div className="banner" style={{background:g.bg}}>
        <div className="bannerInfo">
          <span className="gLabel">{g.label}</span>
          <span className="status" style={{color:s.color}}>{s.label}</span>
        </div>
        {isCreator && <span className="creatorBadge">👑 You created</span>}
      </div>
      <div className="body">
        <h3>{t.title}</h3>
        <p className="creator">by {t.creator_name}</p>
        <div className="meta">
          <span>👥 {t.player_count}/{t.max_players}</span>
          <span style={{color:spotsLeft<=3?'#F04F7A':'#9C9FB0'}}>{spotsLeft>0?`${spotsLeft} spots left`:'Full'}</span>
        </div>
        <div className="fees">
          <div className="feeBox"><span>Entry</span><strong style={{color:'#F0A94F'}}>{t.entry_fee_usd>0?`$${Number(t.entry_fee_usd).toFixed(2)}`:'FREE'}</strong></div>
          <div className="feeBox"><span>Prize Pool</span><strong style={{color:'#20D179'}}>${Number(t.prize_pool_usd).toFixed(2)}</strong></div>
          <div className="feeBox"><span>Format</span><strong style={{color:'#4FA9F0'}}>{t.max_players}-player</strong></div>
        </div>
      </div>
      <style jsx>{`
        .card{display:block;text-decoration:none;color:#F4F1EA;background:#14161F;border:1px solid #262a3a;border-radius:14px;overflow:hidden;
          animation:cardIn .3s cubic-bezier(.22,1,.36,1) both;transition:transform .15s,border-color .15s,box-shadow .15s;}
        @keyframes cardIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
        .card:hover{transform:translateY(-3px);border-color:${g.color}55;box-shadow:0 6px 24px rgba(0,0,0,.35);}
        .banner{height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;position:relative;}
        .bannerInfo{display:flex;flex-direction:column;gap:2px;}
        .gLabel{font:700 11px system-ui;text-transform:uppercase;letter-spacing:.07em;color:rgba(0,0,0,.7);}
        .status{font-size:12px;font-weight:700;}
        .creatorBadge{background:rgba(0,0,0,.25);color:rgba(255,255,255,.9);font:700 10px system-ui;padding:3px 8px;border-radius:999px;}
        .body{padding:12px 14px 14px;}
        h3{margin:0 0 2px;font-size:15px;}
        .creator{margin:0 0 8px;font-size:11.5px;color:#9C9FB0;}
        .meta{display:flex;gap:12px;font-size:12px;color:#9C9FB0;margin-bottom:10px;flex-wrap:wrap;}
        .fees{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
        .feeBox{background:#0B0D14;border-radius:8px;padding:7px 9px;}
        .feeBox span{display:block;font-size:9.5px;color:#9C9FB0;margin-bottom:2px;text-transform:uppercase;letter-spacing:.05em;}
        .feeBox strong{display:block;font-size:14px;}
      `}</style>
    </Link>
  );
}

function CreateForm({ onCreated }) {
  const [form, setForm] = useState({ title:'', game:'free_fire', maxPlayers:'8', entryFeeUSD:'0', description:'', rules:'' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const res = await api.createTournament(form);
      window.location.href = `/tournament/${res.id}`;
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <form className="cForm" onSubmit={submit}>
      <h3>New Tournament</h3>
      <div className="r2">
        <div>
          <label>Title</label>
          <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Tournament name" required />
        </div>
        <div>
          <label>Game</label>
          <select value={form.game} onChange={e=>setForm(f=>({...f,game:e.target.value}))}>
            {GAMES.map(g=><option key={g} value={g}>{GAME_CFG[g].label}</option>)}
          </select>
        </div>
      </div>
      <div className="r2">
        <div>
          <label>Max Players</label>
          <select value={form.maxPlayers} onChange={e=>setForm(f=>({...f,maxPlayers:e.target.value}))}>
            {[4,8,16,32,64].map(n=><option key={n} value={n}>{n} players</option>)}
          </select>
        </div>
        <div>
          <label>Entry Fee (USD)</label>
          <input type="number" min="0" step="0.01" value={form.entryFeeUSD} onChange={e=>setForm(f=>({...f,entryFeeUSD:e.target.value}))} placeholder="0 = free" />
        </div>
      </div>
      {parseFloat(form.entryFeeUSD)>0 && (
        <div className="prizeNote">
          <span>💰 Prize pool: 85% winner + 3% you + 12% platform</span>
          <span>Estimated winner prize: ${(parseFloat(form.entryFeeUSD)*(parseFloat(form.maxPlayers)||8)*0.85).toFixed(2)}</span>
        </div>
      )}
      <label>Description (optional)</label>
      <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Tournament description…" rows={2} />
      <label>Rules (optional)</label>
      <textarea value={form.rules} onChange={e=>setForm(f=>({...f,rules:e.target.value}))} placeholder="Match rules, format, etc." rows={2} />
      {err && <p className="err">{err}</p>}
      <button type="submit" disabled={loading}>{loading?'Creating…':'Create Tournament'}</button>
      <style jsx>{`
        .cForm{background:#14161F;border:1px solid #262a3a;border-radius:14px;padding:18px;margin-bottom:16px;animation:fu .2s ease;}
        @keyframes fu{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:none;}}
        h3{margin:0 0 14px;font-size:16px;}
        label{display:block;font-size:11.5px;color:#9C9FB0;margin:10px 0 4px;}
        input,select,textarea{background:#0B0D14;border:1px solid #262a3a;color:#F4F1EA;padding:10px 11px;border-radius:9px;font-size:13px;width:100%;box-sizing:border-box;transition:border-color .15s;}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#FF7A1A;}
        textarea{resize:vertical;}
        .r2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px;}
        .prizeNote{background:rgba(32,209,121,.08);border:1px solid rgba(32,209,121,.2);border-radius:9px;padding:10px 12px;margin:8px 0;display:flex;flex-direction:column;gap:3px;font-size:12px;color:#20D179;}
        .err{color:#F04F7A;font-size:12.5px;background:rgba(240,79,122,.1);padding:8px 12px;border-radius:8px;}
        button{width:100%;margin-top:14px;padding:13px;border-radius:12px;border:none;background:#FF7A1A;color:#101014;font:700 14px system-ui;cursor:pointer;}
        button:disabled{opacity:.6;}
      `}</style>
    </form>
  );
}
