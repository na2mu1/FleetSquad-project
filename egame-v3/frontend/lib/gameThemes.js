/**
 * Each game's real inventory screen has its own visual language. These
 * tokens translate that into a small, consistent set of CSS variables so
 * <GameVault> renders three genuinely different UIs from one component,
 * rather than one template with a color swap.
 */
export const GAME_THEMES = {
  free_fire: {
    label: 'Free Fire',
    screenName: 'Vault',
    accent: '#FF7A1A',       // signal-orange, matches FF's HUD/vault accent
    accentSoft: 'rgba(255,122,26,0.14)',
    bg: '#0B0D14',
    panel: '#14161F',
    panelBorder: '#262a3a',
    text: '#F4F1EA',
    subtext: '#9C9FB0',
    tabActiveBg: 'linear-gradient(135deg,#FF7A1A,#FF3D2E)',
    cardShape: '14px',        // angular-ish, slightly clipped
    cornerClip: true,
    font: "'Rajdhani', 'Segoe UI', sans-serif",
    pattern: 'diagonal', // diagonal hazard-stripe accent on headers
  },
  pubg_mobile: {
    label: 'PUBG Mobile',
    screenName: 'Inventory',
    accent: '#D8B65A',        // desert / military gold
    accentSoft: 'rgba(216,182,90,0.14)',
    bg: '#0D0F0C',
    panel: '#171912',
    panelBorder: '#2c2e22',
    text: '#EDEAD9',
    subtext: '#9A9C8C',
    tabActiveBg: 'linear-gradient(135deg,#D8B65A,#8C6D2F)',
    cardShape: '4px',         // sharp, crate-like
    cornerClip: false,
    font: "'Oswald', 'Segoe UI', sans-serif",
    pattern: 'crate', // subtle woodgrain/stencil header
  },
  efootball: {
    label: 'eFootball',
    screenName: 'Player Collection',
    accent: '#20D179',        // pitch green
    accentSoft: 'rgba(32,209,121,0.14)',
    bg: '#0A0F0C',
    panel: '#11170F',
    panelBorder: '#213326',
    text: '#EAF5EE',
    subtext: '#8FA79B',
    tabActiveBg: 'linear-gradient(135deg,#20D179,#0E8F52)',
    cardShape: '18px',        // rounded "player card" shape
    cornerClip: false,
    font: "'Barlow', 'Segoe UI', sans-serif",
    pattern: 'pitch-lines',
  },
};

export const TABS = [
  { key: 'characters', label: 'Characters' },
  { key: 'weapons', label: 'Weapons' },
  { key: 'fashion', label: 'Fashion' },
  { key: 'emotes', label: 'Emotes' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'collection', label: 'Collection' },
  { key: 'others', label: 'Others' },
];

export const RARITY_COLORS = {
  common: '#9AA0AC',
  rare: '#4FA9F0',
  epic: '#B15CF0',
  legendary: '#F0A94F',
  mythic: '#F04F7A',
};

export function getTheme(game) {
  return GAME_THEMES[game] || GAME_THEMES.free_fire;
}
