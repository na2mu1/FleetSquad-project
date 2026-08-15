/**
 * Tournament V2 — Anyone can create, creator decides match results
 *
 * Prize distribution:
 *   12% → platform
 *    3% → tournament creator
 *   85% → winner
 *
 * Public:
 *   GET  /api/t2                   — list tournaments
 *   GET  /api/t2/:id               — detail + bracket
 *
 * Any logged-in user:
 *   POST   /api/t2                 — create tournament
 *   POST   /api/t2/:id/join        — join (pay entry fee from wallet)
 *   DELETE /api/t2/:id/leave       — leave before it starts (refund)
 *
 * Tournament creator only:
 *   PATCH  /api/t2/:id             — edit details (while 'open')
 *   POST   /api/t2/:id/start       — lock roster + generate bracket
 *   POST   /api/t2/:id/match/:mid/result — declare winner of a match
 *   DELETE /api/t2/:id             — cancel (full refund)
 */
const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/init');
const { requireAuth } = require('./auth');
const { creditWallet, debitWallet, getWallet } = require('./manualPayment');

const router = express.Router();

const PLATFORM_PCT = 12;
const CREATOR_PCT  = 3;
const WINNER_PCT   = 100 - PLATFORM_PCT - CREATOR_PCT; // 85

const PLATFORM_ADMIN_WALLET = process.env.PLATFORM_WALLET_USER_ID || null;

/* ─── helpers ─────────────────────────────────────────────────────────── */
function assertCreator(req, res, t) {
  if (t.created_by !== req.user.userId) {
    res.status(403).json({ error: 'Only the tournament creator can do this' });
    return false;
  }
  return true;
}

function generateBracket(tournamentId, playerIds) {
  // Single-elimination bracket
  // Shuffle players
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const total = shuffled.length;
  // Pad to next power of 2 with byes
  const size = Math.pow(2, Math.ceil(Math.log2(total)));
  while (shuffled.length < size) shuffled.push(null); // null = bye

  const matches = [];
  let matchNum = 1;
  let round = 1;
  let pairs = [];

  for (let i = 0; i < size; i += 2) {
    const p1 = shuffled[i];
    const p2 = shuffled[i + 1];
    const mid = uuid();
    // Bye match — auto-advance p1
    const status = (p1 && !p2) || (!p1 && p2) ? 'walkover' : 'pending';
    const winnerId = !p2 ? p1 : (!p1 ? p2 : null);
    matches.push({ id: mid, tournamentId, round, matchNumber: matchNum++, player1Id: p1, player2Id: p2, status, winnerId });
    pairs.push(mid);
  }

  // Insert round 1
  for (const m of matches) {
    db.prepare(`INSERT INTO tournament_matches_v2 (id,tournament_id,round,match_number,player1_id,player2_id,status,winner_id,loser_id)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(m.id, m.tournamentId, m.round, m.matchNumber, m.player1Id, m.player2Id, m.status, m.winnerId || null,
        m.status === 'walkover' && m.winnerId ? (m.player1Id === m.winnerId ? m.player2Id : m.player1Id) : null);
  }
  return matches;
}

function advanceBracket(tournamentId, completedMatchId) {
  const match = db.prepare('SELECT * FROM tournament_matches_v2 WHERE id=?').get(completedMatchId);
  if (!match || !match.winner_id) return;

  const roundMatches = db.prepare('SELECT * FROM tournament_matches_v2 WHERE tournament_id=? AND round=? ORDER BY match_number').all(tournamentId, match.round);
  const allDone = roundMatches.every(m => m.status === 'completed' || m.status === 'walkover');

  if (!allDone) return; // round not finished yet

  const winners = roundMatches.map(m => m.winner_id).filter(Boolean);

  if (winners.length === 1) {
    // Tournament over
    return { tournamentOver: true, winnerId: winners[0] };
  }

  // Generate next round
  const nextRound = match.round + 1;
  let matchNum = 1;
  for (let i = 0; i < winners.length; i += 2) {
    const p1 = winners[i], p2 = winners[i + 1] || null;
    const status = p2 ? 'pending' : 'walkover';
    const winnerId = !p2 ? p1 : null;
    db.prepare(`INSERT INTO tournament_matches_v2 (id,tournament_id,round,match_number,player1_id,player2_id,status,winner_id)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuid(), tournamentId, nextRound, matchNum++, p1, p2, status, winnerId);
  }
  return { tournamentOver: false };
}

