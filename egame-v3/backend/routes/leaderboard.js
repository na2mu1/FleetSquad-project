const express = require('express');
const db = require('../db/init');

const router = express.Router();

/**
 * GET /api/leaderboard
 * OpenSea-style ranked leaderboard: aggregates every tournament a user has
 * placed in (both the v2 bracket system's tournament_players and the older
 * tournament_results table) into one profile per player.
 */
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT
      u.id,
      u.display_name,
      u.avatar_url,
      u.email,
      COUNT(*)                                            AS tournaments_played,
      SUM(CASE WHEN combined.placement = 1 THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN combined.placement = 2 THEN 1 ELSE 0 END) AS runner_up,
      MIN(combined.placement)                              AS best_placement,
      COALESCE(SUM(combined.prize), 0)                     AS total_prize_usd
    FROM (
      SELECT user_id, placement, COALESCE(prize_won_usd, 0) AS prize
      FROM tournament_players
      WHERE placement IS NOT NULL
      UNION ALL
      SELECT user_id, placement, COALESCE(prize_usd, 0) AS prize
      FROM tournament_results
    ) AS combined
    JOIN users u ON u.id = combined.user_id
    GROUP BY u.id
    ORDER BY wins DESC, total_prize_usd DESC, tournaments_played DESC
    LIMIT 100
  `).all();

  const leaderboard = rows.map((r, i) => ({
    rank: i + 1,
    userId: r.id,
    displayName: r.display_name || 'Player',
    avatarUrl: r.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(r.id)}`,
    tournamentsPlayed: r.tournaments_played,
    wins: r.wins || 0,
    runnerUp: r.runner_up || 0,
    bestPlacement: r.best_placement,
    totalPrizeUsd: Math.round((r.total_prize_usd || 0) * 100) / 100,
    winRate: r.tournaments_played ? Math.round(((r.wins || 0) / r.tournaments_played) * 100) : 0,
  }));

  res.json({ leaderboard });
});

module.exports = router;
