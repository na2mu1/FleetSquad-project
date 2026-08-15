/**
 * Tournament routes
 *
 * Admin:
 *  POST   /api/tournament              — create tournament
 *  PATCH  /api/tournament/:id          — edit (entry fee, prize, status, etc.)
 *  POST   /api/tournament/:id/start    — change status to 'ongoing'
 *  POST   /api/tournament/:id/result   — set placements + trigger prize payout
 *  DELETE /api/tournament/:id          — cancel (refunds all entry fees)
 *  GET    /api/tournament/admin/all    — all tournaments for admin
 *
 * Public:
 *  GET    /api/tournament              — list active/upcoming
 *  GET    /api/tournament/:id          — detail + participants
 *
 * User:
 *  POST   /api/tournament/:id/join     — pay entry fee from wallet + register
 *  DELETE /api/tournament/:id/leave    — withdraw before tournament starts (refund)
 */
const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/init');
const { requireAuth, requireAdmin } = require('./auth');
const { creditWallet, getOrCreateWallet } = require('./deposit');

const router = express.Router();

function debitWallet(userId, amountUSD) {
  const w = getOrCreateWallet(userId);
  if (w.balance < amountUSD) throw new Error(`Insufficient balance. You have $${w.balance.toFixed(2)}, need $${amountUSD.toFixed(2)}`);
  db.prepare(`UPDATE wallet_balances SET balance=balance-?, updated_at=datetime('now') WHERE user_id=?`).run(amountUSD, userId);
}

/* ── Public: list ──────────────────────────────────────────────────────── */
router.get('/', (req, res) => {
  const { status, game } = req.query;
  let sql = 'SELECT t.*, (SELECT COUNT(*) FROM tournament_participants WHERE tournament_id=t.id) AS player_count FROM tournaments t WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND t.status=?'; params.push(status); }
  if (game)   { sql += ' AND t.game=?';   params.push(game); }
  sql += ' ORDER BY t.start_at ASC';
  res.json(db.prepare(sql).all(...params).map(t => ({
    ...t,
    prize_breakdown: JSON.parse(t.prize_breakdown || '[]'),
  })));
});

/* ── Public: detail ────────────────────────────────────────────────────── */
router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });

  const participants = db.prepare(`
    SELECT tp.*, u.display_name, u.wallet_address
    FROM tournament_participants tp
    JOIN users u ON u.id = tp.user_id
    WHERE tp.tournament_id=? ORDER BY tp.placement ASC, tp.joined_at ASC
  `).all(req.params.id);

  const results = db.prepare('SELECT * FROM tournament_results WHERE tournament_id=? ORDER BY placement ASC').all(req.params.id);
  res.json({
    ...t,
    prize_breakdown: JSON.parse(t.prize_breakdown || '[]'),
    participants,
    results,
    player_count: participants.length,
  });
});

