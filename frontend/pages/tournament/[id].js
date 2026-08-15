import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
function authH(){return typeof window!=='undefined'&&localStorage.getItem('egm_token')?{Authorization:`Bearer ${localStorage.getItem('egm_token')}`}:{};}
async function apiFetch(url,opts={}){const r=await fetch(API+url,{...opts,headers:{...authH(),'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Error ${r.status}`);return d;}
const GAME={free_fire:{label:'🔥 Free Fire',color:'#FF7A1A',bg:'linear-gradient(135deg,#FF7A1A,#FF3D2E)'},pubg_mobile:{label:'🪖 PUBG',color:'#D8B65A',bg:'linear-gradient(135deg,#D8B65A,#8C6D2F)'},efootball:{label:'⚽ eFootball',color:'#20D179',bg:'linear-gradient(135deg,#20D179,#0E8F52)'},other:{label:'🎮 Other',color:'#4FA9F0',bg:'linear-gradient(135deg,#4FA9F0,#2060B0)'}};
export default function TournamentDetail(){
  const router=useRouter();const{id}=router.query;
  const[t,setT]=useState(null);const[rate,setRate]=useState(110);const[flash,setFlash]=useState(null);
  const[myId,setMyId]=useState(null);const[bal,setBal]=useState(0);
  const[joining,setJoining]=useState(false);const[gameUid,setGameUid]=useState('');const[showJoin,setShowJoin]=useState(false);
  const[resultModal,setResultModal]=useState(null);const[copied,setCopied]=useState(false);
  const bdt=(usd)=>`৳${Math.round((usd||0)*rate).toLocaleString()}`;
  function toast(msg,ok=true){setFlash({msg,ok});setTimeout(()=>setFlash(null),4000);}
  async function load(){
    if(!id)return;
    try{
      const[data,sett]=await Promise.all([fetch(`${API}/api/t2/${id}`).then(r=>r.json()),fetch(`${API}/api/settings/public`).then(r=>r.json())]);
      setT(data);if(sett.bdtToUsd)setRate(Math.round(1/sett.bdtToUsd));
    }catch{}
    const token=typeof window!=='undefined'&&localStorage.getItem('egm_token');
    if(token){try{const uid=JSON.parse(atob(token.split('.')[1])).userId;setMyId(uid);const w=await apiFetch('/api/payment/balance');setBal(w.balance||0);}catch{}}
  }
  useEffect(()=>{load();},[id]);
  if(!t)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#05060a'}}><div style={{width:32,height:32,border:'3px solid #262a3a',borderTopColor:'#FF7A1A',borderRadius:'50%',animation:'s .7s linear infinite'}}/><style>{`@keyframes s{to{transform:rotate(360deg);}}`}</style></div>;
  const g=GAME[t.game]||GAME.other;
  const myEntry=t.players?.find(p=>p.user_id===myId);
  const isCreator=myId===t.created_by;
  const canJoin=myId&&!myEntry&&t.status==='open'&&(t.player_count||0)<t.max_players;
  const canLeave=myId&&myEntry&&t.status==='open';
  const spots=t.max_players-(t.player_count||0);
  const bd=Array.isArray(t.prize_breakdown)?t.prize_breakdown:[];
  const entryBdt=Math.round((t.entry_fee_usd||0)*rate);
  const balBdt=Math.round(bal*rate);
  async function handleJoin(){
    if(t.entry_fee_usd>0&&balBdt<entryBdt){toast(`Balance কম! আপনার ৳${balBdt} আছে, দরকার ৳${entryBdt}`,false);return;}
    setJoining(true);
    try{const res=await apiFetch(`/api/t2/${id}/join`,{method:'POST',body:JSON.stringify({gameUid})});toast(`✅ যোগ হয়েছেন!${t.entry_fee_usd>0?` ৳${Math.round(res.entryPaid*rate).toLocaleString()} কাটা হয়েছে`:''}`);;setShowJoin(false);load();}
    catch(e){toast(e.message,false);}finally{setJoining(false);}
  }
  async function handleLeave(){try{const res=await apiFetch(`/api/t2/${id}/leave`,{method:'DELETE'});toast(`↩ ছেড়েছেন।${res.refunded>0?` ৳${Math.round(res.refunded*rate)} ফেরত পাবেন`:''}`);load();}catch(e){toast(e.message,false);}}
  async function handleStart(){if(!confirm(`${t.player_count} জন নিয়ে শুরু করবেন?`))return;try{await apiFetch(`/api/t2/${id}/start`,{method:'POST'});toast('🏁 শুরু হয়েছে!');load();}catch(e){toast(e.message,false);}}
  async function handleDeclare(match,winnerId){const w=t.players?.find(p=>p.user_id===winnerId);if(!confirm(`${w?.display_name} কে winner declare করবেন?`))return;try{await apiFetch(`/api/t2/${id}/match/${match.id}/result`,{method:'POST',body:JSON.stringify({winnerId})});toast('✓ Winner declared!');setResultModal(null);load();}catch(e){toast(e.message,false);}}
  async function handleCancel(){if(!confirm('Cancel করলে সবার entry fee ফেরত দেওয়া হবে।'))return;try{await apiFetch(`/api/t2/${id}`,{method:'DELETE'});toast('Cancelled');load();}catch(e){toast(e.message,false);}}
  async function copyLink(){await navigator.clipboard.writeText(`${window.location.origin}/tournament/${id}`).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2500);toast('Invite link copy হয়েছে!');}
  return(
    <div className="page">
      {flash&&<div className={`flash ${flash.ok===false?'err':'ok'}`}>{flash.msg}</div>}
      <div className="hero" style={{background:g.bg}}>
        <Link href="/tournaments" className="backBtn">← Tournaments</Link>
        <div className="heroRow">
          <div><p className="hGame">{g.label}</p><h1>{t.title}</h1><p className="hBy">by {t.creator_name}{isCreator?' (আপনি)':''}</p></div>
          <span className={`sBadge st-${t.status}`}>{t.status==='open'?'✅ Open':t.status==='in_progress'?'🔴 Live':t.status==='completed'?'✓ Done':'✕'}</span>
        </div>
      </div>
      <div className="stats"><SB l="Players" v={`${t.player_count||0}/${t.max_players}`} c={g.color}/><SB l="Entry" v={t.entry_fee_usd>0?bdt(t.entry_fee_usd):'FREE'} c="#F0A94F"/><SB l="Prize Pool" v={bdt(t.prize_pool_usd)} c="#20D179"/><SB l="Spots" v={spots>0?spots:'Full'} c={spots<=3?'#F04F7A':'#9C9FB0'}/></div>
      {bd.length>0&&<div className="section"><h3>🏆 Prize</h3>{bd.map((p,i)=><div key={i} className="prRow"><span>{i===0?'🥇':i===1?'🥈':'🥉'}</span><span className="prP">{i+1}ম স্থান</span><span className="prA" style={{color:g.color}}>{bdt(p.amount||0)}</span></div>)}</div>}
      {t.rules&&<div className="section"><h3>📋 Rules</h3><p className="rules">{t.rules}</p></div>}
      {isCreator&&t.status==='open'&&<div className="creatorBox"><h3>👑 Creator Controls</h3><p className="hint">{t.player_count||0} জন registered</p><div className="cBtns"><button className="shareBtn" onClick={copyLink}>{copied?'✓ Copied!':'🔗 Invite Copy'}</button><button className="startBtn" onClick={handleStart} disabled={(t.player_count||0)<2}>▶ Start</button><button className="cancelBtn" onClick={handleCancel}>✕</button></div></div>}
      {!isCreator&&t.status==='open'&&<div className="section"><button className="inviteBtn" onClick={copyLink}>{copied?'✓ Copied!':'🔗 Friend-দের Invite করুন'}</button></div>}
      {t.status!=='open'&&Object.keys(t.rounds||{}).length>0&&<div className="section"><h3>🏆 Bracket</h3>{Object.entries(t.rounds).sort(([a],[b])=>a-b).map(([round,matches])=><div key={round} className="roundBlock"><p className="roundLbl">Round {round}</p>{matches.map(m=><div key={m.id} className={`matchCard ${m.status==='completed'?'done':''}`}><PN name={m.p1_name} win={m.winner_id===m.player1_id} c={g.color}/><span className="vs">VS</span><PN name={m.p2_name||'BYE'} win={m.winner_id===m.player2_id} c={g.color}/><div className="mR">{m.status==='completed'?<span className="mDone">✓{m.winner_name}</span>:isCreator&&m.status==='pending'?<button className="declBtn" onClick={()=>setResultModal(m)}>Declare</button>:<span className="mP">Pending</span>}</div></div>)}</div>)}</div>}
      <div className="section"><h3>👥 Players ({t.player_count||0})</h3>{!t.players?.length?<p className="hint">কেউ register করেনি।</p>:<div className="pList">{t.players.map((p,i)=><div key={p.id} className={`pRow ${p.user_id===myId?'me':''} ${p.status==='winner'?'winner':''}`}><span className="pNum">{i+1}</span><Link href={`/profile/${p.username||p.user_id}`} className="pName">{p.display_name}</Link>{p.game_uid&&<span className="pUid">{p.game_uid}</span>}<span className={`pSt ps-${p.status}`}>{p.status==='winner'?'🏆':p.status==='eliminated'?'✕':'●'}</span>{p.prize_won_usd>0&&<span className="pPrize">{bdt(p.prize_won_usd)}</span>}</div>)}</div>}</div>
      {myEntry&&<div className="myStatus">✅ Registered{myEntry.game_uid&&` · UID: ${myEntry.game_uid}`}</div>}
      {t.status==='open'&&<div className="actionBar">{!myId?<Link href="/auth/login" className="aBtn conn">Login করুন</Link>:canJoin?<button className="aBtn join" style={{background:g.color}} onClick={()=>setShowJoin(true)}>{t.entry_fee_usd>0?`Join — ${bdt(t.entry_fee_usd)}`:'Free Join'}</button>:canLeave?<button className="aBtn leave" onClick={handleLeave}>Leave</button>:myEntry?<div className="aJoined">✅ Registered</div>:<div className="aClosed">Full</div>}{canJoin&&t.entry_fee_usd>0&&balBdt<entryBdt&&<Link href="/deposit" className="aBtn dep">💳 Deposit (৳{balBdt.toLocaleString()})</Link>}</div>}
      {showJoin&&<div className="overlay" onClick={()=>setShowJoin(false)}><div className="modal" onClick={e=>e.stopPropagation()}><h3>Tournament Join করুন</h3><div className="cInfo"><IR l="Entry fee" v={t.entry_fee_usd>0?bdt(t.entry_fee_usd):'FREE'}/><IR l="আপনার balance" v={`৳${balBdt.toLocaleString()}`}/></div><label className="lbl">In-game UID (optional)</label><input value={gameUid} onChange={e=>setGameUid(e.target.value)} placeholder="আপনার UID"/><button className="confirmBtn" style={{background:g.color}} onClick={handleJoin} disabled={joining}>{joining?'…':`✓ Join${t.entry_fee_usd>0?` — ${bdt(t.entry_fee_usd)}`:''}`}</button><button className="ghostBtn" onClick={()=>setShowJoin(false)}>Cancel</button></div></div>}
      {resultModal&&<div className="overlay" onClick={()=>setResultModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}><h3>⚔ Match Result</h3><p className="hint">কে জিতেছে সিলেক্ট করুন। পরিবর্তন করা যাবে না।</p><div className="dOpts">{[resultModal.player1_id,resultModal.player2_id].filter(Boolean).map(pid=>{const pl=t.players?.find(p=>p.user_id===pid);return<button key={pid} className="dOpt" style={{borderColor:g.color+'44'}} onClick={()=>handleDeclare(resultModal,pid)}><span className="dName">{pl?.display_name||'Player'}</span>{pl?.game_uid&&<span className="dUid">UID: {pl.game_uid}</span>}<span style={{color:g.color,fontSize:12,fontWeight:700}}>🏆 Winner</span></button>;})}</div><button className="ghostBtn" onClick={()=>setResultModal(null)}>Cancel</button></div></div>}
      <style jsx>{`
        .page{max-width:480px;margin:0 auto;padding-bottom:100px;color:#F4F1EA;font-family:system-ui,sans-serif;background:#05060a;min-height:100vh;}
        .flash{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:999;padding:10px 18px;border-radius:10px;font-size:13px;white-space:nowrap;}
        .flash.ok{background:rgba(32,209,121,.9);color:#101014;}.flash.err{background:rgba(240,79,122,.9);color:#fff;}
        .hero{padding:16px;position:relative;}
        .backBtn{display:inline-block;color:rgba(0,0,0,.65);font-size:13px;text-decoration:none;margin-bottom:10px;}
        .heroRow{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
        .hGame{margin:0 0 2px;font:700 10.5px system-ui;text-transform:uppercase;letter-spacing:.07em;color:rgba(0,0,0,.65);}
        h1{margin:0 0 2px;font-size:20px;color:#101014;}.hBy{margin:0;font-size:12px;color:rgba(0,0,0,.55);}
        .sBadge{font:700 11px system-ui;padding:5px 10px;border-radius:999px;background:rgba(0,0,0,.25);color:#fff;white-space:nowrap;flex-shrink:0;}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:12px 14px;}
        .section{padding:0 14px 14px;}
        h3{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:#9C9FB0;margin:0 0 8px;}
        .prRow{display:flex;align-items:center;gap:10px;padding:8px 11px;background:#14161F;border-radius:9px;margin-bottom:5px;}
        .prP{flex:1;font-size:13px;}.prA{font-size:15px;font-weight:800;}
        .rules{font-size:13px;color:#9C9FB0;background:#14161F;border-radius:9px;padding:11px;line-height:1.6;}
        .hint{color:#9C9FB0;font-size:12.5px;margin:0 0 8px;}
        .creatorBox{margin:0 14px 14px;background:rgba(255,215,0,.06);border:1px solid rgba(255,215,0,.2);border-radius:12px;padding:14px;}
        .creatorBox h3{color:#FFD700;margin:0 0 4px;}
        .cBtns{display:flex;gap:7px;margin-top:10px;}
        .shareBtn{flex:1;padding:9px;border-radius:9px;border:none;background:rgba(79,169,240,.15);color:#4FA9F0;font:600 12px system-ui;cursor:pointer;}
        .startBtn{flex:1;padding:9px;border-radius:9px;border:none;background:#20D179;color:#101014;font:700 12px system-ui;cursor:pointer;}
        .startBtn:disabled{opacity:.5;}
        .cancelBtn{padding:9px 12px;border-radius:9px;border:none;background:rgba(240,79,122,.15);color:#F04F7A;font:700 12px system-ui;cursor:pointer;}
        .inviteBtn{width:100%;padding:11px;border-radius:11px;border:1px solid #262a3a;background:transparent;color:#4FA9F0;font:600 13px system-ui;cursor:pointer;}
        .roundBlock{margin-bottom:14px;}.roundLbl{font:700 10.5px system-ui;text-transform:uppercase;color:#9C9FB0;margin:0 0 7px;}
        .matchCard{display:flex;align-items:center;gap:7px;background:#14161F;border:1px solid #262a3a;border-radius:9px;padding:9px 11px;margin-bottom:5px;}
        .matchCard.done{border-color:#20D17333;}.vs{font-size:10.5px;color:#9C9FB0;flex-shrink:0;}.mR{margin-left:auto;}
        .mDone{font-size:11.5px;font-weight:700;color:#20D179;}.mP{font-size:11px;color:#9C9FB0;}
        .declBtn{padding:5px 10px;border-radius:7px;border:none;background:rgba(255,122,26,.15);color:#FF7A1A;font:600 11.5px system-ui;cursor:pointer;}
        .pList{display:flex;flex-direction:column;gap:5px;}
        .pRow{display:flex;align-items:center;gap:7px;padding:8px 10px;background:#14161F;border-radius:8px;font-size:12.5px;}
        .pRow.me{border:1px solid #20D179;}.pRow.winner{border:1px solid #FFD700;background:rgba(255,215,0,.04);}
        .pNum{width:18px;color:#9C9FB0;font-size:11px;}.pName{flex:1;font-weight:600;text-decoration:none;color:#F4F1EA;}
        .pName:hover{color:#FF7A1A;}.pUid{font-size:11px;color:#9C9FB0;font-family:monospace;}
        .pSt{font-weight:700;font-size:12px;}.ps-winner{color:#FFD700;}.ps-eliminated{color:#F04F7A;}.ps-registered{color:#20D179;}
        .pPrize{font-size:12px;font-weight:700;color:#20D179;}
        .myStatus{margin:0 14px 14px;background:rgba(32,209,121,.08);border:1px solid rgba(32,209,121,.2);border-radius:9px;padding:10px 13px;font-size:13px;color:#20D179;font-weight:600;}
        .actionBar{position:fixed;bottom:0;left:0;right:0;padding:12px 14px;background:rgba(5,6,10,.95);border-top:1px solid #1a1d2a;display:flex;flex-direction:column;gap:7px;max-width:480px;margin:0 auto;backdrop-filter:blur(8px);}
        .aBtn{display:block;width:100%;padding:13px;border-radius:12px;border:none;font:700 13.5px system-ui;cursor:pointer;text-align:center;text-decoration:none;}
        .aBtn.join{color:#101014;}.aBtn.conn{background:#262a3a;color:#9C9FB0;}.aBtn.leave{background:rgba(240,79,122,.15);color:#F04F7A;}.aBtn.dep{background:rgba(79,169,240,.12);color:#4FA9F0;font-size:12px;padding:9px;}
        .aJoined{text-align:center;padding:13px;color:#20D179;font-weight:700;}.aClosed{text-align:center;padding:13px;color:#9C9FB0;font-size:13px;}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center;z-index:200;}
        .modal{background:#14161F;border:1px solid #262a3a;border-radius:20px 20px 0 0;padding:24px 18px 36px;width:100%;max-width:480px;}
        .modal h3{margin:0 0 12px;font-size:18px;}.cInfo{background:#0B0D14;border-radius:10px;padding:12px;margin-bottom:12px;}
        .lbl{display:block;font-size:11.5px;color:#9C9FB0;margin:12px 0 5px;}
        input{background:#0B0D14;border:1px solid #262a3a;color:#F4F1EA;padding:10px 12px;border-radius:10px;font-size:14px;width:100%;box-sizing:border-box;}
        input:focus{outline:none;border-color:#FF7A1A;}
        .confirmBtn{width:100%;margin-top:12px;padding:13px;border-radius:12px;border:none;color:#101014;font:700 14px system-ui;cursor:pointer;}
        .ghostBtn{width:100%;margin-top:8px;padding:11px;border-radius:10px;border:1px solid #262a3a;background:transparent;color:#9C9FB0;font:600 13px system-ui;cursor:pointer;}
        .dOpts{display:flex;flex-direction:column;gap:9px;}
        .dOpt{padding:14px;border-radius:12px;border:1px solid;background:#0B0D14;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:3px;}
        .dOpt:hover{background:#14161F;}.dName{font-size:15px;font-weight:700;color:#F4F1EA;}.dUid{font-size:11.5px;color:#9C9FB0;font-family:monospace;}
      `}</style>
    </div>
  );
}
function PN({name,win,c}){return<div style={{display:'flex',alignItems:'center',gap:4,flex:1}}><span style={{fontSize:'12.5px',fontWeight:600,color:win?c:'#F4F1EA'}}>{name||'TBD'}</span>{win&&<span style={{fontSize:12}}>🏆</span>}</div>;}
function SB({l,v,c}){return<div style={{background:'#14161F',border:'1px solid #262a3a',borderRadius:9,padding:'9px 5px',textAlign:'center'}}><p style={{margin:'0 0 2px',fontSize:14,fontWeight:800,color:c}}>{v}</p><p style={{margin:0,fontSize:9,color:'#9C9FB0',textTransform:'uppercase',letterSpacing:'.04em'}}>{l}</p></div>;}
function IR({l,v}){return<div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:13,borderBottom:'1px solid #1a1d2a'}}><span style={{color:'#9C9FB0'}}>{l}</span><span style={{fontWeight:700}}>{v}</span></div>;}