function payoutWinner(tournamentId, winnerId) {
  const t = db.prepare('SELECT * FROM tournaments_v2 WHERE id=?').get(tournamentId);
  if (!t || t.prize_pool_usd <= 0) return null;

  const pool     = t.prize_pool_usd;
  const platform = Math.round(pool * (PLATFORM_PCT / 100) * 100) / 100;
  const creator  = Math.round(pool * (CREATOR_PCT  / 100) * 100) / 100;
  const winner   = Math.round(pool * (WINNER_PCT   / 100) * 100) / 100;

  creditWallet(winnerId, winner);
  creditWallet(t.created_by, creator);
  if (PLATFORM_ADMIN_WALLET) creditWallet(PLATFORM_ADMIN_WALLET, platform);

  db.prepare(`UPDATE tournament_players SET status='winner',placement=1,prize_won_usd=? WHERE tournament_id=? AND user_id=?`)
    .run(winner, tournamentId, winnerId);
  db.prepare(`UPDATE tournaments_v2 SET status='completed',updated_at=datetime('now') WHERE id=?`).run(tournamentId);

  return { winner, creator, platform };
}

/* ─── Public: list ────────────────────────────────────────────────────── */
router.get('/', (req, res) => {
  const { game, status } = req.query;
  let sql = `SELECT t.*, u.display_name AS creator_name,
    (SELECT COUNT(*) FROM tournament_players WHERE tournament_id=t.id) AS player_count
    FROM tournaments_v2 t JOIN users u ON u.id=t.created_by WHERE 1=1`;
  const p = [];
  if (game)   { sql += ' AND t.game=?';   p.push(game); }
  if (status) { sql += ' AND t.status=?'; p.push(status); }
  else        { sql += " AND t.status != 'cancelled'"; }
  sql += ' ORDER BY t.created_at DESC';
  res.json(db.prepare(sql).all(...p));
});

/* ─── Public: detail ──────────────────────────────────────────────────── */
router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT t.*, u.display_name AS creator_name FROM tournaments_v2 t JOIN users u ON u.id=t.created_by WHERE t.id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });

  const players = db.prepare(`SELECT tp.*, u.display_name FROM tournament_players tp JOIN users u ON u.id=tp.user_id WHERE tp.tournament_id=? ORDER BY tp.joined_at`).all(req.params.id);
  const matches = db.prepare(`SELECT m.*,
    u1.display_name AS p1_name, u2.display_name AS p2_name, uw.display_name AS winner_name
    FROM tournament_matches_v2 m
    LEFT JOIN users u1 ON u1.id=m.player1_id
    LEFT JOIN users u2 ON u2.id=m.player2_id
    LEFT JOIN users uw ON uw.id=m.winner_id
    WHERE m.tournament_id=? ORDER BY m.round,m.match_number`).all(req.params.id);

  // Group matches by round
  const rounds = {};
  for (const m of matches) {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }

  res.json({ ...t, players, matches, rounds, player_count: players.length });
});

/* ─── Create tournament ───────────────────────────────────────────────── */
router.post('/', requireAuth, (req, res) => {
  const { title, game, description, maxPlayers, entryFeeUSD, startAt, rules } = req.body;
  if (!title || !game) return res.status(400).json({ error: 'title and game required' });

  const VALID_SLOTS = [4, 8, 16, 32, 64];
  const slots = parseInt(maxPlayers || 8);
  if (!VALID_SLOTS.includes(slots)) return res.status(400).json({ error: `maxPlayers must be one of ${VALID_SLOTS.join(', ')}` });

  const fee = parseFloat(entryFeeUSD || 0);
  const id = uuid();
  const user = db.prepare('SELECT display_name FROM users WHERE id=?').get(req.user.userId);

  db.prepare(`INSERT INTO tournaments_v2 (id,title,game,description,created_by,creator_name,max_players,entry_fee_usd,entry_fee_bdt,prize_pool_usd,status,start_at,rules)
    VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)`)
    .run(id, title, game, description||null, req.user.userId, user?.display_name||'Unknown',
      slots, fee, Math.round(fee / (parseFloat(process.env.BDT_TO_USD_RATE||'0.0091'))),
      'open', startAt||null, rules||null);

  res.status(201).json({ id, message: 'Tournament created! Share the link for players to join.' });
});

