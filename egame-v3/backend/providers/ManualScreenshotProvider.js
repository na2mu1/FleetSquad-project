const { InventoryProvider } = require('./InventoryProvider');
const db = require('../db/init');

const TABS = ['characters', 'weapons', 'fashion', 'emotes', 'vehicles', 'collection', 'others'];

class ManualScreenshotProvider extends InventoryProvider {
  get id() { return 'manual'; }
  get label() { return 'Manual Verification'; }
  get verificationType() { return 'manual'; }

  async isAvailable() {
    return true; // always available — this is the guaranteed fallback
  }

  async fetchInventory({ accountId }) {
    const items = db.prepare('SELECT * FROM inventory_items WHERE account_id = ?').all(accountId);
    const proofs = db.prepare('SELECT * FROM inventory_proofs WHERE account_id = ?').all(accountId);

    const grouped = Object.fromEntries(TABS.map(t => [t, []]));
    for (const item of items) {
      if (!grouped[item.tab]) grouped[item.tab] = [];
      grouped[item.tab].push({
        id: item.id,
        name: item.name,
        subcategory: item.subcategory,
        rarity: item.rarity,
        source: item.source,
        proofMediaId: item.proof_media_id,
      });
    }

    const proofsByTab = Object.fromEntries(TABS.map(t => [t, []]));
    for (const p of proofs) {
      if (!proofsByTab[p.tab]) proofsByTab[p.tab] = [];
      proofsByTab[p.tab].push({
        id: p.id,
        mediaType: p.media_type,
        filePath: p.file_path,
        capturedAt: p.captured_at,
      });
    }

    return { items: grouped, proofs: proofsByTab, tabs: TABS };
  }
}

module.exports = { ManualScreenshotProvider, TABS };
