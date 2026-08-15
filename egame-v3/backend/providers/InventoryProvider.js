/**
 * API Provider Layer
 * -------------------
 * Every source of inventory data — manual seller uploads today, an
 * official game API tomorrow — implements this same interface. The rest
 * of the app (routes, valuation, the buyer-facing Vault UI) only ever
 * talks to whatever provider registry.getProvider(game) returns, so
 * plugging in a new source later means adding one file and one registry
 * line — nothing else changes.
 */
class InventoryProvider {
  /** Unique id, e.g. 'manual', 'garena_official', 'krafton_official'. */
  get id() {
    throw new Error('Provider must implement id');
  }

  /** Human label shown on the listing's verification badge. */
  get label() {
    throw new Error('Provider must implement label');
  }

  /** 'manual' | 'api' — drives the badge shown to buyers. */
  get verificationType() {
    return 'manual';
  }

  /** Whether this provider is currently usable (e.g. API key configured, endpoint reachable). */
  async isAvailable() {
    return true;
  }

  /**
   * Returns inventory grouped by tab, or throws if unavailable:
   * { characters: [...], weapons: [...], fashion: [...], emotes: [...],
   *   vehicles: [...], collection: [...], others: [...] }
   * Each item: { name, subcategory, rarity, source, proofMediaId? }
   */
  async fetchInventory(/* { game, uid } */) {
    throw new Error('Not implemented');
  }
}

module.exports = { InventoryProvider };
