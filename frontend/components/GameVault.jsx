import { useState, useEffect } from 'react';
import { getTheme, TABS, RARITY_COLORS } from '../lib/gameThemes';
import { mediaUrl } from '../lib/api';

/* ── Verification badge ── */
function VerifBadge({ verification, theme }) {
  const isApi = verification?.type === 'api';
  return (
    <div className="badge">
      <span className="dot" />
      {isApi ? `API Verified — ${verification.label}` : 'Manual Verification'}
      {verification?.verifiedAt && (
        <span className="date"> · {new Date(verification.verifiedAt).toLocaleDateString()}</span>
      )}
      <style jsx>{`
        .badge { display:inline-flex;align-items:center;gap:6px;font:600 11px ${theme.font};
          padding:5px 11px;border-radius:999px;background:${theme.accentSoft};color:${theme.accent};
          border:1px solid ${theme.accent}44;letter-spacing:.02em; }
        .dot { width:6px;height:6px;border-radius:50%;background:${theme.accent};
          box-shadow:0 0 8px ${theme.accent}; animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
        .date { color:${theme.subtext};font-weight:500; }
      `}</style>
    </div>
  );
}

/* ── Item card with entrance animation ── */
function ItemCard({ item, theme, delay = 0 }) {
  const rarityColor = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
  const glyphs = {
    gun_skin: '🔫', character_bundle: '🧑', emote: '💃', pet: '🐾',
    vehicle: '🚗', backpack: '🎒', gloo_wall: '🧱', costume: '👘',
    outfit: '👔', headgear: '⛑️', shoes: '👟', avatar: '🖼️',
    frame: '🔲', badge: '🏅', weapon_collection: '⚔️', character: '🎭',
  };
  const glyph = glyphs[item.subcategory] || '✨';

  return (
    <div className="card" style={{ animationDelay: `${delay}s` }}>
      <div className="thumb" style={{ borderColor: rarityColor + '88', boxShadow: `0 0 12px ${rarityColor}22` }}>
        <span className="glyph">{glyph}</span>
        <span className="rarityDot" style={{ background: rarityColor }} />
      </div>
      <p className="name">{item.name}</p>
      <span className="rarity" style={{ color: rarityColor }}>
        {(item.rarity || 'common').toUpperCase()}
      </span>
      <style jsx>{`
        .card { background:${theme.panel};border:1px solid ${theme.panelBorder};border-radius:${theme.cardShape};
          ${theme.cornerClip ? 'clip-path:polygon(0 0,100% 0,100% 82%,82% 100%,0 100%);' : ''}
          padding:10px;display:flex;flex-direction:column;gap:6px;cursor:default;
          animation: cardIn .3s cubic-bezier(.22,1,.36,1) both;
          transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease; }
        @keyframes cardIn { from{opacity:0;transform:translateY(8px) scale(.95);} to{opacity:1;transform:none;} }
        .card:hover { transform:translateY(-3px);border-color:${rarityColor}66;box-shadow:0 6px 20px ${rarityColor}18; }
        .thumb { position:relative;aspect-ratio:1;border-radius:calc(${theme.cardShape} - 4px);border:1.5px solid;
          background:linear-gradient(160deg,${theme.bg},${theme.panel});
          display:flex;align-items:center;justify-content:center; }
        .glyph { font-size:22px; }
        .rarityDot { position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%; }
        .name { margin:0;font:600 11.5px ${theme.font};color:${theme.text};line-height:1.25;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden; }
        .rarity { font:700 9px ${theme.font};letter-spacing:.06em; }
      `}</style>
    </div>
  );
}

/* ── Per-tab proof strip ── */
function ProofStrip({ proofs, theme }) {
  if (!proofs?.length) {
    return (
      <p className="empty">
        এই tab-এ এখনো proof upload হয়নি।
        <style jsx>{`.empty{color:${theme.subtext};font:500 12.5px ${theme.font};padding:10px 0 6px;margin:0;}`}</style>
      </p>
    );
  }
  return (
    <div className="strip">
      {proofs.map((p, i) => (
        <a key={p.id} href={mediaUrl(p.filePath)} target="_blank" rel="noreferrer" className="proofItem"
          style={{ animationDelay: `${i * 0.06}s` }}>
          {p.mediaType === 'video'
            ? <video src={mediaUrl(p.filePath)} muted playsInline />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={mediaUrl(p.filePath)} alt="Inventory proof" loading="lazy" />}
          <span className="proofTag">{p.mediaType === 'video' ? '▶ Video' : '📷 Screenshot'}</span>
          {p.capturedAt && (
            <span className="ts">{new Date(p.capturedAt).toLocaleDateString()}</span>
          )}
        </a>
      ))}
      <style jsx>{`
        .strip { display:flex;gap:10px;overflow-x:auto;padding:2px 2px 12px;-webkit-overflow-scrolling:touch;
          scrollbar-width:thin;scrollbar-color:${theme.panelBorder} transparent; }
        .proofItem { position:relative;flex:0 0 auto;width:136px;height:96px;border-radius:11px;overflow:hidden;
          border:1px solid ${theme.panelBorder};display:block;
          animation:proofIn .3s cubic-bezier(.22,1,.36,1) both;
          transition:transform .15s ease,border-color .15s ease; }
        @keyframes proofIn { from{opacity:0;transform:scale(.9);} to{opacity:1;transform:none;} }
        .proofItem:hover { transform:scale(1.03);border-color:${theme.accent}88; }
        .proofItem img,.proofItem video { width:100%;height:100%;object-fit:cover;display:block; }
        .proofTag { position:absolute;left:5px;bottom:5px;font:600 9.5px ${theme.font};
          background:rgba(0,0,0,.65);color:#fff;padding:2px 6px;border-radius:5px; }
        .ts { position:absolute;right:5px;bottom:5px;font:500 9px ${theme.font};
          background:rgba(0,0,0,.55);color:rgba(255,255,255,.7);padding:2px 5px;border-radius:4px; }
      `}</style>
    </div>
  );
}

