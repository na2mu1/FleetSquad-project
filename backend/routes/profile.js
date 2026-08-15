const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/init');
const { requireAuth } = require('./auth');
const upload = require('../middleware/upload');
const router = express.Router();

function pub(user) { const { password_hash, ...p } = user; return p; }
function stats(userId) {
  const u = db.prepare('SELECT tournaments_played,tournaments_won,total_won_usd FROM users WHERE id=?').get(userId) || {};
  const trophies = db.prepare('SELECT COUNT(*) as c FROM user_trophies WHERE user_id=?').get(userId)?.c || 0;
  return { tournamentsPlayed: u.tournaments_played||0, tournamentsWon: u.tournaments_won||0, totalPrizeUsd: Math.round((u.total_won_usd||0)*100)/100, trophyCount: trophies, winRate: u.tournaments_played ? Math.round(((u.tournaments_won||0)/u.tournaments_played)*100) : 0 };
}

router.get('/search', (req, res) => {
  const q = (req.query.q||'').trim();
  if (!q || q.length < 2) return res.json([]);
  const like = `%${q}%`;
  const users = db.prepare('SELECT id,username,display_name,avatar_url,efootball_uid,tournaments_won,total_won_usd FROM users WHERE username LIKE ? OR display_name LIKE ? OR efootball_uid LIKE ? LIMIT 10').all(like,like,like);
  res.json(users.map(u => ({ user_id:u.id, username:u.username||u.id, displayName:u.display_name, avatarUrl:u.avatar_url, efootball_uid:u.efootball_uid, wins:u.tournaments_won||0, totalPrize:u.total_won_usd||0 })));
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const cards = db.prepare('SELECT * FROM player_cards WHERE user_id=? ORDER BY overall_rating DESC').all(user.id);
  const trophies = db.prepare('SELECT * FROM user_trophies WHERE user_id=? ORDER BY earned_at DESC').all(user.id);
  const wallet = db.prepare('SELECT balance FROM wallet_balances WHERE user_id=?').get(user.id);
  res.json({ user: pub(user), cards, trophies, stats: stats(user.id), balance: wallet?.balance||0 });
});

router.get('/uid/:uid', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE efootball_uid=?').get(req.params.uid);
  if (!user) return res.status(404).json({ error: 'UID দিয়ে কোনো user পাওয়া যায়নি' });
  const cards = db.prepare('SELECT * FROM player_cards WHERE user_id=? ORDER BY overall_rating DESC').all(user.id);
  const trophies = db.prepare('SELECT * FROM user_trophies WHERE user_id=? ORDER BY earned_at DESC').all(user.id);
  res.json({ user: pub(user), cards, trophies, stats: stats(user.id) });
});

router.get('/:username', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username=? OR id=?').get(req.params.username, req.params.username);
  if (!user) return res.status(404).json({ error: 'Profile পাওয়া যায়নি' });
  const cards = db.prepare('SELECT * FROM player_cards WHERE user_id=? ORDER BY overall_rating DESC').all(user.id);
  const trophies = db.prepare('SELECT * FROM user_trophies WHERE user_id=? ORDER BY earned_at DESC').all(user.id);
  const recentTournaments = db.prepare('SELECT tp.*,t.title,t.game FROM tournament_players tp JOIN tournaments_v2 t ON t.id=tp.tournament_id WHERE tp.user_id=? ORDER BY tp.joined_at DESC LIMIT 10').all(user.id);
  res.json({ user: pub(user), cards, trophies, stats: stats(user.id), recentTournaments });
});

router.patch('/me', requireAuth, (req, res) => {
  const { username, bio, efootballUid, efootballName, displayName } = req.body;
  if (username) {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Username ৩-২০ char, শুধু letters/numbers/_' });
    const taken = db.prepare('SELECT id FROM users WHERE username=? AND id!=?').get(username, req.user.userId);
    if (taken) return res.status(409).json({ error: 'Username নেওয়া হয়েছে' });
  }
  if (efootballUid) {
    const taken = db.prepare('SELECT id FROM users WHERE efootball_uid=? AND id!=?').get(efootballUid, req.user.userId);
    if (taken) return res.status(409).json({ error: 'এই UID আগেই registered' });
  }
  const fields = []; const vals = [];
  if (username!==undefined)     { fields.push('username=?');       vals.push(username); }
  if (bio!==undefined)          { fields.push('bio=?');            vals.push(bio); }
  if (efootballUid!==undefined) { fields.push('efootball_uid=?');  vals.push(efootballUid); }
  if (efootballName!==undefined){ fields.push('efootball_name=?'); vals.push(efootballName); }
  if (displayName!==undefined)  { fields.push('display_name=?');   vals.push(displayName); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(...vals, req.user.userId);
  res.json({ user: pub(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.userId)) });
});

router.post('/me/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File missing' });
  const url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url=? WHERE id=?').run(url, req.user.userId);
  res.json({ avatarUrl: url });
});

router.post('/me/cover', requireAuth, upload.single('cover'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File missing' });
  const url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET cover_url=? WHERE id=?').run(url, req.user.userId);
  res.json({ coverUrl: url });
});

router.post('/me/cards', requireAuth, (req, res) => {
  const { playerName, overallRating, position, team, league, cardType, cardImageUrl, isMaxed } = req.body;
  if (!playerName) return res.status(400).json({ error: 'Player name দিন' });
  const id = uuid();
  db.prepare('INSERT INTO player_cards (id,user_id,player_name,overall_rating,position,team,league,card_type,card_image_url,is_maxed) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, req.user.userId, playerName, overallRating||null, position||null, team||null, league||null, cardType||'standard', cardImageUrl||null, isMaxed?1:0);
  res.status(201).json({ id });
});

router.delete('/me/cards/:id', requireAuth, (req, res) => {
  const card = db.prepare('SELECT * FROM player_cards WHERE id=? AND user_id=?').get(req.params.id, req.user.userId);
  if (!card) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM player_cards WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