/* ── Admin: create ─────────────────────────────────────────────────────── */
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, game, description, entryFeeUSD, prizePrizePool, prizeBreakdown, maxPlayers, startAt, endAt, rules, bannerUrl } = req.body;
  if (!title || !game || !startAt) return res.status(400).json({ error: 'title, game, startAt required' });

  const entryFee = parseFloat(entryFeeUSD || 0);
  const prizePool = parseFloat(prizePrizePool || 0);

  // Validate prize breakdown sums to <= prize pool
  const breakdown = prizeBreakdown || [];
  const breakdownTotal = breakdown.reduce((s, p) => s + (p.amount || 0), 0);
  if (breakdownTotal > prizePool) return res.status(400).json({ error: 'Prize breakdown total exceeds prize pool' });

  const id = uuid();
  db.prepare(`INSERT INTO tournaments (id,title,game,description,entry_fee_usd,prize_pool_usd,prize_breakdown,max_players,status,start_at,end_at,rules,banner_url,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, title, game, description || null, entryFee, prizePool, JSON.stringify(breakdown),
      parseInt(maxPlayers || 32), 'upcoming', startAt, endAt || null, rules || null, bannerUrl || null, req.user.userId);

  res.status(201).json({ id, status: 'upcoming' });
});

/* ── Admin: edit ───────────────────────────────────────────────────────── */
router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (['completed','cancelled'].includes(t.status)) return res.status(409).json({ error: 'Cannot edit a completed or cancelled tournament' });

  const { title, description, entryFeeUSD, prizePrizePool, prizeBreakdown, maxPlayers, startAt, endAt, rules, bannerUrl, status } = req.body;
  const ALLOWED_TRANSITIONS = { upcoming: ['registration','cancelled'], registration: ['ongoing','cancelled'], ongoing: ['completed','cancelled'] };
  if (status && status !== t.status) {
    if (!ALLOWED_TRANSITIONS[t.status]?.includes(status)) {
      return res.status(400).json({ error: `Cannot go from "${t.status}" to "${status}"` });
    }
  }

  const fields = [];
  const vals = [];
  if (title !== undefined)        { fields.push('title=?');            vals.push(title); }
  if (description !== undefined)  { fields.push('description=?');      vals.push(description); }
  if (entryFeeUSD !== undefined)  { fields.push('entry_fee_usd=?');    vals.push(parseFloat(entryFeeUSD)); }
  if (prizePrizePool !== undefined){ fields.push('prize_pool_usd=?');  vals.push(parseFloat(prizePrizePool)); }
  if (prizeBreakdown !== undefined){ fields.push('prize_breakdown=?'); vals.push(JSON.stringify(prizeBreakdown)); }
  if (maxPlayers !== undefined)   { fields.push('max_players=?');      vals.push(parseInt(maxPlayers)); }
  if (startAt !== undefined)      { fields.push('start_at=?');         vals.push(startAt); }
  if (endAt !== undefined)        { fields.push('end_at=?');           vals.push(endAt); }
  if (rules !== undefined)        { fields.push('rules=?');            vals.push(rules); }
  if (bannerUrl !== undefined)    { fields.push('banner_url=?');       vals.push(bannerUrl); }
  if (status !== undefined)       { fields.push('status=?');           vals.push(status); }
  fields.push("updated_at=datetime('now')");

  db.prepare(`UPDATE tournaments SET ${fields.join(',')} WHERE id=?`).run(...vals, req.params.id);
  res.json({ ok: true });
});

/* ── Admin: set results + pay prizes ─────────────────────────────────────── */
router.post('/:id/result', requireAuth, requireAdmin, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (t.status !== 'ongoing') return res.status(409).json({ error: 'Tournament must be ongoing to set results' });

  const { placements } = req.body;
  // placements: [{userId, placement, prizeUSD}, …]
  if (!Array.isArray(placements) || placements.length === 0) return res.status(400).json({ error: 'placements[] required' });

  const totalPrize = placements.reduce((s, p) => s + (p.prizeUSD || 0), 0);
  if (totalPrize > t.prize_pool_usd) return res.status(400).json({ error: 'Total prizes exceed the prize pool' });

  const payouts = [];
  for (const p of placements) {
    db.prepare(`UPDATE tournament_participants SET placement=?,prize_won_usd=?,status=? WHERE tournament_id=? AND user_id=?`)
      .run(p.placement, p.prizeUSD || 0, p.placement === 1 ? 'winner' : 'eliminated', req.params.id, p.userId);

    if (p.prizeUSD > 0) {
      const resultId = uuid();
      db.prepare(`INSERT OR IGNORE INTO tournament_results (id,tournament_id,user_id,placement,prize_usd,paid_out,paid_at) VALUES (?,?,?,?,?,1,datetime('now'))`)
        .run(resultId, req.params.id, p.userId, p.placement, p.prizeUSD);
      creditWallet(p.userId, p.prizeUSD);
      payouts.push({ userId: p.userId, placement: p.placement, prizeUSD: p.prizeUSD });
    }
  }

  db.prepare("UPDATE tournaments SET status='completed', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ ok: true, payouts });
});

/* ── Admin: cancel + full refund ────────────────────────────────────────── */
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (t.status === 'completed') return res.status(409).json({ error: 'Cannot cancel a completed tournament' });

  // Refund all entry fees
  const participants = db.prepare('SELECT * FROM tournament_participants WHERE tournament_id=?').all(req.params.id);
  let refundCount = 0;
  for (const p of participants) {
    if (p.entry_fee_paid > 0) { creditWallet(p.user_id, p.entry_fee_paid); refundCount++; }
    db.prepare('UPDATE tournament_participants SET status="eliminated" WHERE id=?').run(p.id);
  }

  db.prepare("UPDATE tournaments SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ ok: true, refundCount });
});

/* ── Admin: all tournaments ─────────────────────────────────────────────── */
router.get('/admin/all', requireAuth, requireAdmin, (req, res) => {
  const list = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM tournament_participants WHERE tournament_id=t.id) AS player_count,
    (SELECT COALESCE(SUM(entry_fee_paid),0) FROM tournament_participants WHERE tournament_id=t.id) AS total_fees_collected
    FROM tournaments t ORDER BY t.created_at DESC
  `).all();
  res.json(list.map(t => ({ ...t, prize_breakdown: JSON.parse(t.prize_breakdown || '[]') })));
});

/* ── User: join tournament ──────────────────────────────────────────────── */
router.post('/:id/join', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!['upcoming','registration'].includes(t.status)) return res.status(409).json({ error: 'Registration is not open' });

  const count = db.prepare('SELECT COUNT(*) AS c FROM tournament_participants WHERE tournament_id=?').get(req.params.id).c;
  if (count >= t.max_players) return res.status(409).json({ error: 'Tournament is full' });

  const existing = db.prepare('SELECT id FROM tournament_participants WHERE tournament_id=? AND user_id=?').get(req.params.id, req.user.userId);
  if (existing) return res.status(409).json({ error: 'Already registered' });

  const { gameUid } = req.body;
  const entryFee = t.entry_fee_usd;

  try {
    if (entryFee > 0) debitWallet(req.user.userId, entryFee);

    const id = uuid();
    db.prepare('INSERT INTO tournament_participants (id,tournament_id,user_id,game_uid,entry_fee_paid) VALUES (?,?,?,?,?)')
      .run(id, req.params.id, req.user.userId, gameUid || null, entryFee);

    const wallet = getOrCreateWallet(req.user.userId);
    res.status(201).json({ participantId: id, entryFeePaid: entryFee, newBalance: wallet.balance });
  } catch (e) {
    res.status(402).json({ error: e.message });
  }
});

/* ── User: leave (pre-start refund) ─────────────────────────────────────── */
router.delete('/:id/leave', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!['upcoming','registration'].includes(t.status)) return res.status(409).json({ error: 'Cannot leave after tournament has started' });

  const p = db.prepare('SELECT * FROM tournament_participants WHERE tournament_id=? AND user_id=?').get(req.params.id, req.user.userId);
  if (!p) return res.status(404).json({ error: 'Not registered' });

  if (p.entry_fee_paid > 0) creditWallet(req.user.userId, p.entry_fee_paid);
  db.prepare('DELETE FROM tournament_participants WHERE id=?').run(p.id);

  const wallet = getOrCreateWallet(req.user.userId);
  res.json({ ok: true, refunded: p.entry_fee_paid, newBalance: wallet.balance });
});

module.exports = router;
