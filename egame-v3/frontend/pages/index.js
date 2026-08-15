import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { api } from '../lib/api';
import { getTheme } from '../lib/gameThemes';
import { useWallet } from '../lib/useWallet';

const GAMES = [
  { value: '', label: 'All games' },
  { value: 'free_fire', label: '🔥 Free Fire' },
  { value: 'pubg_mobile', label: '🪖 PUBG Mobile' },
  { value: 'efootball', label: '⚽ eFootball' },
];
const RANKS_BY_GAME = {
  '': [''], free_fire: ['','Bronze','Silver','Gold','Platinum','Diamond','Heroic','Grandmaster'],
  pubg_mobile: ['','Bronze','Silver','Gold','Platinum','Diamond','Crown','Ace','Ace Master','Ace Dominator','Conqueror'],
  efootball: ['','Beginner','Amateur','Semi-Pro','Professional','Top Rated'],
};
const LIST_TYPES = [{ value:'', label:'All types' },{ value:'fixed', label:'Fixed price' },{ value:'auction', label:'Auction' }];

const NAV_LINKS = [
  { href: '/submit-account', label: 'Sell', icon: '🏷️' },
  { href: '/tournaments',    label: 'Tournaments', icon: '🏆' },
  { href: '/leaderboard',   label: 'Leaderboard', icon: '🥇' },
  { href: '/deposit',       label: 'Deposit', icon: '💳' },
  { href: '/dashboard/seller', label: 'My listings', icon: '📋' },
  { href: '/dashboard/buyer',  label: 'My purchases', icon: '🛒' },
];

