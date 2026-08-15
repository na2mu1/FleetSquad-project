import { useEffect, useState } from 'react';
import Link from 'next/link';
const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
function authH(){return typeof window!=='undefined'&&localStorage.getItem('egm_token')?{Authorization:`Bearer ${localStorage.getItem('egm_token')}`}:{};}
async function apiFetch(url,opts={}){const r=await fetch(API+url,{...opts,headers:{...authH(),'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Error ${r.status}`);return d;}
const ICONS={bkash:'🟣',nagad:'🟠',rocket:'🔵',upay:'🟢'};
const COMM_LABELS={listing_commission_pct:{l:'Listing Commission (%)',h:'Account বিক্রিতে platform কত %'},tournament_platform_pct:{l:'Tournament Platform (%)',h:'Prize pool থেকে platform কত %'},tournament_creator_pct:{l:'Tournament Creator (%)',h:'Creator কত % পাবে'},tournament_winner_pct:{l:'Tournament Winner (%)',h:'Winner কত % পাবে'},bdt_to_usd_rate:{l:'BDT per $1 USD',h:'Exchange rate (প্রতিদিন update করুন)'},min_deposit_bdt:{l:'Min Deposit (BDT)',h:'সর্বনিম্ন deposit'},min_withdraw_bdt:{l:'Min Withdraw (BDT)',h:'সর্বনিম্ন withdrawal'}};
export default function Admin(){
  const[tab,setTab]=useState('deposits');const[isAdmin,setIsAdmin]=useState(null);const[flash,setFlash]=useState(null);
  const[deposits,setDeposits]=useState([]);const[withdrawals,setWithdrawals]=useState([]);const[accounts,setAccounts]=useState([]);const[settings,setSettings]=useState({});
  const[depFilter,setDepFilter]=useState('pending');const[wdFilter,setWdFilter]=useState('pending');
  const[newAcc,setNewAcc]=useState({provider:'bkash',number:'',holderName:''});const[showAdd,setShowAdd]=useState(false);
  const[notes,setNotes]=useState({});const[trxIds,setTrxIds]=useState({});const[settEdits,setSettEdits]=useState({});
  function toast(msg,ok=true){setFlash({msg,ok});setTimeout(()=>setFlash(null),4000);}
  async function load(){
    try{
      const[deps,wds,accs,sets]=await Promise.all([apiFetch(`/api/payment/deposits/all?status=${depFilter}`),apiFetch(`/api/payment/withdrawals/all?status=${wdFilter}`),apiFetch('/api/payment/accounts'),apiFetch('/api/settings')]);
      setDeposits(Array.isArray(deps)?deps:[]);setWithdrawals(Array.isArray(wds)?wds:[]);setAccounts(Array.isArray(accs)?accs:[]);
      const obj={};(Array.isArray(sets)?sets:[]).forEach(s=>obj[s.key]=s.value);setSettings(obj);setSettEdits(obj);setIsAdmin(true);
    }catch(e){if(e.message.includes('403')||e.message.includes('Admin'))setIsAdmin(false);else toast(e.message,false);}
  }
  useEffect(()=>{if(localStorage.getItem('egm_token'))load();else setIsAdmin(false);},[]);
  useEffect(()=>{if(isAdmin)apiFetch(`/api/payment/deposits/all?status=${depFilter}`).then(d=>setDeposits(Array.isArray(d)?d:[])).catch(()=>{});},[depFilter,isAdmin]);
  useEffect(()=>{if(isAdmin)apiFetch(`/api/payment/withdrawals/all?status=${wdFilter}`).then(d=>setWithdrawals(Array.isArray(d)?d:[])).catch(()=>{});},[wdFilter,isAdmin]);
  if(isAdmin===null)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#05060a'}}><div style={{width:32,height:32,border:'3px solid #262a3a',borderTopColor:'#FF7A1A',borderRadius:'50%',animation:'s .7s linear infinite'}}/><style>{`@keyframes s{to{transform:rotate(360deg);}}`}</style></div>;
  if(isAdmin===false)return<div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#05060a',color:'#F4F1EA',gap:12,fontFamily:'system-ui'}}><h1>🚫 Admin Only</h1><Link href="/" style={{color:'#9C9FB0'}}>← Home</Link></div>;
  const pDeps=deposits.filter(d=>d.status==='pending').length;
  const pWds=withdrawals.filter(w=>w.status==='pending').length;
  const totalBdt=deposits.filter(d=>d.status==='approved').reduce((s,d)=>s+(d.amount_bdt||0),0);
  async function approveDep(id){try{const r=await apiFetch(`/api/payment/deposits/${id}/approve`,{method:'POST',body:JSON.stringify({note:notes[id]||''})});toast(`✓ Approved — ৳${Math.round(r.amountBdt||0).toLocaleString()}`);load();}catch(e){toast(e.message,false);}}
  async function rejectDep(id){if(!(notes[id]||'').trim()){toast('Rejection কারণ দিন',false);return;}try{await apiFetch(`/api/payment/deposits/${id}/reject`,{method:'POST',body:JSON.stringify({note:notes[id]})});toast('Rejected');load();}catch(e){toast(e.message,false);}}
  async function approveWd(id){if(!(trxIds[id]||'').trim()){toast('TrxID দিন',false);return;}try{await apiFetch(`/api/payment/withdrawals/${id}/approve`,{method:'POST',body:JSON.stringify({trxId:trxIds[id],note:notes[id]||''})});toast('✓ Approved');load();}catch(e){toast(e.message,false);}}
  async function rejectWd(id){try{const r=await apiFetch(`/api/payment/withdrawals/${id}/reject`,{method:'POST',body:JSON.stringify({note:notes[id]||''})});toast(`Rejected — ৳${r.refundedBdt||0} refunded`);load();}catch(e){toast(e.message,false);}}
  async function addAcc(){if(!newAcc.number.trim()){toast('নম্বর দিন',false);return;}try{await apiFetch('/api/payment/accounts',{method:'POST',body:JSON.stringify(newAcc)});toast('Account যোগ হয়েছে ✓');setShowAdd(false);setNewAcc({provider:'bkash',number:'',holderName:''});load();}catch(e){toast(e.message,false);}}
  async function toggleAcc(id,cur){try{await apiFetch(`/api/payment/accounts/${id}`,{method:'PATCH',body:JSON.stringify({isActive:!cur})});load();}catch(e){toast(e.message,false);}}
  async function delAcc(id){if(!confirm('Delete?'))return;try{await apiFetch(`/api/payment/accounts/${id}`,{method:'DELETE'});load();}catch(e){toast(e.message,false);}}
  async function saveSettings(){try{await apiFetch('/api/settings',{method:'PATCH',body:JSON.stringify(settEdits)});toast('Settings সংরক্ষিত ✓');load();}catch(e){toast(e.message,false);}}
  return(
    <div className="page">
      <header className="hdr"><Link href="/" className="back">← Home</Link><h1>⚙️ Admin Panel</h1></header>
      {flash&&<div className={`flash ${flash.ok===false?'err':'ok'}`}>{flash.msg}</div>}
      <div className="stats"><SB l="Pending Deposits" v={pDeps} c="#F0A94F"/><SB l="Pending Withdrawals" v={pWds} c="#F04F7A"/><SB l="Total Approved" v={`৳${Math.round(totalBdt).toLocaleString()}`} c="#20D179"/><SB l="Accounts" v={accounts.length} c="#4FA9F0"/></div>
      <div className="tabs">{[['deposits',`📥${pDeps>0?` (${pDeps})`:''}`],['withdrawals',`📤${pWds>0?` (${pWds})`:''}`],['accounts','📱'],['commission','💰']].map(([k,l])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{k.charAt(0).toUpperCase()+k.slice(1)}{l}</button>)}</div>

      {tab==='deposits'&&<div>
        <div className="fRow">{['pending','approved','rejected',''].map(s=><button key={s} className={depFilter===s?'fOn':'fOff'} onClick={()=>setDepFilter(s)}>{s||'All'}</button>)}</div>
        {deposits.length===0?<p className="empty">কোনো deposit নেই।</p>:deposits.map(d=><div key={d.id} className={`card dc-${d.status}`}>
          <div className="ch"><div className="cL"><span className="ico">{ICONS[d.provider]||'💳'}</span><div><p className="cName">{d.display_name}</p><p className="cSub">{d.provider} → {d.to_number}</p></div></div><div className="cR"><span className="amt">৳{Math.round(d.amount_bdt||0).toLocaleString()}</span><span className={`cSt st-${d.status}`}>{d.status==='approved'?'✓':d.status==='pending'?'⏳':'✕'} {d.status}</span></div></div>
          <div className="meta">{d.trx_id&&<span>TrxID: <code>{d.trx_id}</code></span>}{d.sender_number&&<span>Sender: {d.sender_number}</span>}<span>{new Date(d.created_at).toLocaleString('bn-BD')}</span></div>
          {d.screenshot_path&&<a href={`${API}/uploads/${d.screenshot_path.split('/').pop()}`} target="_blank" rel="noreferrer" className="ssLink">📷 Screenshot</a>}
          {d.status==='pending'&&<div className="actions"><input placeholder="Admin note (rejection-এ required)" value={notes[d.id]||''} onChange={e=>setNotes(n=>({...n,[d.id]:e.target.value}))}/><div className="aBtns"><button className="approve" onClick={()=>approveDep(d.id)}>✓ Approve</button><button className="reject" onClick={()=>rejectDep(d.id)}>✕ Reject</button></div></div>}
          {d.status!=='pending'&&d.admin_note&&<p className="adminNote">{d.admin_note}</p>}
        </div>)}
      </div>}

      {tab==='withdrawals'&&<div>
        <div className="fRow">{['pending','completed','rejected',''].map(s=><button key={s} className={wdFilter===s?'fOn':'fOff'} onClick={()=>setWdFilter(s)}>{s||'All'}</button>)}</div>
        {withdrawals.length===0?<p className="empty">কোনো withdrawal নেই।</p>:withdrawals.map(w=><div key={w.id} className={`card wc-${w.status}`}>
          <div className="ch"><div className="cL"><span className="ico">{ICONS[w.provider]||'💸'}</span><div><p className="cName">{w.display_name}</p><p className="cSub">{w.provider} → <strong>{w.to_number}</strong>{w.holder_name&&` (${w.holder_name})`}</p></div></div><div className="cR"><span className="amt">৳{Math.round(w.amount_bdt||0).toLocaleString()}</span><span className={`cSt st-${w.status}`}>{w.status==='completed'?'✓ Sent':w.status==='pending'?'⏳':w.status}</span></div></div>
          <div className="meta"><span>{new Date(w.created_at).toLocaleString('bn-BD')}</span>{w.trx_id&&<span>TrxID: <code>{w.trx_id}</code></span>}</div>
          {w.status==='pending'&&<div className="actions"><input placeholder="আপনার বিকাশ TrxID (send করার পর)" value={trxIds[w.id]||''} onChange={e=>setTrxIds(n=>({...n,[w.id]:e.target.value}))}/><input placeholder="Note (optional)" value={notes[w.id]||''} onChange={e=>setNotes(n=>({...n,[w.id]:e.target.value}))} style={{marginTop:6}}/><div className="aBtns"><button className="approve" onClick={()=>approveWd(w.id)}>✓ Sent</button><button className="reject" onClick={()=>rejectWd(w.id)}>✕ Reject & Refund</button></div></div>}
          {w.status!=='pending'&&w.admin_note&&<p className="adminNote">{w.admin_note}</p>}
        </div>)}
      </div>}

      {tab==='accounts'&&<div>
        <div className="accHdr"><p className="hint">Random একটি নম্বর user-দের দেওয়া হবে।</p><button className="addBtn2" onClick={()=>setShowAdd(s=>!s)}>{showAdd?'✕':'+ যোগ করুন'}</button></div>
        {showAdd&&<div className="addForm">
          <div className="pGrid">{['bkash','nagad','rocket','upay'].map(p=><button key={p} className={`pBtn ${newAcc.provider===p?'sel':''}`} onClick={()=>setNewAcc(a=>({...a,provider:p}))}>{ICONS[p]} {p.charAt(0).toUpperCase()+p.slice(1)}</button>)}</div>
          <input value={newAcc.number} onChange={e=>setNewAcc(a=>({...a,number:e.target.value}))} placeholder="01XXXXXXXXX"/>
          <input value={newAcc.holderName} onChange={e=>setNewAcc(a=>({...a,holderName:e.target.value}))} placeholder="Account holder name" style={{marginTop:6}}/>
          <button className="saveBtn" onClick={addAcc}>Save</button>
        </div>}
        {['bkash','nagad','rocket','upay'].map(prov=>{const pa=accounts.filter(a=>a.provider===prov);if(!pa.length)return null;return(<div key={prov} className="provGroup"><p className="provTitle">{ICONS[prov]} {prov.charAt(0).toUpperCase()+prov.slice(1)} ({pa.length})</p>{pa.map(a=><div key={a.id} className={`accRow ${a.is_active?'active':'inactive'}`}><div><p className="accNum">{a.number}</p>{a.holder_name&&<p className="accHolder">{a.holder_name}</p>}</div><div className="accActs"><button className={`tgl ${a.is_active?'on':'off'}`} onClick={()=>toggleAcc(a.id,a.is_active)}>{a.is_active?'✓ Active':'✕ Off'}</button><button className="del" onClick={()=>delAcc(a.id)}>🗑</button></div></div>)}</div>);}) }
        {accounts.length===0&&<p className="empty">কোনো account নেই।</p>}
      </div>}

      {tab==='commission'&&<div>
        <p className="hint">Commission ও rate এখান থেকে পরিবর্তন করুন।</p>
        <div className="settList">{Object.entries(COMM_LABELS).map(([key,{l,h}])=><div key={key} className="settRow"><div className="sLabel"><p className="sName">{l}</p><p className="sHint">{h}</p></div><input type="number" step="0.1" value={settEdits[key]||''} onChange={e=>setSettEdits(s=>({...s,[key]:e.target.value}))} className="sInput"/></div>)}</div>
        <div className="preview">
          <h4>Preview</h4>
          <PR l="Account ৳10,000 বিক্রি হলে platform পাবে:" v={`৳${Math.round(10000*(settEdits.listing_commission_pct||8)/100).toLocaleString()}`}/>
          <PR l="Tournament pool ৳10,000 — Winner পাবে:" v={`৳${Math.round(10000*(settEdits.tournament_winner_pct||85)/100).toLocaleString()}`}/>
          <PR l="Exchange rate:" v={`৳${settEdits.bdt_to_usd_rate||110} = $1`}/>
        </div>
        <button className="saveBtn big" onClick={saveSettings}>💾 Save All Settings</button>
      </div>}

      <style jsx>{`
        .page{max-width:720px;margin:0 auto;padding:18px 14px 60px;color:#F4F1EA;font-family:system-ui,sans-serif;background:#05060a;min-height:100vh;}
        .hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px;}.back{color:#9C9FB0;font-size:13px;text-decoration:none;}h1{margin:0;font-size:20px;}
        .flash{padding:10px 14px;border-radius:10px;margin-bottom:14px;font-size:13px;}.flash.ok{background:rgba(32,209,121,.15);color:#20D179;}.flash.err{background:rgba(240,79,122,.15);color:#F04F7A;}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px;}
        .tabs{display:flex;gap:5px;margin-bottom:16px;flex-wrap:wrap;}
        .tabs button{flex:1;padding:9px 6px;border-radius:9px;border:1px solid #262a3a;background:#14161F;color:#9C9FB0;font:600 11.5px system-ui;cursor:pointer;transition:all .13s;white-space:nowrap;}
        .tabs button.on{border-color:#FF7A1A;color:#FF7A1A;background:rgba(255,122,26,.08);}
        .fRow{display:flex;gap:5px;margin-bottom:12px;flex-wrap:wrap;}
        .fOn,.fOff{padding:6px 12px;border-radius:999px;font:600 11.5px system-ui;cursor:pointer;border:1px solid #262a3a;}
        .fOn{background:#262a3a;color:#F4F1EA;}.fOff{background:transparent;color:#9C9FB0;}
        .card{background:#14161F;border:1px solid #262a3a;border-radius:12px;padding:13px;margin-bottom:10px;}
        .dc-approved,.wc-completed{border-color:#20D17333;}.dc-rejected,.wc-rejected{opacity:.75;}
        .ch{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;}
        .cL{display:flex;align-items:center;gap:10px;}.ico{font-size:24px;}
        .cName{margin:0 0 2px;font:700 14px system-ui;}.cSub{margin:0;font-size:11.5px;color:#9C9FB0;}
        .cR{text-align:right;}.amt{display:block;font-size:18px;font-weight:800;}
        .cSt{display:block;font-size:11px;font-weight:700;}
        .st-pending{color:#F0A94F;}.st-approved,.st-completed{color:#20D179;}.st-rejected{color:#F04F7A;}
        .meta{display:flex;gap:10px;font-size:11px;color:#9C9FB0;margin-bottom:8px;flex-wrap:wrap;}
        code{font-family:monospace;color:#F4F1EA;}.ssLink{display:inline-block;font-size:12px;color:#4FA9F0;margin-bottom:8px;}
        .actions{border-top:1px solid #262a3a;padding-top:10px;margin-top:6px;}
        input{background:#0B0D14;border:1px solid #262a3a;color:#F4F1EA;padding:9px 11px;border-radius:9px;font-size:13px;width:100%;box-sizing:border-box;transition:border-color .14s;}
        input:focus{outline:none;border-color:#FF7A1A;}
        .aBtns{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px;}
        .approve{padding:9px;border-radius:8px;border:none;background:rgba(32,209,121,.2);color:#20D179;font:700 12.5px system-ui;cursor:pointer;}
        .reject{padding:9px;border-radius:8px;border:none;background:rgba(240,79,122,.15);color:#F04F7A;font:700 12.5px system-ui;cursor:pointer;}
        .adminNote{font-size:11.5px;color:#9C9FB0;background:#0B0D14;padding:7px 10px;border-radius:7px;margin:6px 0 0;}
        .accHdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
        .hint{color:#9C9FB0;font-size:12.5px;margin:0 0 8px;}
        .addBtn2{padding:8px 14px;border-radius:9px;border:none;background:#FF7A1A;color:#101014;font:700 13px system-ui;cursor:pointer;}
        .addForm{background:#14161F;border:1px solid #262a3a;border-radius:11px;padding:14px;margin-bottom:14px;}
        .pGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-bottom:10px;}
        .pBtn{display:flex;align-items:center;gap:6px;padding:9px;border-radius:9px;border:1px solid #262a3a;background:#0B0D14;color:#9C9FB0;font:600 12.5px system-ui;cursor:pointer;transition:all .13s;}
        .pBtn.sel{border-color:#FF7A1A;color:#F4F1EA;}
        .saveBtn{width:100%;margin-top:10px;padding:12px;border-radius:10px;border:none;background:#20D179;color:#101014;font:700 14px system-ui;cursor:pointer;}
        .saveBtn.big{background:#FF7A1A;margin-top:18px;font-size:15px;padding:14px;}
        .provGroup{margin-bottom:16px;}.provTitle{font:700 12px system-ui;text-transform:uppercase;letter-spacing:.06em;color:#9C9FB0;margin:0 0 8px;}
        .accRow{display:flex;align-items:center;justify-content:space-between;background:#14161F;border:1px solid #262a3a;border-radius:10px;padding:10px 12px;margin-bottom:6px;}
        .accRow.inactive{opacity:.55;}.accNum{margin:0 0 2px;font:700 15px monospace;color:#F4F1EA;letter-spacing:.03em;}.accHolder{margin:0;font-size:11.5px;color:#9C9FB0;}
        .accActs{display:flex;gap:7px;}.tgl{padding:6px 11px;border-radius:7px;border:none;font:600 11.5px system-ui;cursor:pointer;}
        .tgl.on{background:rgba(32,209,121,.15);color:#20D179;}.tgl.off{background:rgba(240,79,122,.12);color:#F04F7A;}
        .del{padding:6px 9px;border-radius:7px;border:none;background:rgba(240,79,122,.1);color:#F04F7A;font-size:15px;cursor:pointer;}
        .settList{display:flex;flex-direction:column;gap:10px;margin-bottom:18px;}
        .settRow{display:flex;align-items:center;justify-content:space-between;background:#14161F;border:1px solid #262a3a;border-radius:11px;padding:12px 14px;gap:14px;}
        .sLabel{flex:1;}.sName{margin:0 0 2px;font:600 13.5px system-ui;}.sHint{margin:0;font-size:11.5px;color:#9C9FB0;}
        .sInput{width:90px!important;text-align:center;font-size:15px!important;font-weight:700;flex-shrink:0;}
        .preview{background:#14161F;border:1px solid #262a3a;border-radius:12px;padding:14px;margin-top:6px;}
        .preview h4{margin:0 0 10px;font-size:12px;color:#9C9FB0;text-transform:uppercase;letter-spacing:.06em;}
        .empty{text-align:center;padding:30px 0;color:#9C9FB0;font-size:13px;}
      `}</style>
    </div>
  );
}
function SB({l,v,c}){return<div style={{background:'#14161F',border:'1px solid #262a3a',borderRadius:10,padding:11,textAlign:'center'}}><p style={{margin:'0 0 3px',fontSize:19,fontWeight:800,color:c}}>{v}</p><p style={{margin:0,fontSize:9.5,color:'#9C9FB0',textTransform:'uppercase',letterSpacing:'.04em'}}>{l}</p></div>;}
function PR({l,v}){return<div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #262a3a',fontSize:'12.5px',gap:10}}><span style={{color:'#9C9FB0'}}>{l}</span><span style={{fontWeight:600}}>{v}</span></div>;}
