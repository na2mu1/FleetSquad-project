import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
function authH(){ return typeof window!=='undefined'&&localStorage.getItem('egm_token')?{Authorization:`Bearer ${localStorage.getItem('egm_token')}`}:{}; }
async function api(url,opts={}){ const r=await fetch(API+url,{...opts,headers:{...authH(),'Content-Type':'application/json',...(opts.headers||{})}}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||`Error ${r.status}`); return d; }
const CARD_TYPES=['standard','featured','epic','legendary','iconic'];
const POSITIONS=['GK','CB','LB','RB','DMF','CMF','AMF','LMF','RMF','LWF','RWF','SS','CF'];
export default function Settings(){
  const router=useRouter();
  const [user,setUser]=useState(null); const [cards,setCards]=useState([]); const [bal,setBal]=useState(0); const [tab,setTab]=useState('profile');
  const [flash,setFlash]=useState(null); const [saving,setSaving]=useState(false);
  const [dn,setDn]=useState(''); const [un,setUn]=useState(''); const [bio,setBio]=useState(''); const [efUid,setEfUid]=useState(''); const [efName,setEfName]=useState('');
  const [showCard,setShowCard]=useState(false); const [nc,setNc]=useState({playerName:'',overallRating:'',position:'CF',team:'',cardType:'standard',isMaxed:false});
  const avRef=useRef(); const cvRef=useRef();
  function toast(msg,ok=true){setFlash({msg,ok});setTimeout(()=>setFlash(null),4000);}
  async function load(){
    try{
      const d=await api('/api/profile/me');
      setUser(d.user); setCards(d.cards||[]); setBal(d.balance||0);
      setDn(d.user.display_name||''); setUn(d.user.username||''); setBio(d.user.bio||''); setEfUid(d.user.efootball_uid||''); setEfName(d.user.efootball_name||'');
    }catch(e){ if(e.message.includes('401')) router.push('/auth/login'); }
  }
  useEffect(()=>{load();},[]);
  if(!user) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#05060a'}}><div style={{width:32,height:32,border:'3px solid #262a3a',borderTopColor:'#FF7A1A',borderRadius:'50%',animation:'s .7s linear infinite'}}/><style>{`@keyframes s{to{transform:rotate(360deg);}}`}</style></div>;
  const av=user.avatar_url?.startsWith('http')?user.avatar_url:user.avatar_url?`${API}${user.avatar_url}`:`https://api.dicebear.com/7.x/thumbs/svg?seed=${user.id}`;
  const cv=user.cover_url?(user.cover_url.startsWith('http')?user.cover_url:`${API}${user.cover_url}`):null;
  async function saveProfile(e){ e.preventDefault(); setSaving(true);
    try{ await api('/api/profile/me',{method:'PATCH',body:JSON.stringify({displayName:dn,username:un||undefined,bio,efootballUid:efUid||undefined,efootballName:efName||undefined})}); toast('Profile সংরক্ষিত ✓'); load(); }catch(e){toast(e.message,false);} finally{setSaving(false);}
  }
  async function uploadFile(type,file){ const fd=new FormData(); fd.append(type,file);
    try{ await fetch(`${API}/api/profile/me/${type}`,{method:'POST',headers:authH(),body:fd}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}); toast(`${type==='avatar'?'Profile photo':'Cover photo'} আপডেট হয়েছে ✓`); load(); }catch(e){toast(e.message,false);}
  }
  async function addCard(e){ e.preventDefault();
    if(!nc.playerName){toast('Player name দিন',false);return;}
    try{ await api('/api/profile/me/cards',{method:'POST',body:JSON.stringify({...nc,overallRating:parseInt(nc.overallRating)||undefined})}); toast('Card যোগ হয়েছে ✓'); setShowCard(false); setNc({playerName:'',overallRating:'',position:'CF',team:'',cardType:'standard',isMaxed:false}); load(); }catch(e){toast(e.message,false);}
  }
  async function delCard(id){ if(!confirm('Delete?')) return; try{ await api(`/api/profile/me/cards/${id}`,{method:'DELETE'}); toast('Deleted'); load(); }catch(e){toast(e.message,false);} }
  return (
    <div className="page">
      <header className="hdr"><Link href={`/profile/${user.username||user.id}`} className="back">← Profile</Link><h1>⚙️ Settings</h1><span className="bal">৳{Math.round(bal*110).toLocaleString()}</span></header>
      {flash&&<div className={`flash ${flash.ok===false?'err':'ok'}`}>{flash.msg}</div>}
      <div className="tabs">{[['profile','👤 Profile'],['cards','⚽ Cards'],['account','🔐 Account']].map(([k,l])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
      {tab==='profile'&&<div className="body">
        <div className="coverWrap" style={cv?{backgroundImage:`url(${cv})`}:{}} onClick={()=>cvRef.current?.click()}><div className="covOv"><span>📷 Cover পরিবর্তন</span></div><input ref={cvRef} type="file" accept="image/*" hidden onChange={e=>e.target.files[0]&&uploadFile('cover',e.target.files[0])}/></div>
        <div className="avRow"><div className="avWrap" onClick={()=>avRef.current?.click()}><img src={av} alt="" className="av"/><div className="avOv">📷</div><input ref={avRef} type="file" accept="image/*" hidden onChange={e=>e.target.files[0]&&uploadFile('avatar',e.target.files[0])}/></div><div><p className="avName">{user.display_name}</p>{user.username&&<p className="avUser">@{user.username}</p>}<p className="avHint">Tap করুন ছবি বদলাতে</p></div></div>
        <form onSubmit={saveProfile}>
          <Lbl>Display Name</Lbl><input value={dn} onChange={e=>setDn(e.target.value)} placeholder="আপনার নাম"/>
          <Lbl>Username <span className="opt">(public URL)</span></Lbl>
          <div className="unRow"><span className="unPfx">@</span><input value={un} onChange={e=>setUn(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} placeholder="username" className="unInput"/></div>
          <Lbl>Bio</Lbl><textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="আপনার সম্পর্কে…" rows={3}/>
          <div className="efBox"><Lbl>⚽ eFootball UID</Lbl><input value={efUid} onChange={e=>setEfUid(e.target.value)} placeholder="eFootball UID"/><Lbl>eFootball নাম</Lbl><input value={efName} onChange={e=>setEfName(e.target.value)} placeholder="In-game নাম"/></div>
          <button type="submit" className="saveBtn" disabled={saving}>{saving?'Saving…':'Save Changes'}</button>
        </form>
      </div>}
      {tab==='cards'&&<div className="body">
        <div className="cardsHdr"><p className="hint">eFootball player cards যোগ করুন। Public profile-এ দেখাবে।</p><button className="addCardBtn" onClick={()=>setShowCard(s=>!s)}>{showCard?'✕':'+ Card'}</button></div>
        {showCard&&<form className="addForm" onSubmit={addCard}>
          <Lbl>Player Name *</Lbl><input value={nc.playerName} onChange={e=>setNc(c=>({...c,playerName:e.target.value}))} placeholder="e.g. Messi" required/>
          <div className="r2"><div><Lbl>Overall</Lbl><input type="number" min="1" max="100" value={nc.overallRating} onChange={e=>setNc(c=>({...c,overallRating:e.target.value}))} placeholder="97"/></div><div><Lbl>Position</Lbl><select value={nc.position} onChange={e=>setNc(c=>({...c,position:e.target.value}))}>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></div></div>
          <div className="r2"><div><Lbl>Team</Lbl><input value={nc.team} onChange={e=>setNc(c=>({...c,team:e.target.value}))} placeholder="Inter Miami"/></div><div><Lbl>Card Type</Lbl><select value={nc.cardType} onChange={e=>setNc(c=>({...c,cardType:e.target.value}))}>{CARD_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div></div>
          <label className="chkRow"><input type="checkbox" checked={nc.isMaxed} onChange={e=>setNc(c=>({...c,isMaxed:e.target.checked}))}/><span>Max Level</span></label>
          <button type="submit" className="saveBtn">Add Card</button>
        </form>}
        {cards.length===0?<p className="hint">কোনো card নেই।</p>:<div className="cardList">{cards.map(c=><div key={c.id} className="cRow"><span className="cRat">{c.overall_rating||'?'}</span><div><p className="cName">{c.player_name}</p><p className="cMeta">{c.position}·{c.team||'—'}·{c.card_type}</p></div>{c.is_maxed&&<span className="maxBadge">MAX</span>}<button className="delBtn" onClick={()=>delCard(c.id)}>🗑</button></div>)}</div>}
      </div>}
      {tab==='account'&&<div className="body">
        <div className="infoBox"><Row l="Email" v={user.email||'—'}/><Row l="Login" v={user.auth_provider==='google'?'🔵 Google':'📧 Email'}/><Row l="Balance" v={`৳${Math.round(bal*110).toLocaleString()}`} hi/></div>
        <Link href="/deposit" className="depLink">💳 Deposit / Withdraw →</Link>
        <button className="logoutBtn" onClick={()=>{localStorage.removeItem('egm_token');router.push('/');}}>🚪 Logout</button>
      </div>}
      <style jsx>{`
        .page{max-width:480px;margin:0 auto;padding:0 0 60px;background:#05060a;min-height:100vh;color:#F4F1EA;font-family:system-ui,sans-serif;}
        .hdr{display:flex;align-items:center;gap:10px;padding:14px 14px 12px;border-bottom:1px solid #1a1d2a;}
        .back{color:#9C9FB0;font-size:13px;text-decoration:none;} h1{flex:1;margin:0;font-size:18px;}
        .bal{background:rgba(32,209,121,.12);color:#20D179;padding:5px 10px;border-radius:999px;font:700 13px system-ui;}
        .flash{padding:10px 14px;margin:8px 14px;border-radius:10px;font-size:13px;}
        .flash.ok{background:rgba(32,209,121,.15);color:#20D179;} .flash.err{background:rgba(240,79,122,.15);color:#F04F7A;}
        .tabs{display:flex;border-bottom:1px solid #1a1d2a;}
        .tabs button{flex:1;padding:11px 4px;background:transparent;border:none;color:#9C9FB0;font:600 12px system-ui;cursor:pointer;border-bottom:2px solid transparent;transition:all .14s;}
        .tabs button.on{color:#FF7A1A;border-bottom-color:#FF7A1A;}
        .body{padding:0 14px 14px;}
        .coverWrap{height:110px;background:linear-gradient(135deg,#1a0a30,#0a1a2a);background-size:cover;background-position:center;cursor:pointer;position:relative;overflow:hidden;}
        .covOv{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;color:#fff;font-size:13px;font-weight:600;}
        .coverWrap:hover .covOv{opacity:1;}
        .avRow{display:flex;align-items:center;gap:12px;padding:12px 0 14px;border-bottom:1px solid #262a3a;margin-bottom:14px;}
        .avWrap{position:relative;cursor:pointer;flex-shrink:0;}
        .av{width:68px;height:68px;border-radius:50%;object-fit:cover;border:3px solid #262a3a;display:block;}
        .avOv{position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:18px;opacity:0;transition:opacity .2s;}
        .avWrap:hover .avOv{opacity:1;}
        .avName{margin:0 0 2px;font:700 14px system-ui;} .avUser{margin:0 0 2px;font-size:12px;color:#9C9FB0;} .avHint{margin:0;font-size:11px;color:#9C9FB0;}
        input,select,textarea{background:#14161F;border:1px solid #262a3a;color:#F4F1EA;padding:10px 12px;border-radius:10px;font:14px system-ui;width:100%;box-sizing:border-box;transition:border-color .14s;margin-bottom:2px;}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#FF7A1A;} textarea{resize:vertical;min-height:65px;}
        .opt{font-weight:400;font-size:10.5px;color:#9C9FB0;}
        .unRow{display:flex;align-items:center;background:#14161F;border:1px solid #262a3a;border-radius:10px;overflow:hidden;margin-bottom:2px;}
        .unPfx{padding:10px 6px 10px 12px;color:#9C9FB0;font-size:15px;flex-shrink:0;}
        .unInput{border:none!important;border-radius:0!important;background:transparent!important;padding-left:0!important;}
        .efBox{background:#14161F33;border:1px solid #262a3a;border-radius:11px;padding:12px;margin:10px 0;}
        .saveBtn{width:100%;margin-top:14px;padding:12px;border-radius:11px;border:none;background:#FF7A1A;color:#101014;font:700 14px system-ui;cursor:pointer;}
        .saveBtn:disabled{opacity:.6;}
        .cardsHdr{display:flex;justify-content:space-between;align-items:center;padding:14px 0 10px;}
        .hint{color:#9C9FB0;font-size:12.5px;margin:0;}
        .addCardBtn{padding:8px 13px;border-radius:9px;border:none;background:#FF7A1A;color:#101014;font:700 12.5px system-ui;cursor:pointer;}
        .addForm{background:#14161F;border:1px solid #262a3a;border-radius:12px;padding:14px;margin-bottom:14px;}
        .r2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;}
        .chkRow{display:flex;align-items:center;gap:8px;font-size:13px;color:#9C9FB0;cursor:pointer;padding:6px 0;}
        .chkRow input{width:auto;margin:0;padding:0;}
        .cardList{display:flex;flex-direction:column;gap:7px;padding:4px 0;}
        .cRow{display:flex;align-items:center;gap:9px;background:#14161F;border:1px solid #262a3a;border-radius:10px;padding:10px 12px;}
        .cRat{font:900 20px system-ui;color:#FF7A1A;min-width:30px;}
        .cName{margin:0 0 2px;font:700 13px system-ui;} .cMeta{margin:0;font-size:11px;color:#9C9FB0;text-transform:capitalize;}
        .maxBadge{background:#FFD700;color:#101014;font:700 9px system-ui;padding:2px 5px;border-radius:4px;margin-left:auto;}
        .delBtn{background:rgba(240,79,122,.12);border:none;color:#F04F7A;font-size:15px;padding:5px 8px;border-radius:7px;cursor:pointer;}
        .infoBox{background:#14161F;border:1px solid #262a3a;border-radius:12px;padding:14px;margin:14px 0;}
        .depLink{display:block;background:rgba(79,169,240,.1);color:#4FA9F0;border:1px solid rgba(79,169,240,.2);border-radius:11px;padding:12px 16px;text-align:center;text-decoration:none;font:600 13.5px system-ui;margin-bottom:10px;}
        .logoutBtn{width:100%;padding:12px;border-radius:11px;border:none;background:rgba(240,79,122,.1);color:#F04F7A;font:600 14px system-ui;cursor:pointer;}
      `}</style>
    </div>
  );
}
function Lbl({children}){return <p style={{display:'block',fontSize:'11.5px',color:'#9C9FB0',margin:'10px 0 4px'}}>{children}</p>;}
function Row({l,v,hi}){return <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #262a3a',fontSize:'13px'}}><span style={{color:'#9C9FB0'}}>{l}</span><span style={{fontWeight:600,color:hi?'#20D179':'#F4F1EA'}}>{v}</span></div>;}
