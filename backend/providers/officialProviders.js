/**
 * Official API provider stubs.
 * ------------------------------
 * RESEARCH NOTE (checked against GitHub + each publisher's developer site):
 *
 *  - Free Fire (Garena): no official inventory/vault API exists. Every
 *    "Free Fire API" found on GitHub/GitHub Topics (e.g. freefire-api repos,
 *    "developers.freefirecommunity.com", "hlgamingofficial.com") is an
 *    unofficial, reverse-engineered, fan-run service that explicitly
 *    disclaims Garena affiliation. Several of them (guest-account
 *    automation, protobuf-reversed client flows, auto-topup/like tooling)
 *    clearly cross into Terms-of-Service-violating territory. None are
 *    used here, per the rule of only integrating legal, maintained,
 *    ToS-safe sources.
 *
 *  - PUBG Mobile: KRAFTON does publish an official PUBG API
 *    (documentation.pubg.com / developer.pubg.com), but it covers
 *    PUBG: BATTLEGROUNDS on PC/console — match and player stats only, no
 *    cosmetic inventory, and it does not cover PUBG Mobile at all.
 *
 *  - eFootball (Konami): no public developer API of any kind was found.
 *
 * Conclusion: for all three games, the manual screenshot/video provider
 * is not a stopgap — it is the only compliant option today. These classes
 * exist purely as the extension point: the moment a publisher ships a
 * legitimate inventory API, implement fetchInventory() here, flip the
 * corresponding *_API_ENABLED env var, and the registry below will start
 * preferring it automatically — no changes needed anywhere else in the app.
 */

const { InventoryProvider } = require('./InventoryProvider');

class UnavailableOfficialProvider extends InventoryProvider {
  constructor(id, label) {
    super();
    this._id = id;
    this._label = label;
  }
  get id() { return this._id; }
  get label() { return this._label; }
  get verificationType() { return 'api'; }
  async isAvailable() { return false; }
  async fetchInventory() { throw new Error(`${this._label} is not available yet.`); }
}

const FreeFireOfficialProvider = new UnavailableOfficialProvider('garena_official', 'Free Fire Official API');
const PubgMobileOfficialProvider = new UnavailableOfficialProvider('krafton_official', 'PUBG Mobile Official API');
const EFootballOfficialProvider = new UnavailableOfficialProvider('konami_official', 'eFootball Official API');

module.exports = { FreeFireOfficialProvider, PubgMobileOfficialProvider, EFootballOfficialProvider };
