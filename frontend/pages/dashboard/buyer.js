import { useEffect, useState } from 'react';
import Link from 'next/link';
const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
function authH(){return typeof window!=='undefined'&&localStorage.getItem('egm_token')?{Authorization:`Bearer ${localStorage.getItem('egm_token')}`}:{};}
async function apiFetch(url,opts={}){const r=await fetch(API+url,{...opts,headers:{...authH(),'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Error ${r.status}`);return d;}
const STEPS=['পেমেন্ট','Escrow-এ','Transfer','Confirm','সম্পন্ন'];
const SMAP={awaiting_deposit:0,funded:1,transfer_in_progress:2,confirmed:3,released:4,refunded:4,disputed:2};
export default function BuyerDashboard(){
  const[escrows,setEscrows]=useState([]);const[rate,setRate]=useState(110);const[flash,setFlash]=useState(null);const[disputeId,setDisputeId]=useState(null);const[reason,setReason]=useState('');const[evFile,setEvFile]=useState(null);const[loading,setLoading]=useState(true);
  const bdt=(usd)=>`৳${Math.round((usd||0)*rate).toLocaleString()}`;
  function toast(msg,ok=true){setFlash({msg,ok});setTimeout(()=>setFlash(null),4000);}
  async function load(){
    try{
      let myId=null;try{myId=JSON.parse(atob(localStorage.getItem('egm_token').split('.')[1])).userId;}catch{}
      const[es,sett]=await Promise.all([apiFetch('/api/escrow/mine'),fetch(`${API}/api/settings/public`).then(r=>r.json())]);
      setEscrows((Array.isArray(es)?es:[]).filter(e=>e.buyer_id===myId));if(sett.bdtToUsd)setRate(Math.round(1/sett.bdtToUsd));
    }catch(e){if(e.message.includes('401'))window.location.href='/auth/login';}finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);
  async function confirm(id){try{await apiFetch(`/api/escrow/${id}/confirm`,{method:'POST'});await apiFetch(`/api/escrow/${id}/release`,{method:'POST'});toast('✓ Confirmed! Seller-কে payment পাঠানো হয়েছে।');load();}catch(e){toast(e.message,false);}}
  async function dispute(){if(!reason.trim()||reason.trim().length<10){toast('কারণ বিস্তারিত লিখুন',false);return;}if(!evFile){toast('Evidence file দিন',false);return;}
    const fd=new FormData();fd.append('reason',reason);fd.append('evidence',evFile);
    try{await fetch(`${API}/api/escrow/${disputeId}/dispute`,{method:'POST',headers:authH(),body:fd}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Error');});toast('Dispute খোলা হয়েছে।');setDisputeId(null);setReason('');setEvFile(null);load();}catch(e){toast(e.message,false);}
  }
  return(
    <div className="page">
      <header className="hdr"><Link href="/" className="back">← Home</Link><h1>My Purchases</h1></header>
      {flash&&<div className={`flash ${flash.ok===false?'err':'ok'}`}>{flash.msg}</div>}
      {loading?<p className="hint">Loading…</p>:escrows.length===0?<div className="empty"><p>কোনো purchase নেই।</p><Link href="/" className="browseBtn">Marketplace Browse করুন</Link></div>:
        <div className="list">{escrows.map(e=>{const step=SMAP[e.status]??0;const done=e.status==='released';const disp=e.status==='disputed';
          return(<div key={e.id} className={`card ${done?'done':disp?'disp':''}`}>
            <div className="ch"><span className="amt">{bdt(e.amount)}</span><span className={`st st-${e.status}`}>{done?'✓ সম্পন্ন':disp?'⚠ Disputed':e.status==='refunded'?'↩ Refunded':'⏳ '+e.status.replace(/_/g,' ')}</span></div>
            <div className="tracker">{STEPS.map((s,i)=><div key={s} className="step"><div className={`dot ${i<step?'done':i===step?'act':''}`}>{i<step?'✓':i+1}</div><span className={`sl ${i===step?'cur':''}`}>{s}</span>{i<STEPS.length-1&&<div className={`line ${i<step?'done':''}`}/>}</div>)}</div>
            <div className="meta"><span>Fee: {bdt(e.commission_amount)}</span><span>Seller: {bdt(e.seller_payout)}</span></div>
            {e.auto_release_at&&e.status==='transfer_in_progress'&&<Timer d={e.auto_release_at}/>}
            <div className="acts">
              <Link href={`/listing/${e.listing_id}`} className="aBtn view">Listing</Link>
              {e.status==='transfer_in_progress'&&<><button className="aBtn confirm" onClick={()=>confirm(e.id)}>✓ Confirm</button><button className="aBtn dispute" onClick={()=>setDisputeId(e.id)}>⚠ Dispute</button></>}
            </div>
          </div>);
        })}</div>}
      {disputeId&&<div className="overlay" onClick={()=>setDisputeId(null)}><div className="modal" onClick={e=>e.stopPropagation()}><h3>⚠ Dispute</h3><p className="hint">সঠিক প্রমাণ দিন।</p><label className="lbl">কারণ *</label><textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="বিস্তারিত লিখুন…" rows={4}/><label className="lbl">Evidence *</label><div className="fileBox" onClick={()=>document.getElementById('ef').click()}>{evFile?`✓ ${evFile.name}`:'📎 File দিন'}<input id="ef" type="file" hidden onChange={e=>setEvFile(e.target.files[0])}/></div><button className="dispBtn" onClick={dispute}>Submit</button><button className="ghostBtn" onClick={()=>setDisputeId(null)}>Cancel</button></div></div>}
      <style jsx>{`.page{max-width:560px;margin:0 auto;padding:18px 14px 60px;color:#F4F1EA;font-family:system-ui,sans-serif;background:#05060a;min-height:100vh;}.hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px;}.back{color:#9C9FB0;font-size:13px;text-decoration:none;}h1{flex:1;margin:0;font-size:20px;}.flash{padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:13px;}.flash.ok{background:rgba(32,209,121,.15);color:#20D179;}.flash.err{background:rgba(240,79,122,.15);color:#F04F7A;}.hint{color:#9C9FB0;font-size:13px;}.empty{text-align:center;padding:40px 0;}.empty p{color:#9C9FB0;margin-bottom:14px;}.browseBtn{display:inline-block;background:#FF7A1A;color:#101014;padding:10px 20px;border-radius:10px;text-decoration:none;font:700 13px system-ui;}.list{display:flex;flex-direction:column;gap:12px;}.card{background:#14161F;border:1px solid #262a3a;border-radius:14px;padding:15px;}.card.done{border-color:#20D17333;}.card.disp{border-color:#F04F7A33;}.ch{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}.amt{font-size:22px;font-weight:800;}.st{font-size:12px;font-weight:700;}.st-released{color:#20D179;}.st-disputed{color:#F04F7A;}.st-funded,.st-transfer_in_progress{color:#F0A94F;}.tracker{display:flex;align-items:flex-start;margin-bottom:12px;overflow-x:auto;}.step{display:flex;flex-direction:column;align-items:center;position:relative;flex:1;min-width:50px;}.dot{width:24px;height:24px;border-radius:50%;border:2px solid #262a3a;display:flex;align-items:center;justify-content:center;font:700 9.5px system-ui;color:#9C9FB0;background:#0B0D14;z-index:1;flex-shrink:0;}.dot.done{background:#20D179;border-color:#20D179;color:#101014;}.dot.act{border-color:#FF7A1A;color:#FF7A1A;}.sl{font-size:8.5px;color:#9C9FB0;margin-top:4px;text-align:center;line-height:1.2;}.sl.cur{color:#FF7A1A;font-weight:700;}.line{position:absolute;top:12px;left:50%;width:100%;height:2px;background:#262a3a;z-index:0;}.line.done{background:#20D179;}.meta{display:flex;gap:12px;font-size:11.5px;color:#9C9FB0;margin-bottom:10px;}.acts{display:flex;gap:7px;}.aBtn{flex:1;padding:9px 8px;border-radius:9px;border:none;font:600 12px system-ui;cursor:pointer;text-align:center;text-decoration:none;display:block;}.aBtn.view{background:rgba(255,122,26,.12);color:#FF7A1A;}.aBtn.confirm{background:rgba(32,209,121,.15);color:#20D179;}.aBtn.dispute{background:rgba(240,79,122,.12);color:#F04F7A;}.overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center;z-index:100;}.modal{background:#14161F;border:1px solid #262a3a;border-radius:20px 20px 0 0;padding:24px 18px 36px;width:100%;max-width:480px;}h3{margin:0 0 6px;font-size:17px;}.lbl{display:block;font-size:11.5px;color:#9C9FB0;margin:12px 0 5px;}textarea{background:#0B0D14;border:1px solid #262a3a;color:#F4F1EA;padding:10px 12px;border-radius:10px;font-size:13px;width:100%;box-sizing:border-box;resize:vertical;min-height:80px;}textarea:focus{outline:none;border-color:#FF7A1A;}.fileBox{background:#0B0D14;border:1px dashed #262a3a;border-radius:9px;padding:11px;text-align:center;color:#9C9FB0;font-size:12.5px;cursor:pointer;margin-bottom:8px;}.dispBtn{width:100%;padding:12px;border-radius:10px;border:none;background:#F04F7A;color:#fff;font:700 14px system-ui;cursor:pointer;margin-bottom:8px;}.ghostBtn{width:100%;padding:11px;border-radius:10px;border:1px solid #262a3a;background:transparent;color:#9C9FB0;font:600 13px system-ui;cursor:pointer;}`}</style>
    </div>
  );
}
function Timer({d}){const[rem,setRem]=useState('');useEffect(()=>{function u(){const diff=new Date(d)-new Date();if(diff<=0){setRem('Auto-releasing…');return;}const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000);setRem(`Auto-release: ${h}h ${m}m`);}u();const t=setInterval(u,30000);return()=>clearInterval(t);},[d]);return<p style={{fontSize:'11.5px',color:'#F0A94F',margin:'0 0 8px'}}>⏱ {rem}</p>;}