/* ─── Edit tournament (creator only, while open) ──────────────────────── */
router.patch('/:id', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments_v2 WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!assertCreator(req, res, t)) return;
  if (t.status !== 'open') return res.status(409).json({ error: 'Can only edit while tournament is open' });

  const { title, description, entryFeeUSD, maxPlayers, startAt, rules } = req.body;
  const VALID_SLOTS = [4, 8, 16, 32, 64];
  if (maxPlayers && !VALID_SLOTS.includes(parseInt(maxPlayers))) return res.status(400).json({ error: 'Invalid maxPlayers' });

  const f = [], v = [];
  if (title)        { f.push('title=?');          v.push(title); }
  if (description)  { f.push('description=?');    v.push(description); }
  if (entryFeeUSD !== undefined) { f.push('entry_fee_usd=?'); v.push(parseFloat(entryFeeUSD)); }
  if (maxPlayers)   { f.push('max_players=?');    v.push(parseInt(maxPlayers)); }
  if (startAt)      { f.push('start_at=?');       v.push(startAt); }
  if (rules)        { f.push('rules=?');          v.push(rules); }
  if (!f.length)    return res.status(400).json({ error: 'Nothing to update' });
  f.push(`updated_at=datetime('now')`);
  db.prepare(`UPDATE tournaments_v2 SET ${f.join(',')} WHERE id=?`).run(...v, req.params.id);
  res.json({ ok: true });
});

/* ─── Join tournament ─────────────────────────────────────────────────── */
router.post('/:id/join', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments_v2 WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (t.status !== 'open') return res.status(409).json({ error: 'Registration is closed' });

  const count = db.prepare('SELECT COUNT(*) AS c FROM tournament_players WHERE tournament_id=?').get(req.params.id).c;
  if (count >= t.max_players) return res.status(409).json({ error: 'Tournament is full' });

  const existing = db.prepare('SELECT id FROM tournament_players WHERE tournament_id=? AND user_id=?').get(req.params.id, req.user.userId);
  if (existing) return res.status(409).json({ error: 'Already joined' });

  const fee = t.entry_fee_usd;
  try {
    if (fee > 0) debitWallet(req.user.userId, fee);
  } catch(e) { return res.status(402).json({ error: e.message }); }

  // Add to prize pool
  db.prepare(`UPDATE tournaments_v2 SET prize_pool_usd=prize_pool_usd+?,updated_at=datetime('now') WHERE id=?`).run(fee, req.params.id);

  db.prepare('INSERT INTO tournament_players (id,tournament_id,user_id,game_uid,entry_paid) VALUES (?,?,?,?,?)')
    .run(uuid(), req.params.id, req.user.userId, req.body.gameUid||null, fee);

  const w = getWallet(req.user.userId);
  const newCount = count + 1;
  res.status(201).json({ joined: true, entryPaid: fee, newBalance: w.balance, playerCount: newCount, spotsLeft: t.max_players - newCount });
});

/* ─── Leave tournament (before start, refund) ─────────────────────────── */
router.delete('/:id/leave', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments_v2 WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (t.status !== 'open') return res.status(409).json({ error: 'Cannot leave after tournament has started' });

  const p = db.prepare('SELECT * FROM tournament_players WHERE tournament_id=? AND user_id=?').get(req.params.id, req.user.userId);
  if (!p) return res.status(404).json({ error: 'You are not in this tournament' });

  if (p.entry_paid > 0) {
    creditWallet(req.user.userId, p.entry_paid);
    db.prepare(`UPDATE tournaments_v2 SET prize_pool_usd=prize_pool_usd-?,updated_at=datetime('now') WHERE id=?`).run(p.entry_paid, req.params.id);
  }
  db.prepare('DELETE FROM tournament_players WHERE id=?').run(p.id);
  const w = getWallet(req.user.userId);
  res.json({ left: true, refunded: p.entry_paid, newBalance: w.balance });
});

