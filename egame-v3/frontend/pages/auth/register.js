import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
export default function Register() {
  const router = useRouter();
  const [f,setF]=useState({name:'',email:'',password:'',confirm:''});
  const [loading,setLoading]=useState(false); const [err,setErr]=useState('');
  async function submit(e){ e.preventDefault();
    if(f.password!==f.confirm){setErr('Password মিলছে না');return;}
    if(f.password.length<6){setErr('Password কমপক্ষে ৬ char');return;}
    setLoading(true); setErr('');
    try{ const r=await fetch(`${API}/api/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name,email:f.email.toLowerCase(),password:f.password})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||'Registration failed');
      localStorage.setItem('egm_token',d.token); router.push('/settings');
    }catch(e){setErr(e.message);}finally{setLoading(false);}
  }
  return (
    <div className="p"><div className="c">
      <div className="logo">🎮</div><h1>Register</h1><p className="sub">নতুন account তৈরি করুন</p>
      <form onSubmit={submit}>
        <label>নাম</label><input value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))} placeholder="Full name" required/>
        <label>Email</label><input type="email" value={f.email} onChange={e=>setF(x=>({...x,email:e.target.value}))} placeholder="your@email.com" required/>
        <label>Password</label><input type="password" value={f.password} onChange={e=>setF(x=>({...x,password:e.target.value}))} placeholder="কমপক্ষে ৬ char" required/>
        <label>Confirm Password</label><input type="password" value={f.confirm} onChange={e=>setF(x=>({...x,confirm:e.target.value}))} placeholder="আবার দিন" required/>
        {err&&<p className="err">{err}</p>}
        <button type="submit" disabled={loading}>{loading?'…':'Register করুন'}</button>
      </form>
      <p className="link"><Link href="/auth/login">আগে থেকে account আছে? Login করুন</Link></p>
    </div>
    <style jsx>{`.p{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#05060a;}.c{width:100%;max-width:340px;background:#14161F;border:1px solid #262a3a;border-radius:18px;padding:28px 22px;text-align:center;font-family:system-ui;}.logo{font-size:38px;margin-bottom:8px;}h1{margin:0 0 4px;font-size:20px;background:linear-gradient(135deg,#FF7A1A,#FFD700);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}.sub{margin:0 0 18px;font-size:13px;color:#9C9FB0;}form{display:flex;flex-direction:column;gap:5px;text-align:left;}label{font-size:11px;color:#9C9FB0;margin-top:8px;}input{background:#0B0D14;border:1px solid #262a3a;color:#F4F1EA;padding:10px 12px;border-radius:9px;font-size:14px;}input:focus{outline:none;border-color:#FF7A1A;}.err{color:#F04F7A;font-size:12px;background:rgba(240,79,122,.1);padding:7px 10px;border-radius:7px;}button{margin-top:12px;padding:12px;border-radius:11px;border:none;background:#FF7A1A;color:#101014;font:700 14px system-ui;cursor:pointer;}button:disabled{opacity:.6;}.link{margin:14px 0 0;font-size:13px;color:#9C9FB0;}.link a{color:#FF7A1A;text-decoration:none;}`}</style>
    </div>
  );
}
