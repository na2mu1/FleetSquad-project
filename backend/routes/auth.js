const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const { ethers } = require('ethers');
const db = require('../db/init');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const SKIP_SIG_VERIFY = process.env.NODE_ENV !== 'production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// ── Password hashing (scrypt — built into Node, no extra dependency) ───────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}
function defaultAvatar(seed) {
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
}
function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, walletAddress: user.wallet_address, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
function publicUser(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

/**
 * POST /api/auth/signup
 * Body: { email, password, displayName }
 */
router.post('/signup', (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email এবং password দিতে হবে' });
  if (password.length < 6) return res.status(400).json({ error: 'password কমপক্ষে ৬ অক্ষরের হতে হবে' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'এই email দিয়ে already একটা account আছে — Login করুন' });

  const id = uuid();
  const name = displayName?.trim() || email.split('@')[0];
  db.prepare(`INSERT INTO users (id, email, password_hash, auth_provider, display_name, avatar_url)
              VALUES (?, ?, ?, 'email', ?, ?)`)
    .run(id, email.toLowerCase(), hashPassword(password), name, defaultAvatar(email));

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ token: signToken(user), user: publicUser(user) });
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email এবং password দিতে হবে' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'ভুল email অথবা password' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

/**
 * POST /api/auth/google
 * Body: { credential }  — the ID token from Google Identity Services
 * Verifies the token against Google's tokeninfo endpoint (no extra SDK needed).
 */
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential missing' });

  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) throw new Error('Invalid Google token');
    const payload = await r.json();

    if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Google client mismatch' });
    }
    const email = payload.email;
    if (!email) return res.status(400).json({ error: 'Google account এ email পাওয়া যায়নি' });

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      const id = uuid();
      db.prepare(`INSERT INTO users (id, email, auth_provider, display_name, avatar_url)
                  VALUES (?, ?, 'google', ?, ?)`)
        .run(id, email.toLowerCase(), payload.name || email.split('@')[0], payload.picture || defaultAvatar(email));
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    res.status(401).json({ error: 'Google sign-in ব্যর্থ হয়েছে: ' + e.message });
  }
});

/**
 * POST /api/auth/wallet-connect  — kept for backward compatibility.
 */
router.post('/wallet-connect', (req, res) => {
  const { walletAddress, message, signature, displayName } = req.body;
  if (!walletAddress) return res.status(400).json({ error: 'walletAddress is required' });

  if (!SKIP_SIG_VERIFY) {
    if (!message || !signature) {
      return res.status(400).json({ error: 'message and signature are required in production mode' });
    }
    try {
      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(401).json({ error: 'Signature verification failed — wallet mismatch' });
      }
    } catch (e) {
      return res.status(401).json({ error: 'Invalid signature: ' + e.message });
    }
  }

  let user = db.prepare('SELECT * FROM users WHERE wallet_address = ?').get(walletAddress);
  if (!user) {
    const id = uuid();
    db.prepare("INSERT INTO users (id, wallet_address, auth_provider, display_name, avatar_url) VALUES (?, ?, 'wallet', ?, ?)")
      .run(id, walletAddress, displayName || `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`, defaultAvatar(walletAddress));
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/challenge', (req, res) => {
  const nonce = Math.floor(Math.random() * 1e12).toString(36).toUpperCase();
  const ts = new Date().toISOString();
  res.json({
    message: `e-Game Marketplace\nSign in with wallet\nNonce: ${nonce}\nTime: ${ts}`,
    expiresIn: 300,
  });
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

module.exports = { router, requireAuth, requireAdmin };
