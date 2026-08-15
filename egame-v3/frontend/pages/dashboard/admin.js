import { useEffect, useState } from 'react';
import { useWallet } from '../../lib/useWallet';
import WalletConnect from '../../components/WalletConnect';
import { api } from '../../lib/api';

const SEVERITY_COLOR = { low: '#9C9FB0', medium: '#F0A94F', high: '#F04F7A' };
const GAMES = ['free_fire','pubg_mobile','efootball','other'];
const GAME_LABELS = { free_fire:'🔥 Free Fire', pubg_mobile:'🪖 PUBG Mobile', efootball:'⚽ eFootball', other:'🎮 Other' };
const STATUS_FLOW = { upcoming:['registration','cancelled'], registration:['ongoing','cancelled'], ongoing:['completed','cancelled'] };

export default function AdminDashboard() {
  const wallet = useWallet();
  const [tab, setTab] = useState('tournaments');
  const [isAdmin, setIsAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);

  // Tournaments
  const [tournaments, setTournaments] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingT, setEditingT] = useState(null); // tournament being edited
  const [resultModal, setResultModal] = useState(null); // tournament for result entry
  const [placements, setPlacements] = useState([{ userId:'', placement:1, prizeUSD:0 }]);

  // Disputes & fraud
  const [disputes, setDisputes] = useState([]);
  const [fraudLogs, setFraudLogs] = useState([]);
  const [resolving, setResolving] = useState(null);

  // Create/edit form state
  const emptyForm = { title:'', game:'free_fire', description:'', entryFeeUSD:'0', prizePrizePool:'0',
    prizeBreakdown:[{place:1,amount:0},{place:2,amount:0},{place:3,amount:0}],
    maxPlayers:'32', startAt:'', endAt:'', rules:'' };
  const [form, setForm] = useState(emptyForm);

  function toast(msg, ok=true) { setFlash({msg,ok}); setTimeout(()=>setFlash(null),4000); }

  async function load() {
    try {
      const [ts, ds, fl] = await Promise.all([
        api.adminGetTournaments(),
        api.adminDisputes(),
        api.adminFraudLogs(),
      ]);
      setTournaments(ts); setDisputes(ds); setFraudLogs(fl);
      setIsAdmin(true);
    } catch(e) {
      if (e.message?.includes('Admin')) setIsAdmin(false);
      else toast(e.message, false);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (wallet.isConnected) load(); }, [wallet.isConnected]);

  if (!wallet.isConnected) return <WalletConnect onConnected={()=>{}} />;
  if (isAdmin === false) return (
    <div className="denied"><h1>🚫 Admin Only</h1><p>এই page-এ আপনার access নেই।</p>
      <style jsx>{`.denied{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#F4F1EA;gap:8px;}`}</style>
    </div>
  );

  // ── Tournament CRUD ───────────────────────────────────────────────────────
  async function handleCreateTournament(e) {
    e.preventDefault();
    try {
      await api.adminCreateTournament({
        title: form.title, game: form.game, description: form.description,
        entryFeeUSD: parseFloat(form.entryFeeUSD||0),
        prizePrizePool: parseFloat(form.prizePrizePool||0),
        prizeBreakdown: form.prizeBreakdown.filter(p=>p.amount>0),
        maxPlayers: parseInt(form.maxPlayers||32),
        startAt: form.startAt, endAt: form.endAt||undefined, rules: form.rules||undefined,
      });
      toast('Tournament created ✓'); setShowCreateForm(false); setForm(emptyForm); load();
    } catch(e) { toast(e.message,false); }
  }

  async function handleUpdateStatus(id, status) {
    try {
      await api.adminUpdateTournament(id, { status });
      toast(`Status → ${status}`); load();
    } catch(e) { toast(e.message,false); }
  }

  async function handleCancel(id) {
    if (!confirm('Cancel করলে সব entry fee refund হবে। নিশ্চিত?')) return;
    try {
      const r = await api.adminCancelTournament(id);
      toast(`Cancelled. ${r.refundCount} refunds processed.`); load();
    } catch(e) { toast(e.message,false); }
  }

  async function handleSetResults() {
    const valid = placements.filter(p => p.userId && p.placement);
    if (valid.length === 0) { toast('কমপক্ষে একটি placement দিন', false); return; }
    try {
      const r = await api.adminSetResults(resultModal.id, valid.map(p=>({
        userId: p.userId, placement: parseInt(p.placement), prizeUSD: parseFloat(p.prizeUSD||0)
      })));
      toast(`Results set! ${r.payouts.length} prizes paid out.`);
      setResultModal(null); load();
    } catch(e) { toast(e.message,false); }
  }

  async function handleEditSave(id) {
    try {
      await api.adminUpdateTournament(id, {
        title: editingT.title, entryFeeUSD: editingT.entry_fee_usd,
        prizePrizePool: editingT.prize_pool_usd, maxPlayers: editingT.max_players,
        startAt: editingT.start_at, endAt: editingT.end_at, rules: editingT.rules,
        prizeBreakdown: Array.isArray(editingT.prize_breakdown) ? editingT.prize_breakdown : JSON.parse(editingT.prize_breakdown||'[]'),
      });
      toast('Saved ✓'); setEditingT(null); load();
    } catch(e) { toast(e.message,false); }
  }

  // ── Disputes ─────────────────────────────────────────────────────────────
  async function handleResolve(disputeId, resolution) {
    try {
      await api.adminResolveDispute(disputeId, resolution, resolving?.note||'');
      toast(`Resolved: ${resolution==='resolved_buyer'?'Refunded to buyer':'Released to seller'}`);
      setResolving(null); load();
    } catch(e) { toast(e.message,false); }
  }

  const openDisputes = disputes.filter(d=>d.status==='open');
  const closedDisputes = disputes.filter(d=>d.status!=='open');
  const totalFees = tournaments.reduce((s,t)=>s+(t.total_fees_collected||0),0);
  const activeTournaments = tournaments.filter(t=>['registration','ongoing'].includes(t.status)).length;

  return (
    <div className="page">
      <header className="head">
        <h1>⚙️ Admin Dashboard</h1>
        <p className="addr">{wallet.address}</p>
      </header>

      {flash && <div className={`flash ${flash.ok?'ok':'err'}`}>{flash.msg}</div>}

      {/* Stats */}
      <div className="statsRow">
        <Stat label="Tournaments" value={tournaments.length} color="#FF7A1A" />
        <Stat label="Active now" value={activeTournaments} color="#20D179" />
        <Stat label="Open disputes" value={openDisputes.length} color="#F04F7A" />
        <Stat label="Total fees" value={`$${totalFees.toFixed(0)}`} color="#4FA9F0" />
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['tournaments','🏆 Tournaments'],['disputes','⚠️ Disputes'],['fraud','🔍 Fraud']].map(([k,l])=>(
          <button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {loading && <p className="hint">Loading…</p>}

      {/* ── TOURNAMENTS TAB ── */}
      {!loading && tab==='tournaments' && (
        <div>
          <div className="sectionHead">
            <h3>Tournaments</h3>
            <button className="createBtn" onClick={()=>{ setShowCreateForm(s=>!s); setForm(emptyForm); }}>
              {showCreateForm ? '✕ Cancel' : '+ New Tournament'}
            </button>
          </div>

          {/* Create form */}
          {showCreateForm && (
            <form className="tForm" onSubmit={handleCreateTournament}>
              <h4>New Tournament</h4>
              <div className="row2">
                <div>
                  <Lbl>Title</Lbl>
                  <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Tournament name" required />
                </div>
                <div>
                  <Lbl>Game</Lbl>
                  <select value={form.game} onChange={e=>setForm(f=>({...f,game:e.target.value}))}>
                    {GAMES.map(g=><option key={g} value={g}>{GAME_LABELS[g]}</option>)}
                  </select>
                </div>
              </div>
              <div className="row3">
                <div>
                  <Lbl>Entry fee ($)</Lbl>
                  <input type="number" step="0.01" value={form.entryFeeUSD} onChange={e=>setForm(f=>({...f,entryFeeUSD:e.target.value}))} placeholder="0 = free" />
                </div>
                <div>
                  <Lbl>Prize pool ($)</Lbl>
                  <input type="number" step="0.01" value={form.prizePrizePool} onChange={e=>setForm(f=>({...f,prizePrizePool:e.target.value}))} />
                </div>
                <div>
                  <Lbl>Max players</Lbl>
                  <input type="number" value={form.maxPlayers} onChange={e=>setForm(f=>({...f,maxPlayers:e.target.value}))} />
                </div>
              </div>
              <Lbl>Prize breakdown</Lbl>
              {form.prizeBreakdown.map((p,i)=>(
                <div key={i} className="pbRow">
                  <span className="pbPlace">{i===0?'🥇':i===1?'🥈':'🥉'} {['1st','2nd','3rd'][i]}</span>
                  <input type="number" step="0.01" value={p.amount} placeholder="$0"
                    onChange={e=>setForm(f=>({...f,prizeBreakdown:f.prizeBreakdown.map((x,j)=>j===i?{...x,amount:parseFloat(e.target.value||0)}:x)}))} />
                </div>
              ))}
              <div className="row2">
                <div><Lbl>Start date & time</Lbl><input type="datetime-local" value={form.startAt} onChange={e=>setForm(f=>({...f,startAt:e.target.value}))} required /></div>
                <div><Lbl>End (optional)</Lbl><input type="datetime-local" value={form.endAt} onChange={e=>setForm(f=>({...f,endAt:e.target.value}))} /></div>
              </div>
              <Lbl>Rules (optional)</Lbl>
              <textarea value={form.rules} onChange={e=>setForm(f=>({...f,rules:e.target.value}))} placeholder="Tournament rules…" rows={3} />
              <button type="submit" className="submitBtn">Create Tournament</button>
            </form>
          )}

          {/* Tournament list */}
          {tournaments.length===0 ? <p className="hint">কোনো tournament নেই।</p> : (
            <div className="tList">
              {tournaments.map(t=>{
                const bd = Array.isArray(t.prize_breakdown)?t.prize_breakdown:JSON.parse(t.prize_breakdown||'[]');
                const nextStatuses = STATUS_FLOW[t.status]||[];
                const isEditing = editingT?.id===t.id;
                return (
                  <div key={t.id} className="tCard">
                    <div className="tCardHead">
                      <span className="tGame">{GAME_LABELS[t.game]}</span>
                      <span className={`tStatus s-${t.status}`}>{t.status}</span>
                    </div>
                    {isEditing ? (
                      <div className="editBlock">
                        <input value={editingT.title} onChange={e=>setEditingT(x=>({...x,title:e.target.value}))} />
                        <div className="row3">
                          <div><Lbl>Entry $</Lbl><input type="number" value={editingT.entry_fee_usd} onChange={e=>setEditingT(x=>({...x,entry_fee_usd:e.target.value}))} /></div>
                          <div><Lbl>Prize pool $</Lbl><input type="number" value={editingT.prize_pool_usd} onChange={e=>setEditingT(x=>({...x,prize_pool_usd:e.target.value}))} /></div>
                          <div><Lbl>Max</Lbl><input type="number" value={editingT.max_players} onChange={e=>setEditingT(x=>({...x,max_players:e.target.value}))} /></div>
                        </div>
                        <Lbl>Rules</Lbl>
                        <textarea value={editingT.rules||''} onChange={e=>setEditingT(x=>({...x,rules:e.target.value}))} rows={2} />
                        <div className="editActions">
                          <button className="saveBtn" onClick={()=>handleEditSave(t.id)}>Save</button>
                          <button className="ghostBtn" onClick={()=>setEditingT(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="tTitle">{t.title}</h4>
                        <div className="tMeta">
                          <span>📅 {new Date(t.start_at).toLocaleDateString()}</span>
                          <span>👥 {t.player_count}/{t.max_players}</span>
                          <span>💰 $${t.total_fees_collected?.toFixed(2)||'0.00'} collected</span>
                        </div>
                        <div className="tPrizes">
                          <span className="tEntry">Entry: {t.entry_fee_usd>0?`$${Number(t.entry_fee_usd).toFixed(2)}`:'FREE'}</span>
                          <span className="tPool">Pool: ${Number(t.prize_pool_usd).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    <div className="tActions">
                      {nextStatuses.map(s=>(
                        <button key={s} className={`tBtn ${s==='cancelled'?'danger':''}`} onClick={()=>s==='cancelled'?handleCancel(t.id):handleUpdateStatus(t.id,s)}>
                          {s==='registration'?'Open Reg':s==='ongoing'?'▶ Start':s==='completed'?'✓ End':s==='cancelled'?'✕ Cancel':s}
                        </button>
                      ))}
                      {t.status==='ongoing' && (
                        <button className="tBtn result" onClick={()=>{setResultModal(t);setPlacements([{userId:'',placement:1,prizeUSD:bd[0]?.amount||0},{userId:'',placement:2,prizeUSD:bd[1]?.amount||0},{userId:'',placement:3,prizeUSD:bd[2]?.amount||0}]);}}>
                          🏆 Set Results
                        </button>
                      )}
                      {!['completed','cancelled'].includes(t.status) && !isEditing && (
                        <button className="tBtn edit" onClick={()=>setEditingT({...t,prize_breakdown:bd})}>✏️ Edit</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DISPUTES TAB ── */}
      {!loading && tab==='disputes' && (
        <div>
          {openDisputes.length===0 && <p className="hint">Open disputes নেই 🎉</p>}
          {openDisputes.map(d=><DisputeCard key={d.id} d={d} onResolve={(id,res)=>setResolving({id,resolution:res,note:''})} />)}
          {closedDisputes.length>0 && <>
            <h3 className="secTitle">Resolved</h3>
            {closedDisputes.map(d=><DisputeCard key={d.id} d={d} readOnly />)}
          </>}
        </div>
      )}

      {/* ── FRAUD TAB ── */}
      {!loading && tab==='fraud' && (
        <div>
          {fraudLogs.length===0 ? <p className="hint">কোনো fraud flag নেই।</p> : fraudLogs.map(f=>(
            <div key={f.id} className="fraudRow">
              <span className="sev" style={{color:SEVERITY_COLOR[f.severity]||'#9C9FB0'}}>{(f.severity||'low').toUpperCase()}</span>
              <span className="rule">{f.rule_triggered}</span>
              <span className="ts">{new Date(f.created_at).toLocaleDateString()}</span>
              {f.details && <details><summary>Details</summary><pre>{JSON.stringify(typeof f.details==='string'?JSON.parse(f.details):f.details,null,2)}</pre></details>}
            </div>
          ))}
        </div>
      )}

      {/* Result modal */}
      {resultModal && (
        <div className="overlay" onClick={()=>setResultModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>🏆 Set Results — {resultModal.title}</h3>
            <p className="hint">Participant-দের wallet address বা user ID দিয়ে placements set করুন। Prize automatically wallet-এ credit হবে।</p>
            {placements.map((p,i)=>(
              <div key={i} className="placRow">
                <span className="placIcon">{['🥇','🥈','🥉'][i]||`#${i+1}`}</span>
                <input value={p.userId} onChange={e=>setPlacements(a=>a.map((x,j)=>j===i?{...x,userId:e.target.value}:x))} placeholder="User ID or wallet…" />
                <input type="number" step="0.01" value={p.prizeUSD} onChange={e=>setPlacements(a=>a.map((x,j)=>j===i?{...x,prizeUSD:e.target.value}:x))} placeholder="$ prize" className="prizeInput" />
              </div>
            ))}
            <button className="addPlacBtn" onClick={()=>setPlacements(a=>[...a,{userId:'',placement:a.length+1,prizeUSD:0}])}>+ Add placement</button>
            <button className="submitBtn" onClick={handleSetResults}>Confirm Results & Pay Prizes</button>
            <button className="ghostBtn" onClick={()=>setResultModal(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Dispute resolve modal */}
      {resolving && (
        <div className="overlay" onClick={()=>setResolving(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>Resolve Dispute</h3>
            <p className="hint">Evidence দেখে সিদ্ধান্ত নিন। হারানো পক্ষের reputation কমবে।</p>
            <Lbl>Internal note</Lbl>
            <textarea value={resolving.note} onChange={e=>setResolving(r=>({...r,note:e.target.value}))} placeholder="Resolution notes…" rows={3} />
            <div className="resolveBtns">
              <button className="refundBtn" onClick={()=>handleResolve(resolving.id,'resolved_buyer')}>💙 Refund Buyer</button>
              <button className="releaseBtn" onClick={()=>handleResolve(resolving.id,'resolved_seller')}>💚 Release to Seller</button>
            </div>
            <button className="ghostBtn" onClick={()=>setResolving(null)}>Cancel</button>
          </div>
        </div>
      )}

      <style jsx>{`
        .page { max-width:760px;margin:0 auto;padding:22px 14px 60px;color:#F4F1EA;font-family:system-ui,sans-serif; }
        .head { margin-bottom:18px; }
        h1 { margin:0 0 2px;font-size:22px; }
        .addr { margin:0;font-size:12px;color:#9C9FB0;font-family:monospace; }
        .flash { padding:10px 14px;border-radius:10px;margin-bottom:14px;font-size:13px;animation:fadeUp .2s ease; }
        .flash.ok { background:rgba(32,209,121,.15);color:#20D179; }
        .flash.err { background:rgba(240,79,122,.15);color:#F04F7A; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;} }
        .statsRow { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px; }
        .tabs { display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap; }
        .tabs button { padding:9px 16px;border-radius:999px;border:1px solid #262a3a;background:transparent;color:#9C9FB0;font:600 13px system-ui;cursor:pointer;transition:all .14s; }
        .tabs button.active { background:#262a3a;color:#F4F1EA; }
        .hint { color:#9C9FB0;font-size:13px;padding:8px 0; }
        .sectionHead { display:flex;justify-content:space-between;align-items:center;margin-bottom:14px; }
        .sectionHead h3 { margin:0;font-size:15px; }
        .createBtn { padding:9px 16px;border-radius:10px;border:none;background:#FF7A1A;color:#101014;font:700 13px system-ui;cursor:pointer; }
        .tForm { background:#14161F;border:1px solid #262a3a;border-radius:14px;padding:18px;margin-bottom:16px;animation:fadeUp .2s ease; }
        .tForm h4 { margin:0 0 14px;font-size:15px; }
        .row2 { display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px; }
        .row3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px; }
        input,select,textarea { background:#0B0D14;border:1px solid #262a3a;color:#F4F1EA;padding:9px 11px;border-radius:9px;font-size:13px;width:100%;box-sizing:border-box;transition:border-color .15s; }
        input:focus,select:focus,textarea:focus { outline:none;border-color:#FF7A1A; }
        textarea { resize:vertical;min-height:60px; }
        .pbRow { display:flex;align-items:center;gap:10px;margin-bottom:6px; }
        .pbPlace { white-space:nowrap;font-size:13px;min-width:60px; }
        .pbRow input { width:100px !important; }
        .submitBtn { width:100%;margin-top:14px;padding:12px;border-radius:11px;border:none;background:#FF7A1A;color:#101014;font:700 14px system-ui;cursor:pointer; }
        .tList { display:flex;flex-direction:column;gap:10px; }
        .tCard { background:#14161F;border:1px solid #262a3a;border-radius:13px;padding:14px;animation:fadeUp .2s ease; }
        .tCardHead { display:flex;justify-content:space-between;align-items:center;margin-bottom:8px; }
        .tGame { font:700 11px system-ui;text-transform:uppercase;letter-spacing:.06em;color:#9C9FB0; }
        .tStatus { font:700 11px system-ui;text-transform:capitalize;padding:3px 8px;border-radius:999px;background:#262a3a; }
        .tStatus.s-registration { color:#20D179;background:rgba(32,209,121,.15); }
        .tStatus.s-ongoing { color:#F04F7A;background:rgba(240,79,122,.15); }
        .tStatus.s-completed { color:#4FA9F0;background:rgba(79,169,240,.15); }
        .tTitle { margin:0 0 6px;font-size:15px; }
        .tMeta { display:flex;gap:12px;font-size:12px;color:#9C9FB0;margin-bottom:8px;flex-wrap:wrap; }
        .tPrizes { display:flex;gap:14px;margin-bottom:10px;font-size:13px; }
        .tEntry { color:#F0A94F;font-weight:700; }
        .tPool { color:#20D179;font-weight:700; }
        .tActions { display:flex;gap:6px;flex-wrap:wrap; }
        .tBtn { padding:7px 12px;border-radius:8px;border:none;font:600 12px system-ui;cursor:pointer;background:#262a3a;color:#F4F1EA;transition:opacity .1s; }
        .tBtn:hover { opacity:.85; }
        .tBtn.danger { background:rgba(240,79,122,.15);color:#F04F7A; }
        .tBtn.result { background:rgba(255,215,0,.15);color:#FFD700; }
        .tBtn.edit { background:rgba(79,169,240,.12);color:#4FA9F0; }
        .editBlock { margin-top:8px; }
        .editActions { display:flex;gap:8px;margin-top:10px; }
        .saveBtn { flex:1;padding:9px;border-radius:9px;border:none;background:#20D179;color:#101014;font:700 13px system-ui;cursor:pointer; }
        .ghostBtn { width:100%;padding:10px;border-radius:9px;border:1px solid #262a3a;background:transparent;color:#9C9FB0;font:600 13px system-ui;cursor:pointer;margin-top:6px; }
        .ghostBtn.small { width:auto;padding:7px 12px; }
        .secTitle { font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#9C9FB0;margin:18px 0 8px; }
        .fraudRow { background:#14161F;border:1px solid #262a3a;border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;flex-wrap:wrap;align-items:center;gap:8px; }
        .sev { font:700 11px system-ui; }
        .rule { flex:1;font-size:13px; }
        .ts { font-size:11px;color:#9C9FB0; }
        details summary { font-size:11px;color:#9C9FB0;cursor:pointer; }
        details pre { font-size:11px;color:#9C9FB0;background:#0B0D14;padding:8px;border-radius:6px;overflow-x:auto;max-height:120px; }
        .overlay { position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center;z-index:200;padding:0; }
        .modal { background:#14161F;border:1px solid #262a3a;border-radius:20px 20px 0 0;padding:24px 18px 36px;width:100%;max-width:480px;animation:slideUp .25s cubic-bezier(.22,1,.36,1); }
        @keyframes slideUp { from{transform:translateY(40px);opacity:0;}to{transform:none;opacity:1;} }
        .modal h3 { margin:0 0 8px;font-size:18px; }
        .placRow { display:flex;align-items:center;gap:8px;margin-bottom:8px; }
        .placIcon { font-size:18px;width:24px; }
        .placRow input { flex:1; }
        .prizeInput { width:90px !important;flex:0 0 auto !important; }
        .addPlacBtn { width:100%;padding:9px;border:1px dashed #262a3a;background:transparent;color:#9C9FB0;border-radius:9px;font-size:13px;cursor:pointer;margin-bottom:10px; }
        .resolveBtns { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px; }
        .refundBtn { padding:12px;border-radius:10px;border:none;background:rgba(79,169,240,.2);color:#4FA9F0;font:700 13px system-ui;cursor:pointer; }
        .releaseBtn { padding:12px;border-radius:10px;border:none;background:rgba(32,209,121,.2);color:#20D179;font:700 13px system-ui;cursor:pointer; }
      `}</style>
    </div>
  );
}

function Lbl({children}) {
  return <p style={{margin:'10px 0 5px',fontSize:'11.5px',color:'#9C9FB0',letterSpacing:'.02em'}}>{children}</p>;
}

function Stat({label,value,color}) {
  return (
    <div className="stat">
      <p className="sv" style={{color}}>{value}</p>
      <p className="sl">{label}</p>
      <style jsx>{`.stat{background:#14161F;border:1px solid #262a3a;border-radius:12px;padding:12px;text-align:center;}.sv{margin:0 0 3px;font-size:22px;font-weight:800;}.sl{margin:0;font-size:10.5px;color:#9C9FB0;}`}</style>
    </div>
  );
}

function DisputeCard({d, onResolve, readOnly}) {
  const evidence = JSON.parse(typeof d.evidence_files==='string'?d.evidence_files:'[]');
  const statusColor = d.status==='open'?'#F04F7A':'#20D179';
  return (
    <div className="dcard">
      <div className="dhead">
        <span className="damt">${Number(d.amount||0).toFixed(2)} USDT</span>
        <span className="dst" style={{color:statusColor}}>● {d.status}</span>
      </div>
      <p className="dreason">"{d.reason}"</p>
      {d.resolution_note && <p className="dnote">Note: {d.resolution_note}</p>}
      <div className="dmeta">
        <span>Buyer: <code>{(d.buyer_id||'').slice(0,8)}…</code></span>
        <span>Seller: <code>{(d.seller_id||'').slice(0,8)}…</code></span>
      </div>
      {evidence.length>0 && <p className="devidence">📎 {evidence.length} evidence file{evidence.length>1?'s':''}</p>}
      {!readOnly && d.status==='open' && (
        <button className="resolveBtn" onClick={()=>onResolve(d.id,'')}>Review & Resolve →</button>
      )}
      <style jsx>{`
        .dcard{background:#14161F;border:1px solid #262a3a;border-radius:12px;padding:14px;margin-bottom:10px;animation:fadeUp .2s ease;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
        .dhead{display:flex;justify-content:space-between;margin-bottom:8px;}
        .damt{font-size:16px;font-weight:700;}
        .dst{font-size:12px;font-weight:700;}
        .dreason{font-size:13px;background:#0B0D14;padding:8px 10px;border-radius:8px;margin:0 0 8px;border-left:2px solid #F04F7A;}
        .dnote{font-size:12px;color:#9C9FB0;margin:0 0 6px;}
        .dmeta{display:flex;gap:12px;font-size:11.5px;color:#9C9FB0;}
        code{font-family:monospace;}
        .devidence{font-size:12px;color:#4FA9F0;margin:6px 0 0;}
        .resolveBtn{margin-top:10px;padding:8px 14px;border-radius:8px;border:none;background:rgba(240,79,122,.15);color:#F04F7A;font:600 12.5px system-ui;cursor:pointer;}
      `}</style>
    </div>
  );
}