/* ─── Start tournament (creator only) ────────────────────────────────── */
router.post('/:id/start', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments_v2 WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!assertCreator(req, res, t)) return;
  if (t.status !== 'open') return res.status(409).json({ error: 'Tournament is not open' });

  const players = db.prepare('SELECT user_id FROM tournament_players WHERE tournament_id=?').all(req.params.id);
  if (players.length < 2) return res.status(400).json({ error: 'Need at least 2 players to start' });

  db.prepare(`UPDATE tournaments_v2 SET status='in_progress',updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  const matches = generateBracket(req.params.id, players.map(p => p.user_id));
  res.json({ started: true, totalMatches: matches.length, rounds: Math.ceil(Math.log2(players.length)) });
});

/* ─── Declare match result (creator only) ────────────────────────────── */
router.post('/:id/match/:mid/result', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments_v2 WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (!assertCreator(req, res, t)) return;
  if (t.status !== 'in_progress') return res.status(409).json({ error: 'Tournament is not in progress' });

  const match = db.prepare('SELECT * FROM tournament_matches_v2 WHERE id=? AND tournament_id=?').get(req.params.mid, req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.status === 'completed') return res.status(409).json({ error: 'Match already declared' });

  const { winnerId, note } = req.body;
  if (!winnerId) return res.status(400).json({ error: 'winnerId required' });
  if (![match.player1_id, match.player2_id].includes(winnerId)) return res.status(400).json({ error: 'winnerId must be one of the two players' });
  const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;

  db.prepare(`UPDATE tournament_matches_v2 SET status='completed',winner_id=?,loser_id=?,result_note=?,declared_by=?,declared_at=datetime('now') WHERE id=?`)
    .run(winnerId, loserId, note||null, req.user.userId, match.id);

  db.prepare(`UPDATE tournament_players SET status='eliminated' WHERE tournament_id=? AND user_id=?`).run(req.params.id, loserId);

  // Try to advance bracket
  const advancement = advanceBracket(req.params.id, match.id);
  let payout = null;
  if (advancement?.tournamentOver) {
    payout = payoutWinner(req.params.id, winnerId);
  }

  const p1 = db.prepare('SELECT display_name FROM users WHERE id=?').get(match.player1_id);
  const p2 = db.prepare('SELECT display_name FROM users WHERE id=?').get(match.player2_id);
  const winner = winnerId === match.player1_id ? p1 : p2;

  res.json({
    ok: true,
    winner: { id: winnerId, name: winner?.display_name },
    loser: { id: loserId },
    tournamentOver: advancement?.tournamentOver || false,
    payout: payout || null,
    message: advancement?.tournamentOver
      ? `🏆 Tournament complete! ${winner?.display_name} wins $${payout?.winner?.toFixed(2)} USDT!`
      : `✓ ${winner?.display_name} advances to next round`,
  });
});

/* ─── Cancel tournament (creator only — full refund) ──────────────────── */
router.delete('/:id', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments_v2 WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!assertCreator(req, res, t)) return;
  if (t.status === 'completed') return res.status(409).json({ error: 'Cannot cancel a completed tournament' });

  const players = db.prepare('SELECT * FROM tournament_players WHERE tournament_id=?').all(req.params.id);
  let refunds = 0;
  for (const p of players) {
    if (p.entry_paid > 0) { creditWallet(p.user_id, p.entry_paid); refunds++; }
  }
  db.prepare(`UPDATE tournaments_v2 SET status='cancelled',updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ cancelled: true, refunds });
});

/* ─── My tournaments ──────────────────────────────────────────────────── */
router.get('/my/created', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM tournament_players WHERE tournament_id=t.id) AS player_count FROM tournaments_v2 t WHERE t.created_by=? ORDER BY t.created_at DESC`).all(req.user.userId));
});
router.get('/my/joined', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT t.*, tp.status AS my_status, tp.prize_won_usd FROM tournaments_v2 t JOIN tournament_players tp ON tp.tournament_id=t.id WHERE tp.user_id=? ORDER BY tp.joined_at DESC`).all(req.user.userId));
});

module.exports = router;
