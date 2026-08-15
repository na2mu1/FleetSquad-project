/**
 * Pricing Algorithm
 * ------------------
 * Account Value = Base Level Score
 *               + Skin Value Score
 *               + Rarity Multiplier (bonus)
 *               + Rank Bonus
 *               + Diamond/UC Equivalent Value
 *               + Demand Index
 *
 * Floor Price = Estimated Value x [0.70 .. 0.85]
 *
 * Every dollar range below is seeded off the account id so a given account
 * always reproduces the same estimate (no flicker on refresh) while still
 * spanning the ranges the spec calls for.
 */

const crypto = require('crypto');

function seeded(seed, min, max) {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const frac = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  return min + frac * (max - min);
}

// Market Demand Engine — static base multipliers per game, meant to be
// refreshed periodically (e.g. weekly cron) from real signals: search
// volume, active listings sold last 30 days, seasonal events.
const GAME_DEMAND = {
  free_fire: { base: 1.6, label: 'Free Fire', note: 'Large SEA/LatAm player base, high skin turnover' },
  pubg_mobile: { base: 1.9, label: 'PUBG Mobile', note: 'Highest average resale price, strong global demand' },
  efootball: { base: 1.2, label: 'eFootball', note: 'Smaller resale market, demand tied to season updates' },
};

// Seasonal/event multiplier — placeholder for a live feed (new season
// launch, collab event, etc.) that temporarily boosts demand.
function seasonalFactor(game) {
  return 1.0; // hook: replace with a lookup against an events calendar
}

const RARITY_RANGES = {
  common: [1, 4],
  rare: [5, 50],
  epic: [10, 70],
  legendary: [20, 100], // "legendary bundle" range from the spec
  mythic: [50, 150],
};

const RANK_BONUS_RANGE = [30, 150];
const HIGH_TIER_RANKS = ['heroic', 'grandmaster', 'conqueror', 'ace', 'ace master', 'ace dominator'];

// Rough in-app-currency -> USD equivalence used only to *estimate* resale
// value; not a claim about the game's real cash shop rate.
const CURRENCY_USD_RATE = {
  free_fire: 0.009,   // diamonds
  pubg_mobile: 0.011, // UC
  efootball: 0.006,   // coins
};

function scoreSkins(accountId, detections) {
  let total = 0;
  const lines = [];
  detections
    .filter(d => ['skin', 'costume', 'weapon'].includes(d.category))
    .forEach((item, i) => {
      const rarity = (item.rarity || 'common').toLowerCase();
      const range = RARITY_RANGES[rarity] || RARITY_RANGES.common;
      const value = Math.round(seeded(`${accountId}:skin:${i}:${item.name}`, range[0], range[1]) * 100) / 100;
      total += value;
      lines.push({ name: item.name, rarity, value, confidence: item.confidence ?? null });
    });
  return { total: Math.round(total * 100) / 100, lines };
}

function rarityMultiplierBonus(accountId, skinLines) {
  // Reward accounts whose inventory skews toward the rarer tiers with an
  // additional bonus on top of the raw per-item skin value.
  if (skinLines.length === 0) return { bonus: 0, tierWeight: 0 };
  const tierIndex = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
  const avgTier = skinLines.reduce((s, l) => s + (tierIndex[l.rarity] ?? 0), 0) / skinLines.length;
  const tierWeight = avgTier / 4; // 0..1
  const skinSubtotal = skinLines.reduce((s, l) => s + l.value, 0);
  const bonus = Math.round(skinSubtotal * tierWeight * 0.25 * 100) / 100; // up to +25% for an all-mythic inventory
  return { bonus, tierWeight: Math.round(tierWeight * 100) / 100 };
}

function scoreRank(accountId, detections) {
  const rankDetection = detections.find(d => d.category === 'rank');
  if (!rankDetection) return { bonus: 0, rank: null };
  const isHighTier = HIGH_TIER_RANKS.includes((rankDetection.name || '').toLowerCase());
  const [min, max] = isHighTier ? RANK_BONUS_RANGE : [5, 30];
  const bonus = Math.round(seeded(`${accountId}:rank`, min, max) * 100) / 100;
  return { bonus, rank: rankDetection.name, isHighTier };
}

function scoreLevel(level) {
  const capped = Math.max(0, Math.min(level || 0, 500)); // sanity cap
  // "$1 per level (scaled)" — scaled down past level 100 so a level-500
  // grinder account doesn't dwarf a rare-loaded account.
  const linear = Math.min(capped, 100) * 1;
  const scaledTail = Math.max(0, capped - 100) * 0.4;
  return Math.round((linear + scaledTail) * 100) / 100;
}

function currencyEquivalent(game, detections, declaredCurrencyAmount = 0) {
  const currencyDetection = detections.find(d => d.category === 'currency');
  const amount = currencyDetection?.amount ?? declaredCurrencyAmount ?? 0;
  const rate = CURRENCY_USD_RATE[game] ?? 0.008;
  return { amount, value: Math.round(amount * rate * 100) / 100 };
}

/**
 * Main entry point. `detectionsByCategory` is the merged output of
 * imageAnalysis.analyzeScreenshot() across all of a seller's screenshots.
 */
function computeValuation({ accountId, game, level, declaredCurrencyAmount, detections }) {
  const demandCfg = GAME_DEMAND[game] || { base: 1.1, label: game };
  const demandMultiplier = demandCfg.base * seasonalFactor(game);

  const baseLevelScore = scoreLevel(level);
  const skins = scoreSkins(accountId, detections);
  const rarity = rarityMultiplierBonus(accountId, skins.lines);
  const rank = scoreRank(accountId, detections);
  const currency = currencyEquivalent(game, detections, declaredCurrencyAmount);

  const subtotalBeforeDemand = baseLevelScore + skins.total + rarity.bonus + rank.bonus + currency.value;

  // Demand Index is expressed as the *additional* dollars the game's
  // popularity adds on top of the raw subtotal, keeping the formula
  // additive exactly as specified while still driven by a multiplier.
  const demandIndex = Math.round(subtotalBeforeDemand * (demandMultiplier - 1) * 100) / 100;

  const estimatedValue = Math.round((subtotalBeforeDemand + demandIndex) * 100) / 100;

  // Floor Price = Estimated Value x [0.70 .. 0.85], seeded per-account so
  // it's stable, biased toward 0.78 as a "fair" midpoint.
  const floorRatio = Math.round(seeded(`${accountId}:floor`, 0.70, 0.85) * 1000) / 1000;
  const floorPrice = Math.round(estimatedValue * floorRatio * 100) / 100;

  return {
    estimatedValue,
    floorPrice,
    floorRatio,
    breakdown: {
      baseLevelScore,
      skinValueScore: skins.total,
      skinLines: skins.lines,
      rarityMultiplierBonus: rarity.bonus,
      avgRarityTierWeight: rarity.tierWeight,
      rankBonus: rank.bonus,
      detectedRank: rank.rank,
      currencyEquivalent: currency.value,
      detectedCurrencyAmount: currency.amount,
      demandMultiplier: Math.round(demandMultiplier * 100) / 100,
      demandIndex,
      demandLabel: demandCfg.label,
      subtotalBeforeDemand: Math.round(subtotalBeforeDemand * 100) / 100,
    },
  };
}

module.exports = { computeValuation, GAME_DEMAND };
