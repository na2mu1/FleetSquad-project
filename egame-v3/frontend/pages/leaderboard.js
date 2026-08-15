import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLeaderboard()
      .then(d => setRows(d.leaderboard || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>🏆 Leaderboard</h1>
          <p className="tag">Tournament উইনারদের র‍্যাঙ্কিং — wins, prize money আর win-rate অনুযায়ী।</p>
        </div>
        <Link href="/" className="backLink">← Marketplace</Link>
      </header>

      {loading ? (
        <div className="loadingRows">{[...Array(6)].map((_, i) => <div className="skelRow" key={i} />)}</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <p>এখনো কোনো tournament সম্পন্ন হয়নি — champion দের এখানে দেখা যাবে।</p>
          <Link href="/tournaments" className="cta">Tournaments দেখুন</Link>
        </div>
      ) : (
        <>
          {top3.length > 0 && (
            <div className="podium">
              {top3.map((p) => (
                <div key={p.userId} className={`podiumCard rank-${p.rank}`}>
                  <div className="medal">{MEDALS[p.rank - 1]}</div>
                  <img src={p.avatarUrl} alt="" className="avatar" />
                  <div className="name">{p.displayName}</div>
                  <div className="stat"><b>{p.wins}</b> win{p.wins !== 1 ? 's' : ''}</div>
                  <div className="prize">${p.totalPrizeUsd.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className="table">
              <div className="tableHead">
                <span>Rank</span><span>Player</span><span>Tournaments</span><span>Wins</span><span>Win rate</span><span>Prize won</span>
              </div>
              {rest.map(p => (
                <div className="tableRow" key={p.userId}>
                  <span className="rankNum">#{p.rank}</span>
                  <span className="playerCell">
                    <img src={p.avatarUrl} alt="" className="avatarSm" />
                    {p.displayName}
                  </span>
                  <span>{p.tournamentsPlayed}</span>
                  <span>{p.wins}</span>
                  <span>{p.winRate}%</span>
                  <span className="prizeCell">${p.totalPrizeUsd.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .page { max-width: 1000px; margin: 0 auto; padding: 22px 14px 60px; color: var(--text); font-family: var(--font-main); }
        .top { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 26px; }
        h1 { margin: 0 0 2px; font-size: 24px; }
        .tag { margin: 0; color: var(--text-dim); font-size: 12.5px; max-width: 440px; }
        .backLink { color: var(--accent-hover); font-size: 13px; text-decoration: none; }

        .podium { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 30px; }
        .podiumCard { background: linear-gradient(180deg, var(--surface) 0%, var(--bg-elevated) 100%); border: 1px solid var(--border);
          border-radius: 18px; padding: 22px 14px; text-align: center; position: relative; overflow: hidden; }
        .rank-1 { border-color: #FFD70055; box-shadow: 0 0 0 1px #FFD70022, 0 10px 30px -12px #FFD70033; order: 2; transform: scale(1.05); }
        .rank-2 { order: 1; }
        .rank-3 { order: 3; }
        .medal { font-size: 26px; margin-bottom: 6px; }
        .avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; border: 2px solid var(--accent); }
        .name { font-weight: 700; font-size: 14.5px; margin-bottom: 6px; word-break: break-word; }
        .stat { color: var(--text-dim); font-size: 12.5px; margin-bottom: 4px; }
        .stat b { color: var(--text); }
        .prize { color: var(--success); font-weight: 700; font-size: 15px; }

        .table { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
        .tableHead, .tableRow { display: grid; grid-template-columns: 60px 1fr 90px 60px 80px 100px; align-items: center; padding: 12px 16px; gap: 8px; }
        .tableHead { color: var(--text-faint); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
        .tableRow { border-bottom: 1px solid #1c1e29; font-size: 13px; transition: background .12s; }
        .tableRow:last-child { border-bottom: none; }
        .tableRow:hover { background: #191b26; }
        .rankNum { color: var(--text-faint); font-weight: 600; }
        .playerCell { display: flex; align-items: center; gap: 8px; font-weight: 600; }
        .avatarSm { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; }
        .prizeCell { color: var(--success); font-weight: 700; }

        .empty { text-align: center; padding: 60px 0; color: var(--text-dim); }
        .cta { display: inline-block; margin-top: 14px; background: var(--accent); color: #fff; padding: 10px 18px; border-radius: 999px; text-decoration: none; font: 700 13px system-ui; }
        .loadingRows { display: flex; flex-direction: column; gap: 8px; }
        .skelRow { height: 46px; border-radius: 10px; background: linear-gradient(90deg,var(--surface) 25%,#1b1e29 37%,var(--surface) 63%); background-size: 400% 100%; animation: shimmer 1.4s infinite; }
        @keyframes shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

        @media (max-width: 640px) {
          .tableHead, .tableRow { grid-template-columns: 40px 1fr 60px 50px; }
          .tableHead span:nth-child(5), .tableHead span:nth-child(6),
          .tableRow span:nth-child(5) { display: none; }
          .tableRow span:nth-child(6) { grid-column: 4; }
        }
      `}</style>
    </div>
  );
}
