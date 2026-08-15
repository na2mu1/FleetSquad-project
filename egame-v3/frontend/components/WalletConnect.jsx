import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useWallet } from '../lib/useWallet';

export default function WalletConnect({ onConnected, redirectTo = '/' }) {
  const { connecting, error, signup, login, loginWithGoogle } = useWallet();
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localErr, setLocalErr] = useState(null);
  const googleBtnRef = useRef(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  function handleSuccess() {
    if (onConnected) onConnected();
    router.push(redirectTo);
  }

  useEffect(() => {
    if (!clientId) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (!window.google || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          try {
            await loginWithGoogle(resp.credential);
            handleSuccess();
          } catch (e) { setLocalErr(e.message); }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_blue', size: 'large', shape: 'pill', width: 280, text: mode === 'signup' ? 'signup_with' : 'signin_with',
      });
    };
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, [clientId, mode]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalErr(null);
    if (!email.trim() || !password.trim()) { setLocalErr('Email আর password দিন'); return; }
    try {
      if (mode === 'signup') await signup(email.trim(), password, name.trim());
      else await login(email.trim(), password);
      handleSuccess();
    } catch (e) { setLocalErr(e.message); }
  }

  return (
    <div className="wrap">
      <div className="card">
        <div className="brandRow">
          <img src="/logo.png" alt="" className="logo" />
        </div>
        <h2>{mode === 'signup' ? 'Account বানান' : 'স্বাগতম, ফিরে আসার জন্য ধন্যবাদ'}</h2>
        <p className="sub">Buy, sell &amp; compete — AI-appraised game accounts, escrow-protected trades.</p>

        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => setMode('login')}>Log in</button>
          <button type="button" className={mode === 'signup' ? 'tab active' : 'tab'} onClick={() => setMode('signup')}>Sign up</button>
        </div>

        {clientId && <div className="googleWrap" ref={googleBtnRef} />}
        {clientId && <div className="divider"><span>অথবা email দিয়ে</span></div>}

        <form onSubmit={handleSubmit} className="formBox">
          {mode === 'signup' && (
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Display name" />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (কমপক্ষে ৬ অক্ষর)" />
          <button className="primaryBtn" type="submit" disabled={connecting}>
            {connecting ? '…' : mode === 'signup' ? 'Sign up' : 'Log in'}
          </button>
        </form>

        {(error || localErr) && <p className="err">⚠ {localErr || error}</p>}
      </div>
      <style jsx>{`
        .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
          background:radial-gradient(1200px 600px at 50% -10%, rgba(32,129,226,.14), transparent), var(--bg);}
        .card{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
          padding:32px 26px;text-align:center;animation:fu .35s cubic-bezier(.22,1,.36,1);
          box-shadow:var(--shadow-lg);}
        @keyframes fu{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}
        .brandRow{display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
        .logo{width:60px;height:60px;border-radius:16px;object-fit:contain;box-shadow:var(--shadow-md);}
        h2{margin:0 0 6px;font:800 20px var(--font-main);color:var(--text);letter-spacing:-0.01em;}
        .sub{margin:0 0 22px;font-size:12.5px;color:var(--text-dim);font-family:var(--font-main);line-height:1.55;}
        .tabs{display:flex;background:var(--bg-elevated);border:1px solid var(--border);border-radius:12px;padding:4px;margin-bottom:18px;}
        .tab{flex:1;padding:9px;border:none;background:transparent;color:var(--text-dim);font:700 13px var(--font-main);border-radius:9px;cursor:pointer;transition:background .15s,color .15s;}
        .tab.active{background:var(--accent-grad);color:#fff;}
        .googleWrap{display:flex;justify-content:center;margin-bottom:12px;min-height:40px;}
        .divider{display:flex;align-items:center;gap:10px;color:var(--text-faint);font:600 11px var(--font-main);margin:8px 0 16px;}
        .divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--border);}
        .formBox{display:flex;flex-direction:column;gap:10px;}
        input{background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);padding:12px 14px;border-radius:12px;
          font-size:13.5px;width:100%;box-sizing:border-box;font-family:var(--font-main);transition:border-color .15s,box-shadow .15s;}
        input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(32,129,226,.15);}
        .primaryBtn{margin-top:8px;padding:13px;border-radius:12px;border:none;background:var(--accent-grad);color:#fff;
          font:700 14px var(--font-main);cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:var(--shadow-glow);}
        .primaryBtn:hover:not(:disabled){transform:translateY(-1px);}
        .primaryBtn:disabled{opacity:.6;}
        .err{color:var(--danger);font-size:12.5px;margin:14px 0 0;font-family:var(--font-main);}
      `}</style>
    </div>
  );
}