/* ── Main GameVault ── */
export default function GameVault({ game, account, verification, inventory }) {
  const theme = getTheme(game);
  const [activeTab, setActiveTab] = useState('weapons');
  const [tabVisible, setTabVisible] = useState(true);

  // brief hide → show transition when changing tabs
  function changeTab(key) {
    if (key === activeTab) return;
    setTabVisible(false);
    setTimeout(() => { setActiveTab(key); setTabVisible(true); }, 140);
  }

  const items = inventory?.items?.[activeTab] || [];
  const proofs = inventory?.proofs?.[activeTab] || [];

  // Count items + proofs per tab for indicator dots
  function tabCount(key) {
    const i = (inventory?.items?.[key] || []).length;
    const p = (inventory?.proofs?.[key] || []).length;
    return i + p;
  }

  return (
    <div className="vault">
      {/* Header */}
      <header className="head">
        <div className="titleRow">
          <h2 className="title">
            <span className="screenName">{theme.screenName}</span>
          </h2>
          <VerifBadge verification={verification} theme={theme} />
        </div>
        <div className="statGrid">
          <Stat k="UID" v={account?.uid} theme={theme} />
          <Stat k="Level" v={account?.level} theme={theme} />
          <Stat k="Rank" v={account?.rank || '—'} theme={theme} highlight />
          <Stat
            k={account?.passStatus?.type === 'royale_pass' ? 'Royale Pass' : 'Elite Pass'}
            v={account?.passStatus ? (account.passStatus.active ? `✓ ${account.passStatus.season || 'Active'}` : 'Inactive') : '—'}
            theme={theme}
            highlight={account?.passStatus?.active}
          />
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        {TABS.map(t => {
          const count = tabCount(t.key);
          return (
            <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => changeTab(t.key)}>
              {t.label}
              {count > 0 && <span className="cnt">{count}</span>}
            </button>
          );
        })}
      </nav>

      {/* Tab panel */}
      <section className="panel" style={{ opacity: tabVisible ? 1 : 0, transition: 'opacity .14s ease' }}>
        <h4 className="sectionHead">Proof</h4>
        <ProofStrip proofs={proofs} theme={theme} />

        <h4 className="sectionHead">Declared items ({items.length})</h4>
        {items.length === 0 ? (
          <p className="emptyItems">এই tab-এ কোনো item declare করা হয়নি।</p>
        ) : (
          <div className="grid">
            {items.map((item, i) => (
              <ItemCard key={item.id} item={item} theme={theme} delay={i * 0.04} />
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .vault { background:${theme.bg};color:${theme.text};font-family:${theme.font};
          border-radius:20px;border:1px solid ${theme.panelBorder};overflow:hidden;
          max-width:480px;margin:16px auto; }

        /* Header */
        .head { padding:18px 16px 14px;
          background:linear-gradient(180deg,${theme.accentSoft} 0%,transparent 100%); }
        .titleRow { display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px; }
        .title { margin:0; }
        .screenName { font-size:20px;font-weight:800;letter-spacing:.01em; }

        /* Stat grid */
        .statGrid { display:grid;grid-template-columns:1fr 1fr;gap:10px; }

        /* Tabs */
        .tabs { display:flex;gap:5px;padding:10px 12px;overflow-x:auto;
          border-top:1px solid ${theme.panelBorder};border-bottom:1px solid ${theme.panelBorder};
          -webkit-overflow-scrolling:touch;scrollbar-width:none; }
        .tabs::-webkit-scrollbar { display:none; }
        .tab { flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:8px 13px;border-radius:999px;
          border:1px solid ${theme.panelBorder};background:transparent;color:${theme.subtext};
          font:600 12.5px ${theme.font};cursor:pointer;white-space:nowrap;
          transition:all .17s cubic-bezier(.22,1,.36,1); }
        .tab:hover { border-color:${theme.accent}55;color:${theme.text}; }
        .tab.active { background:${theme.tabActiveBg};color:#101014;border-color:transparent;
          box-shadow:0 2px 12px ${theme.accent}33; }
        .cnt { background:rgba(0,0,0,.25);padding:1px 5px;border-radius:999px;font-size:9.5px; }
        .tab.active .cnt { background:rgba(0,0,0,.2);color:rgba(0,0,0,.7); }

        /* Panel */
        .panel { padding:14px 16px 22px; }
        .sectionHead { font:700 10.5px ${theme.font};text-transform:uppercase;letter-spacing:.09em;
          color:${theme.subtext};margin:0 0 8px; }
        .sectionHead:not(:first-child) { margin-top:18px; }
        .emptyItems { color:${theme.subtext};font-size:12.5px;margin:0 0 4px; }
        .grid { display:grid;grid-template-columns:repeat(3,1fr);gap:10px; }
        @media(min-width:380px) { .grid { grid-template-columns:repeat(4,1fr); } }
      `}</style>
    </div>
  );
}

function Stat({ k, v, theme, highlight }) {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className="v" style={highlight && v !== '—' ? { color: theme.accent } : {}}>{v}</span>
      <style jsx>{`
        .stat { display:flex;flex-direction:column;gap:2px; }
        .k { font:700 9.5px ${theme.font};text-transform:uppercase;letter-spacing:.08em;color:${theme.subtext}; }
        .v { font:700 14px ${theme.font};color:${theme.text}; }
      `}</style>
    </div>
  );
}