export default function Marketplace() {
  const wallet = useWallet();
  const router = useRouter();
  const [filters, setFilters] = useState({ game:'', minPrice:'', maxPrice:'', rank:'', listType:'' });
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('newest');
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const cleaned = Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== ''));
    api.getListings(cleaned)
      .then(rows => {
        const sorted = [...rows];
        if (sortBy === 'price_asc') sorted.sort((a,b) => a.asking_price - b.asking_price);
        if (sortBy === 'price_desc') sorted.sort((a,b) => b.asking_price - a.asking_price);
        setListings(sorted);
      })
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [filters, sortBy]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const fn = (e) => { if (!e.target.closest('.mobileMenu') && !e.target.closest('.hamburger')) setMenuOpen(false); };
    document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
  }, [menuOpen]);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthErr(''); setAuthLoading(true);
    try {
      if (authMode === 'signup') await wallet.signup(email, password, name);
      else await wallet.login(email, password);
      setAuthOpen(false);
      setEmail(''); setPassword(''); setName('');
    } catch(e) { setAuthErr(e.message); }
    finally { setAuthLoading(false); }
  }

  const rankOptions = RANKS_BY_GAME[filters.game] || RANKS_BY_GAME[''];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="wrap">

      {/* ── AUTH MODAL ─────────────────────────────────────────────────── */}
      {authOpen && (
        <div className="modalOverlay" onClick={() => setAuthOpen(false)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <button className="modalClose" onClick={() => setAuthOpen(false)}>✕</button>
            <img src="/logo.png" alt="" className="modalLogo" />
            <div className="authTabs">
              <button className={authMode==='login'?'active':''} onClick={()=>setAuthMode('login')}>Log in</button>
              <button className={authMode==='signup'?'active':''} onClick={()=>setAuthMode('signup')}>Sign up</button>
            </div>
            <form onSubmit={handleAuth} className="authForm">
              {authMode==='signup' && <input value={name} onChange={e=>setName(e.target.value)} placeholder="Display name" />}
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" required />
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" required />
              {authErr && <p className="authErr">⚠ {authErr}</p>}
              <button type="submit" className="authSubmit" disabled={authLoading}>
                {authLoading ? '…' : authMode==='signup' ? 'Create account' : 'Log in'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── STICKY NAV ─────────────────────────────────────────────────── */}
      <header className={`nav ${scrolled?'scrolled':''}`}>
        <div className="navInner">
          <Link href="/" className="brand">
            <img src="/logo.png" alt="" className="brandLogo" />
            <span className="brandText">e-Game<b>Marketplace</b></span>
          </Link>

          {/* Desktop links */}
          <nav className="desktopLinks">
            {NAV_LINKS.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          </nav>

          {/* Auth chip */}
          {wallet.isConnected
            ? <div className="userChip">
                {wallet.avatarUrl && <img src={wallet.avatarUrl} alt="" className="avatarMini" />}
                <span className="userName">{wallet.address}</span>
                <button className="signOutBtn" onClick={wallet.disconnect} title="Sign out">✕</button>
              </div>
            : <button className="signInBtn" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in</button>
          }

          {/* Hamburger */}
          <button className="hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
            <span /><span /><span />
          </button>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="mobileMenu">
            <div className="mobileMenuInner">
              {NAV_LINKS.map(l => (
                <Link key={l.href} href={l.href} className="mobileLink" onClick={() => setMenuOpen(false)}>
                  <span className="mobileLinkIcon">{l.icon}</span>
                  {l.label}
                </Link>
              ))}
              <div className="mobileDivider" />
              {wallet.isConnected
                ? <button className="mobileSignOut" onClick={() => { wallet.disconnect(); setMenuOpen(false); }}>Sign out</button>
                : <button className="mobileSignIn" onClick={() => { setAuthOpen(true); setMenuOpen(false); }}>Sign in / Sign up</button>
              }
            </div>
          </div>
        )}
      </header>

      <div className="page">
        {/* ── HERO ───────────────────────────────────────────────────── */}
        <section className="hero">
          <div className="heroGlow" />
          <p className="eyebrow">AI-APPRAISED · ESCROW-PROTECTED · USDT SETTLEMENT</p>
          <h1>Trade game accounts<br /><span className="grad">with confidence</span></h1>
          <p className="heroSub">Every listing is AI-verified against real screenshots — no fake ranks, no rug pulls. Funds held in escrow until you confirm.</p>
          <div className="heroActions">
            <Link href="/submit-account" className="heroBtnPrimary">Sell an account</Link>
            <Link href="/tournaments" className="heroBtnSecondary">🏆 Tournaments</Link>
          </div>
          <div className="heroStats">
            <div><b>{listings.length}</b><span>active listings</span></div>
            <div><b>8%</b><span>platform fee</span></div>
            <div><b>24/7</b><span>escrow support</span></div>
          </div>
        </section>

        {/* ── FILTER BAR ─────────────────────────────────────────────── */}
        <div className="filterBar">
          <div className="filterRow">
            <select value={filters.game} onChange={e => setFilters(f=>({...f, game:e.target.value, rank:''}))}>
              {GAMES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <select value={filters.rank} onChange={e => setFilters(f=>({...f, rank:e.target.value}))}>
              {rankOptions.map(r => <option key={r} value={r}>{r||'Any rank'}</option>)}
            </select>
            <select value={filters.listType} onChange={e => setFilters(f=>({...f, listType:e.target.value}))}>
              {LIST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input placeholder="Min $" type="number" value={filters.minPrice} onChange={e=>setFilters(f=>({...f,minPrice:e.target.value}))} />
            <input placeholder="Max $" type="number" value={filters.maxPrice} onChange={e=>setFilters(f=>({...f,maxPrice:e.target.value}))} />
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
            </select>
          </div>
        </div>

        {/* ── RESULTS ────────────────────────────────────────────────── */}
        <div className="resultMeta">
          <span>{!loading && `${listings.length} listing${listings.length!==1?'s':''}`}</span>
          {activeFilterCount > 0 && (
            <button className="clearChip" onClick={()=>setFilters({game:'',minPrice:'',maxPrice:'',rank:'',listType:''})}>
              Clear {activeFilterCount} filter{activeFilterCount!==1?'s':''} ✕
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid">{[...Array(6)].map((_,i) => <SkeletonCard key={i} delay={i*0.05} />)}</div>
        ) : listings.length === 0 ? (
          <div className="empty">
            <div className="emptyIcon">🔍</div>
            <p>এই filter-এ কোনো listing নেই।</p>
            <button onClick={()=>setFilters({game:'',minPrice:'',maxPrice:'',rank:'',listType:''})}>Clear filters</button>
          </div>
        ) : (
          <div className="grid">{listings.map((l,i) => <ListingCard key={l.id} listing={l} animDelay={i*0.04} />)}</div>
        )}
      </div>

      <style jsx>{`
        .wrap { min-height: 100vh; }

        /* ── Auth Modal ── */
        .modalOverlay { position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px; }
        .modalCard { position:relative;width:100%;max-width:360px;background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-lg);padding:28px 24px;text-align:center;animation:modalIn .25s cubic-bezier(.22,1,.36,1); }
        @keyframes modalIn { from{opacity:0;transform:scale(.94) translateY(12px);} to{opacity:1;transform:none;} }
        .modalClose { position:absolute;top:14px;right:16px;background:none;border:none;color:var(--text-faint);font-size:18px;cursor:pointer; }
        .modalLogo { width:56px;height:56px;border-radius:14px;object-fit:contain;margin-bottom:14px; }
        .authTabs { display:flex;background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;padding:3px;margin-bottom:16px; }
        .authTabs button { flex:1;padding:8px;border:none;background:transparent;color:var(--text-dim);font:700 13px var(--font-main);border-radius:8px;cursor:pointer;transition:all .15s; }
        .authTabs button.active { background:var(--accent-grad);color:#fff; }
        .authForm { display:flex;flex-direction:column;gap:9px; }
        .authForm input { background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);padding:11px 13px;border-radius:10px;font:14px var(--font-main);width:100%; }
        .authForm input:focus { outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(32,129,226,.14); }
        .authSubmit { margin-top:4px;padding:13px;border-radius:10px;border:none;background:var(--accent-grad);color:#fff;font:700 14px var(--font-main);cursor:pointer;box-shadow:var(--shadow-glow);transition:transform .15s; }
        .authSubmit:hover:not(:disabled) { transform:translateY(-1px); }
        .authSubmit:disabled { opacity:.6; }
        .authErr { color:var(--danger);font-size:12px;margin:0; }

        /* ── Nav ── */
        .nav { position:sticky;top:0;z-index:40;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
          background:rgba(7,8,13,.8);border-bottom:1px solid transparent;transition:border-color .2s,box-shadow .2s; }
        .nav.scrolled { border-color:var(--border);box-shadow:0 8px 30px -12px rgba(0,0,0,.6); }
        .navInner { max-width:1180px;margin:0 auto;padding:12px 18px;display:flex;align-items:center;gap:16px; }
        .brand { display:flex;align-items:center;gap:8px;margin-right:auto; }
        .brandLogo { width:30px;height:30px;border-radius:7px;object-fit:contain; }
        .brandText { font:700 14.5px var(--font-main);color:var(--text);white-space:nowrap; }
        .brandText b { font-weight:800;background:var(--accent-grad);-webkit-background-clip:text;background-clip:text;color:transparent; }
        .desktopLinks { display:flex;gap:20px; }
        .desktopLinks a { color:var(--text-dim);font:600 13px var(--font-main);transition:color .15s;white-space:nowrap; }
        .desktopLinks a:hover { color:var(--text); }
        .userChip { display:flex;align-items:center;gap:6px;background:var(--surface-2);border:1px solid var(--border);padding:4px 8px 4px 5px;border-radius:var(--radius-pill); }
        .avatarMini { width:22px;height:22px;border-radius:50%;object-fit:cover; }
        .userName { font:600 12px var(--font-main);color:var(--text);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .signOutBtn { background:none;border:none;color:var(--text-faint);font-size:12px;cursor:pointer;padding:0 2px; }
        .signInBtn { background:var(--accent-grad);color:#fff;padding:8px 18px;border-radius:var(--radius-pill);font:700 13px var(--font-main);border:none;cursor:pointer;box-shadow:var(--shadow-glow);transition:transform .15s; }
        .signInBtn:hover { transform:translateY(-1px); }
        .hamburger { display:none;flex-direction:column;gap:4px;background:none;border:none;cursor:pointer;padding:4px; }
        .hamburger span { display:block;width:22px;height:2px;background:var(--text-dim);border-radius:2px;transition:all .2s; }

        /* ── Mobile drawer ── */
        .mobileMenu { position:absolute;top:100%;left:0;right:0;z-index:50;background:var(--bg-elevated);border-bottom:1px solid var(--border);animation:slideDown .2s cubic-bezier(.22,1,.36,1); }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px);} to{opacity:1;transform:none;} }
        .mobileMenuInner { max-width:1180px;margin:0 auto;padding:12px 18px 16px;display:flex;flex-direction:column;gap:2px; }
        .mobileLink { display:flex;align-items:center;gap:12px;padding:13px 12px;border-radius:var(--radius-md);color:var(--text);font:600 14px var(--font-main);transition:background .15s; }
        .mobileLink:hover { background:var(--surface-2); }
        .mobileLinkIcon { font-size:18px;width:24px;text-align:center; }
        .mobileDivider { height:1px;background:var(--border);margin:8px 0; }
        .mobileSignOut,.mobileSignIn { padding:13px 12px;border-radius:var(--radius-md);font:700 14px var(--font-main);cursor:pointer;border:none;text-align:left; }
        .mobileSignOut { background:none;color:var(--danger); }
        .mobileSignIn { background:var(--accent-grad);color:#fff;text-align:center; }

        /* ── Page ── */
        .page { max-width:1180px;margin:0 auto;padding:0 18px 70px; }

        /* ── Hero ── */
        .hero { position:relative;padding:48px 0 36px;overflow:hidden; }
        .heroGlow { position:absolute;top:-100px;left:40%;transform:translateX(-50%);width:700px;height:360px;
          background:radial-gradient(closest-side,rgba(32,129,226,.18),transparent 70%);pointer-events:none; }
        .eyebrow { position:relative;margin:0 0 14px;font:800 10.5px var(--font-main);letter-spacing:.1em;color:var(--accent); }
        .hero h1 { position:relative;margin:0 0 14px;font:800 clamp(26px,5.5vw,46px)/1.1 var(--font-main);letter-spacing:-0.025em;max-width:600px; }
        .grad { background:var(--accent-grad);-webkit-background-clip:text;background-clip:text;color:transparent; }
        .heroSub { position:relative;margin:0 0 22px;color:var(--text-dim);font-size:14.5px;line-height:1.65;max-width:520px; }
        .heroActions { position:relative;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:30px; }
        .heroBtnPrimary { background:var(--accent-grad);color:#fff;padding:12px 24px;border-radius:var(--radius-pill);font:700 14px var(--font-main);box-shadow:var(--shadow-glow);transition:transform .15s; }
        .heroBtnPrimary:hover { transform:translateY(-2px); }
        .heroBtnSecondary { background:var(--surface);border:1px solid var(--border-strong);color:var(--text);padding:12px 20px;border-radius:var(--radius-pill);font:700 14px var(--font-main);transition:border-color .15s; }
        .heroBtnSecondary:hover { border-color:var(--accent); }
        .heroStats { position:relative;display:flex;gap:32px;flex-wrap:wrap; }
        .heroStats div { display:flex;flex-direction:column; }
        .heroStats b { font:800 24px var(--font-main);letter-spacing:-0.02em; }
        .heroStats span { font-size:11.5px;color:var(--text-faint);margin-top:1px;text-transform:uppercase;letter-spacing:.04em; }

        /* ── Filter ── */
        .filterBar { background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px;margin-bottom:16px; }
        .filterRow { display:flex;gap:8px;flex-wrap:wrap; }
        .filterBar select,.filterBar input { background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);padding:9px 11px;border-radius:var(--radius-sm);font:500 13px var(--font-main);flex:1;min-width:100px;transition:border-color .15s,box-shadow .15s; }
        .filterBar select:focus,.filterBar input:focus { outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(32,129,226,.12); }

        .resultMeta { display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:var(--text-faint);margin-bottom:14px;min-height:20px; }
        .clearChip { background:transparent;border:1px solid var(--border-strong);color:var(--text-dim);padding:5px 12px;border-radius:var(--radius-pill);font:600 11.5px var(--font-main);cursor:pointer;transition:border-color .15s,color .15s; }
        .clearChip:hover { border-color:var(--danger);color:var(--danger); }

        .grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px; }
        .empty { text-align:center;padding:80px 0; }
        .emptyIcon { font-size:34px;margin-bottom:10px;opacity:.4; }
        .empty p { color:var(--text-dim);margin-bottom:16px;font-size:14px; }
        .empty button { background:var(--surface);border:1px solid var(--border);color:var(--text);padding:10px 22px;border-radius:var(--radius-pill);cursor:pointer;font:600 13px var(--font-main); }

        /* ── Responsive ── */
        @media (max-width: 860px) {
          .desktopLinks { display:none; }
          .hamburger { display:flex; }
          .userChip { display:none; }
          .signInBtn { display:none; }
        }
        @media (max-width: 480px) {
          .hero { padding:32px 0 24px; }
          .heroStats { gap:20px; }
        }
      `}</style>
    </div>
  );
}

function ListingCard({ listing: l, animDelay = 0 }) {
  const theme = getTheme(l.game);
  const isApi = l.verification_type === 'api';
  const belowFloor = l.asking_price < l.floor_price;
  return (
    <Link href={`/listing/${l.id}`} className="card" style={{ animationDelay:`${animDelay}s` }}>
      <div className="banner" style={{ background: theme.tabActiveBg }}>
        <div className="bannerSheen" />
        <span className={`badge ${isApi?'api':''}`}>{isApi ? '✦ API' : '📷 Manual'}</span>
      </div>
      <div className="body">
        <div className="topRow">
          <span className="game" style={{ color: theme.accent }}>{theme.label}</span>
          {l.pass_status?.active && <span className="pass">{l.pass_status.type==='royale_pass'?'👑':'⭐'} {l.pass_status.season||''}</span>}
        </div>
        <h3>UID {l.uid}</h3>
        <p className="meta">Lv.{l.level} · {l.rank||'Unranked'}</p>
        <div className="sep" />
        <div className="priceRow">
          <div><span className="pLabel">Price</span><span className="price">${Number(l.asking_price).toFixed(2)}</span></div>
          {belowFloor && <span className="floor">below floor</span>}
        </div>
        <div className="foot">
          <span className="floorVal">Floor ${Number(l.floor_price).toFixed(2)}</span>
          <span className="type">{l.list_type==='auction'?'🔨 Auction':'🏷 Fixed'}</span>
        </div>
      </div>
      <style jsx>{`
        .card{display:block;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;
          animation:cIn .4s cubic-bezier(.22,1,.36,1) both;transition:transform .22s,border-color .22s,box-shadow .22s;}
        @keyframes cIn{from{opacity:0;transform:translateY(16px) scale(.97);}to{opacity:1;transform:none;}}
        .card:hover{transform:translateY(-6px);border-color:${theme.accent}55;box-shadow:var(--shadow-lg);}
        .banner{height:80px;position:relative;display:flex;align-items:flex-end;justify-content:flex-end;padding:8px;}
        .bannerSheen{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.07),transparent);}
        .badge{position:relative;font:700 10px var(--font-main);background:rgba(7,8,13,.55);backdrop-filter:blur(4px);
          padding:3px 8px;border-radius:var(--radius-pill);color:#fff;border:1px solid rgba(255,255,255,.12);}
        .badge.api{background:rgba(31,206,131,.2);color:#6EEBB4;border-color:rgba(31,206,131,.3);}
        .body{padding:13px 14px 15px;}
        .topRow{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;}
        .game{font:800 10px var(--font-main);text-transform:uppercase;letter-spacing:.07em;}
        h3{margin:2px 0 2px;font:700 15px var(--font-main);letter-spacing:-0.01em;}
        .meta{margin:0;color:var(--text-dim);font-size:12px;}
        .pass{font:700 10px var(--font-main);background:rgba(240,169,79,.14);color:var(--warn);padding:2px 7px;border-radius:5px;}
        .sep{height:1px;background:var(--border);margin:11px 0 10px;}
        .priceRow{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:7px;}
        .pLabel{display:block;font:600 9.5px var(--font-main);color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;}
        .price{font:800 19px var(--font-main);letter-spacing:-0.01em;}
        .floor{font:700 10px var(--font-main);background:rgba(240,169,79,.14);color:var(--warn);padding:3px 7px;border-radius:5px;}
        .foot{display:flex;justify-content:space-between;}
        .floorVal{font-size:11px;color:var(--text-faint);}
        .type{font:600 11px var(--font-main);color:var(--text-dim);}
      `}</style>
    </Link>
  );
}

function SkeletonCard({ delay = 0 }) {
  return (
    <div className="sk" style={{ '--d': `${delay}s` }}>
      <div className="skB" />
      <div className="skBody">
        <div className="skL w60" /><div className="skL w40" /><div className="skL w80 tall" />
      </div>
      <style jsx>{`
        .sk{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;}
        .skB{height:80px;background:linear-gradient(90deg,var(--surface-2) 25%,var(--border-strong) 37%,var(--surface-2) 63%);background-size:400% 100%;animation:sh 1.6s var(--d,0s) infinite;}
        .skBody{padding:13px 14px;display:flex;flex-direction:column;gap:9px;}
        .skL{height:11px;border-radius:5px;background:linear-gradient(90deg,var(--surface-2) 25%,var(--border-strong) 37%,var(--surface-2) 63%);background-size:400% 100%;animation:sh 1.6s var(--d,0s) infinite;}
        .skL.w40{width:40%;}.skL.w60{width:60%;}.skL.w80{width:80%;}.skL.tall{height:20px;margin-top:4px;}
        @keyframes sh{0%{background-position:100% 50%;}100%{background-position:0 50%;}}
      `}</style>
    </div>
  );
}
