import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
export default function Search() {
  const router = useRouter();
  const [q,setQ]=useState(''); const [results,setResults]=useState([]); const [loading,setLoading]=useState(false); const [searched,setSearched]=useState(false);
  const timer = useRef();
  async function search(val){
    setQ(val); clearTimeout(timer.current);
    if(!val.trim()||val.trim().length<2){setResults([]);setSearched(false);return;}
    timer.current=setTimeout(async()=>{
      setLoading(true); setSearched(true);
      const r=await fetch(`${API}/api/profile/search?q=${encodeURIComponent(val)}`).then(r=>r.json()).catch(()=>[]);
      setResults(Array.isArray(r)?r:[]); setLoading(false);
    },350);
  }
  async function byUid(){
    if(!q.trim()) return; setLoading(true);
    try{
      const r=await fetch(`${API}/api/profile/uid/${q.trim()}`).then(r=>r.json());
      if(r.user) { router.push(`/profile/${r.user.username||r.user.id}`); return; }
    }catch{}
    setLoading(false);
  }
  return (
    <div className="page">
      <header className="hdr"><Link href="/" className="back">← Home</Link><h1>🔍 Player Search</h1></header>
      <div className="sBox"><input value={q} onChange={e=>search(e.target.value)} placeholder="Username, নাম বা eFootball UID…" autoFocus onKeyDown={e=>e.key==='Enter'&&byUid()}/></div>
      <div className="btnRow"><button className="sb" onClick={()=>search(q)}>Search</button><button className="ub" onClick={byUid}>UID দিয়ে খুঁজুন</button></div>
      {loading&&<p className="hint">Searching…</p>}
      {searched&&!loading&&results.length===0&&<div className="empty"><p>"{q}" দিয়ে কেউ পাওয়া যায়নি।</p></div>}
      {results.length>0&&<div className="results"><p className="count">{results.length} player পাওয়া গেছে</p>
        {results.map(p=>{
          const av=p.avatarUrl?.startsWith('http')?p.avatarUrl:p.avatarUrl?`${API}${p.avatarUrl}`:`https://api.dicebear.com/7.x/thumbs/svg?seed=${p.user_id}`;
          return <Link key={p.user_id} href={`/profile/${p.username||p.user_id}`} className="pCard">
            <img src={av} alt="" className="pAv"/>
            <div className="pInfo"><p className="pName">{p.displayName}</p>{p.username&&<p className="pUser">@{p.username}</p>}{p.efootball_uid&&<p className="pUid">⚽ {p.efootball_uid}</p>}</div>
            <div className="pStats">{p.wins>0&&<span className="pWin">🏆 {p.wins}</span>}</div>
          </Link>;
        })}
      </div>}
      <style jsx>{`
        .page{max-width:480px;margin:0 auto;padding:18px 14px 60px;background:#05060a;min-height:100vh;color:#F4F1EA;font-family:system-ui,sans-serif;}
        .hdr{display:flex;align-items:center;gap:12px;margin-bottom:18px;} .back{color:#9C9FB0;font-size:13px;text-decoration:none;} h1{margin:0;font-size:20px;}
        .sBox{margin-bottom:10px;} input{background:#14161F;border:1px solid #262a3a;color:#F4F1EA;padding:12px 14px;border-radius:11px;font-size:14px;width:100%;box-sizing:border-box;transition:border-color .14s;}
        input:focus{outline:none;border-color:#FF7A1A;}
        .btnRow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;}
        .sb{padding:11px;border-radius:10px;border:none;background:#FF7A1A;color:#101014;font:700 13px system-ui;cursor:pointer;}
        .ub{padding:11px;border-radius:10px;border:1px solid #262a3a;background:transparent;color:#9C9FB0;font:600 13px system-ui;cursor:pointer;}
        .hint{color:#9C9FB0;font-size:13px;text-align:center;padding:10px 0;}
        .empty{text-align:center;padding:30px 0;color:#9C9FB0;}
        .count{font-size:12px;color:#9C9FB0;margin:0 0 10px;} .results{display:flex;flex-direction:column;gap:8px;}
        .pCard{display:flex;align-items:center;gap:12px;padding:12px;background:#14161F;border:1px solid #262a3a;border-radius:12px;text-decoration:none;color:#F4F1EA;transition:border-color .14s,transform .14s;}
        .pCard:hover{border-color:#FF7A1A33;transform:translateY(-1px);}
        .pAv{width:46px;height:46px;border-radius:50%;object-fit:cover;background:#262a3a;flex-shrink:0;}
        .pInfo{flex:1;min-width:0;} .pName{margin:0 0 2px;font:700 14px system-ui;} .pUser,.pUid{margin:0 0 1px;font-size:11.5px;color:#9C9FB0;}
        .pStats{display:flex;flex-direction:column;align-items:flex-end;} .pWin{font:700 12px system-ui;color:#FFD700;}
      `}</style>
    </div>
  );
}
