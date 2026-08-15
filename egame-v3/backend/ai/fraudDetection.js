const { v4: uuid } = require('uuid');

function logFraud(db, { accountId, rule, details, severity = 'low' }) {
  db.prepare(
    `INSERT INTO fraud_logs (id, account_id, rule_triggered, details, severity) VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), accountId, rule, JSON.stringify(details), severity);
}

/** Duplicate listing prevention: same UID+game already listed, or an
 * identical screenshot hash reused across a different account. */
function checkDuplicateListing(db, { game, uid, accountId }) {
  const existing = db
    .prepare(`SELECT id FROM accounts WHERE game = ? AND uid = ? AND id != ? AND status != 'rejected'`)
    .all(game, uid, accountId);
  if (existing.length > 0) {
    logFraud(db, {
      accountId,
      rule: 'duplicate_uid',
      details: { game, uid, conflictingAccounts: existing.map(e => e.id) },
      severity: 'high',
    });
    return { flagged: true, reason: 'UID already listed on the platform under another submission.' };
  }
  return { flagged: false };
}

/** Screenshot authenticity: flags exact re-use of a hash already tied to a
 * *different* account (recycled screenshot from another listing). Also
 * flags an account submitting the same screenshot twice under different
 * category tags. Real deployments should extend this with EXIF checks and
 * a learned authenticity classifier. */
function checkScreenshotAuthenticity(db, { accountId, perceptualHash }) {
  const reused = db
    .prepare(
      `SELECT s.id, s.account_id FROM screenshots s WHERE s.perceptual_hash = ? AND s.account_id != ?`
    )
    .all(perceptualHash, accountId);
  if (reused.length > 0) {
    logFraud(db, {
      accountId,
      rule: 'reused_screenshot',
      details: { perceptualHash, reusedFrom: reused.map(r => r.account_id) },
      severity: 'high',
    });
    return { flagged: true, reason: 'This screenshot was already uploaded against a different account.' };
  }
  return { flagged: false };
}

/** Basic UID/format validation per game — a stand-in for a real
 * server-side lookup against each game's public profile endpoint, where
 * available, to confirm the UID exists (read-only, no login). */
function validateUidFormat(game, uid) {
  const patterns = {
    free_fire: /^\d{8,12}$/,
    pubg_mobile: /^\d{9,12}$/,
    efootball: /^[A-Za-z0-9_-]{5,20}$/,
  };
  const pattern = patterns[game];
  if (!pattern) return { valid: false, reason: 'Unsupported game.' };
  return pattern.test(uid)
    ? { valid: true }
    : { valid: false, reason: 'UID does not match the expected format for this game.' };
}

module.exports = { checkDuplicateListing, checkScreenshotAuthenticity, validateUidFormat, logFraud };
