import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const CARD_COLORS = { iconic:{bg:'#1a0a00',border:'#FFD700',glow:'#FFD70044',label:'⭐ ICONIC'}, legendary:{bg:'#0d0020',border:'#B15CF0',glow:'#B15CF044',label:'💜 LEGENDARY'}, epic:{bg:'#001a2a',border:'#4FA9F0',glow:'#4FA9F044',label:'💙 EPIC'}, featured:{bg:'#001a0a',border:'#20D179',glow:'#20D17944',label:'💚 FEATURED'}, standard:{bg:'#141414',border:'#9C9FB0',glow:'transparent',label:'STANDARD'} };
const GAME = { free_fire:'🔥 FF', pubg_mobile:'🪖 PUBG', efootball:'⚽ eFootball', other:'🎮' };
export default function Profile() {
  const { query } = useRouter();
  const { username } = query;
  const [data,setData]=useState(null); const [tab,setTab]=useState('cards'); const [loading,setLoading]=useState(true); const [rate,setRate]=useState(110);
  const bdt=(usd)=>`৳${Math.round((usd||0)*rate).toLocaleString()}`;
  useEffect(()=>{ fetch(`${API}/api/settings/public`).then(r=>r.json()).then(d=>{ if(d.bdtToUsd) setRate(Math.round(1/d.bdtToUsd)); }).catch(()=>{}); },[]);
  useEffect(()=>{ if(!username) return; fetch(`${API}/api/profile/${username}`).then(r=>r.json()).then(d=>{setData(d);setLoading(false);}).catch(()=>setLoading(false)); },[username]);
  if(loading) return <Spin/>;
  if(!data?.user) return <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#05060a',color:'#F4F1EA',gap:14,fontFamily:'system-ui'}}><h2>Profile পাওয়া যায়নি</h2><Link href="/search" style={{color:'#FF7A1A'}}>Player Search করুন</Link></div>;
  const { user, cards=[], trophies=[], stats={}, recentTournaments=[] } = data;
  const av = user.avatar_url?.startsWith('http')?user.avatar_url:user.avatar_url?`${API}${user.avatar_url}`:`https://api.dicebear.com/7.x/thumbs/svg?seed=${user.id}`;
  const cover = user.cover_url?(user.cover_url.startsWith('http')?user.cover_url:`${API}${user.cover_url}`):null;
  return (<>
    <Head><title>{user.display_name} — eGame Profile</title><meta property="og:image" content={av}/><meta property="og:description" content={`${stats.tournamentsWon||0} wins · ${bdt(stats.totalPrizeUsd||0)} prize`}/></Head>
    <div className="page">
      <div className="cover" style={cover?{backgroundImage:`url(${cover})`}:{}}><div className="coverGrad"/><Link href="/" className="backBtn">← Home</Link></div>
      <div className="heroRow">
        <div className="avWrap"><img src={av} alt="" className="av"/>{(stats.tournamentsWon||0)>0&&<span className="crown">👑</span>}</div>
        <div className="nameCol">
          <h1>{user.display_name}</h1>
          {user.username&&<p className="uname">@{user.username}</p>}
          {user.efootball_uid&&<p className="euid">⚽ UID: <code>{user.efootball_uid}</code>{user.efootball_name&&` · ${user.efootball_name}`}</p>}
          {user.bio&&<p className="bio">{user.bio}</p>}
        </div>
      </div>
      <div className="stats4">
        <SB l="Played" v={stats.tournamentsPlayed||0} c="#4FA9F0"/>
        <SB l="🏆 Wins" v={stats.tournamentsWon||0} c="#FFD700"/>
        <SB l="Win %" v={`${stats.winRate||0}%`} c="#20D179"/>
        <SB l="💰 Won" v={bdt(stats.totalPrizeUsd||0)} c="#FF7A1A"/>
      </div>
      {trophies.length>0&&<div className="section"><h3>🏆 Trophies ({trophies.length})</h3><div className="tScroll">{trophies.map(t=><div key={t.id} className="tCard"><span className="tIco">{t.placement===1?'🏆':t.placement===2?'🥈':'🥉'}</span><p className="tName">{t.tournament_title}</p><p className="tMeta">{GAME[t.game]||'🎮'}</p>{t.prize_usd>0&&<p className="tPrize">{bdt(t.prize_usd)}</p>}</div>)}</div></div>}
      <div className="tabs"><button className={tab==='cards'?'on':''} onClick={()=>setTab('cards')}>⚽ Cards ({cards.length})</button><button className={tab==='history'?'on':''} onClick={()=>setTab('history')}>📅 History ({recentTournaments.length})</button></div>
      {tab==='cards'&&<div className="section">{cards.length===0?<p className="hint">কোনো card নেই।</p>:<div className="cardGrid">{cards.map(c=><EFCard key={c.id} card={c}/>)}</div>}</div>}
      {tab==='history'&&<div className="section">{recentTournaments.length===0?<p className="hint">কোনো history নেই।</p>:recentTournaments.map(t=><Link key={t.id} href={`/tournament/${t.tournament_id}`} className="hRow"><span>{GAME[t.game]||'🎮'}</span><span className="hTitle">{t.title}</span><span className={`hSt ${t.status==='winner'?'win':t.status==='eliminated'?'out':''}`}>{t.status==='winner'?'🏆 Winner':t.status==='eliminated'?'Eliminated':'In'}</span>{t.prize_won_usd>0&&<span className="hPrize">{bdt(t.prize_won_usd)}</span>}</Link>)}</div>}
    </div>
    <style jsx>{`
      .page{max-width:480px;margin:0 auto;background:#05060a;min-height:100vh;color:#F4F1EA;font-family:system-ui,sans-serif;padding-bottom:40px;}
      .cover{height:140px;background:linear-gradient(135deg,#1a0a30,#0a1a2a);background-size:cover;background-position:center;position:relative;}
      .coverGrad{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,#05060a);}
      .backBtn{position:absolute;top:12px;left:12px;color:rgba(255,255,255,.85);font-size:12.5px;text-decoration:none;background:rgba(0,0,0,.4);padding:5px 11px;border-radius:999px;z-index:2;}
      .heroRow{display:flex;gap:12px;padding:0 14px 14px;margin-top:-40px;position:relative;z-index:1;align-items:flex-end;}
      .avWrap{position:relative;flex-shrink:0;}
      .av{width:80px;height:80px;border-radius:50%;border:3px solid #05060a;object-fit:cover;background:#14161F;display:block;}
      .crown{position:absolute;bottom:-2px;right:-4px;font-size:18px;}
      .nameCol{padding-bottom:4px;flex:1;min-width:0;}
      h1{margin:0 0 2px;font-size:19px;font-weight:800;}
      .uname{margin:0 0 3px;font-size:12.5px;color:#9C9FB0;}
      .euid{margin:0 0 3px;font-size:11.5px;color:#9C9FB0;}
      code{color:#20D179;font-family:monospace;}
      .bio{margin:4px 0 0;font-size:12px;color:#9C9FB0;line-height:1.4;}
      .stats4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:0 14px 14px;}
      .section{padding:0 14px 14px;}
      h3{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#9C9FB0;margin:0 0 8px;}
      .tScroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;}
      .tCard{flex:0 0 auto;background:#14161F;border:1px solid #262a3a;border-radius:10px;padding:10px 12px;min-width:120px;}
      .tIco{font-size:20px;display:block;margin-bottom:4px;}
      .tName{margin:0 0 2px;font-size:11.5px;font-weight:700;line-height:1.2;}
      .tMeta{margin:0 0 2px;font-size:10px;color:#9C9FB0;}
      .tPrize{margin:0;font-size:12px;font-weight:700;color:#20D179;}
      .tabs{display:flex;border-bottom:1px solid #262a3a;margin:0 0 14px;}
      .tabs button{flex:1;padding:11px 6px;background:transparent;border:none;color:#9C9FB0;font:600 12px system-ui;cursor:pointer;border-bottom:2px solid transparent;transition:all .14s;}
      .tabs button.on{color:#FF7A1A;border-bottom-color:#FF7A1A;}
      .hint{color:#9C9FB0;font-size:13px;}
      .cardGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
      .hRow{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#14161F;border-radius:9px;margin-bottom:6px;text-decoration:none;color:#F4F1EA;font-size:12px;}
      .hTitle{flex:1;font-weight:600;}
      .hSt{font-weight:700;font-size:11px;}
      .hSt.win{color:#FFD700;}.hSt.out{color:#F04F7A;}
      .hPrize{color:#20D179;font-weight:700;}
    `}</style>
  </>);
}
function SB({l,v,c}){return <div className="sb"><p className="sv" style={{color:c}}>{v}</p><p className="sl">{l}</p><style jsx>{`.sb{background:#14161F;border:1px solid #262a3a;border-radius:9px;padding:9px 4px;text-align:center;}.sv{margin:0 0 2px;font-size:14px;font-weight:800;}.sl{margin:0;font-size:8.5px;color:#9C9FB0;text-transform:uppercase;letter-spacing:.04em;}`}</style></div>;}
function EFCard({card}){
  const cfg=CARD_COLORS[card.card_type]||CARD_COLORS.standard;
  const img=card.card_image_url?.startsWith('http')?card.card_image_url:card.card_image_url?`${API}${card.card_image_url}`:null;
  return <div className="c" style={{background:cfg.bg,borderColor:cfg.border,boxShadow:`0 0 12px ${cfg.glow}`}}>
    <div className="cTop"><span className="rat">{card.overall_rating||'?'}</span><span className="pos">{card.position||''}</span></div>
    <div className="cImg">{img?<img src={img} alt={card.player_name}/>:<span className="init">{card.player_name?.[0]}</span>}{card.is_maxed?<span className="max">MAX</span>:null}</div>
    <p className="cName">{card.player_name}</p>
    {card.team&&<p className="cTeam">{card.team}</p>}
    <span className="cType" style={{color:cfg.border}}>{cfg.label}</span>
    <style jsx>{`.c{border:1px solid;border-radius:11px;padding:8px;display:flex;flex-direction:column;gap:3px;transition:transform .15s;overflow:hidden;}.c:hover{transform:scale(1.04);}.cTop{display:flex;justify-content:space-between;align-items:center;}.rat{font:900 17px system-ui;color:${cfg.border};}.pos{font:700 8.5px system-ui;color:#9C9FB0;text-transform:uppercase;}.cImg{height:66px;display:flex;align-items:center;justify-content:center;position:relative;}.cImg img{width:100%;height:100%;object-fit:contain;}.init{font-size:26px;font-weight:900;color:${cfg.border};opacity:.6;}.max{position:absolute;top:1px;right:1px;background:#FFD700;color:#101014;font:700 7px system-ui;padding:2px 4px;border-radius:3px;}.cName{margin:0 0 1px;font:700 9.5px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;}.cTeam{margin:0 0 2px;font:500 8.5px system-ui;color:#9C9FB0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.cType{font:700 7.5px system-ui;letter-spacing:.03em;text-align:center;display:block;}`}</style>
  </div>;
}
function Spin(){return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#05060a'}}><div style={{width:32,height:32,border:'3px solid #262a3a',borderTopColor:'#FF7A1A',borderRadius:'50%',animation:'spin .7s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style></div>;}
