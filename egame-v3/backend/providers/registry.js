const { ManualScreenshotProvider, TABS } = require('./ManualScreenshotProvider');
const { FreeFireOfficialProvider, PubgMobileOfficialProvider, EFootballOfficialProvider } = require('./officialProviders');

const manual = new ManualScreenshotProvider();

const OFFICIAL_BY_GAME = {
  free_fire: FreeFireOfficialProvider,
  pubg_mobile: PubgMobileOfficialProvider,
  efootball: EFootballOfficialProvider,
};

/**
 * Returns the provider to use for a given game: the official API if it's
 * both enabled via env flag AND reports itself available, otherwise the
 * manual screenshot/video fallback. Every game always has a working
 * provider — buyers are never left without proof.
 */
async function getProvider(game) {
  const official = OFFICIAL_BY_GAME[game];
  const flag = `${game.toUpperCase()}_API_ENABLED`; // e.g. FREE_FIRE_API_ENABLED
  if (official && process.env[flag] === 'true' && (await official.isAvailable())) {
    return official;
  }
  return manual;
}

module.exports = { getProvider, manual, OFFICIAL_BY_GAME, TABS };
