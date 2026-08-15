import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const G_CLIENT = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
export default function Login() {
  const router = useRouter();
  const [email,setEmail]=useState(''); const [pw,setPw]=useState(''); const [loading,setLoading]=useState(false); const [err,setErr]=useState('');
  function save(d){ localStorage.setItem('egm_token',d.token); router.push(router.query.next||'/'); }
  async function submit(e){ e.preventDefault(); setLoading(true); setErr('');
    try{ const r=await fetch(`${API}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.toLowerCase(),password:pw})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||'Login failed'); save(d);
    }catch(e){setErr(e.message);} finally{setLoading(false);}
  }
  useEffect(()=>{
    if(!G_CLIENT) return;
    const s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client';
    s.onload=()=>{ window.google?.accounts?.id?.initialize({client_id:G_CLIENT,callback:(res)=>{
      fetch(`${API}/api/auth/google`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:res.credential})})
        .then(r=>r.json()).then(d=>{ if(d.token) save(d); else setErr(d.error||'Google login failed'); });
    }}); window.google?.accounts?.id?.renderButton(document.getElementById('gBtn'),{theme:'filled_black',size:'large',width:300}); };
    document.head.appendChild(s);
  },[]);
  return (
    <div className="p">
      <div className="c">
        <div className="logo">🎮</div>
        <h1>eGame Marketplace</h1>
        <p className="sub">Login করুন</p>
        {G_CLIENT&&<><div id="gBtn" className="gw"/><div className="or"><span>অথবা</span></div></>}
        <form onSubmit={submit}>
          <label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" required/>
          <label>Password</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" required/>
          {err&&<p className="err">{err}</p>}
          <button type="submit" disabled={loading}>{loading?'…':'Login'}</button>
        </form>
        <p className="reg">নতুন? <Link href="/auth/register">Register করুন</Link></p>
      </div>
      <style jsx>{`
        .p{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#05060a;}
        .c{width:100%;max-width:340px;background:#14161F;border:1px solid #262a3a;border-radius:18px;padding:28px 22px;text-align:center;font-family:system-ui;}
        .logo{font-size:38px;margin-bottom:8px;} h1{margin:0 0 4px;font-size:20px;background:linear-gradient(135deg,#FF7A1A,#FFD700);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
        .sub{margin:0 0 18px;font-size:13px;color:#9C9FB0;} .gw{display:flex;justify-content:center;margin-bottom:12px;min-height:44px;}
        .or{display:flex;align-items:center;gap:8px;margin:0 0 14px;color:#9C9FB0;font-size:12px;}
        .or::before,.or::after{content:'';flex:1;height:1px;background:#262a3a;}
        form{display:flex;flex-direction:column;gap:5px;text-align:left;}
        label{font-size:11px;color:#9C9FB0;margin-top:8px;}
        input{background:#0B0D14;border:1px solid #262a3a;color:#F4F1EA;padding:10px 12px;border-radius:9px;font-size:14px;}
        input:focus{outline:none;border-color:#FF7A1A;}
        .err{color:#F04F7A;font-size:12px;background:rgba(240,79,122,.1);padding:7px 10px;border-radius:7px;}
        button{margin-top:12px;padding:12px;border-radius:11px;border:none;background:#FF7A1A;color:#101014;font:700 14px system-ui;cursor:pointer;}
        button:disabled{opacity:.6;} .reg{margin:14px 0 0;font-size:13px;color:#9C9FB0;} .reg a{color:#FF7A1A;text-decoration:none;}
      `}</style>
    </div>
  );
}
