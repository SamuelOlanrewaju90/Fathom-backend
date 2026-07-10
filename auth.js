// routes/auth.js — account creation, login, and two-factor authentication.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const rateLimit = require('express-rate-limit');

const db = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Stricter limiter just for login/register — slows down password-guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});

function signToken(userId){
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- register ----------
router.post('/register', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);

  // seed a starting demo balance so the dashboard has something to show
  db.prepare('INSERT INTO holdings (user_id, symbol, quantity) VALUES (?, ?, ?)').run(result.lastInsertRowid, 'USD_CASH', 10000);

  const token = signToken(result.lastInsertRowid);
  res.status(201).json({ token, email });
});

// ---------- login ----------
router.post('/login', authLimiter, async (req, res) => {
  const { email, password, totpToken } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect email or password.' });

  if (user.totp_enabled) {
    if (!totpToken) return res.status(200).json({ requires2FA: true });
    const secret = decrypt(user.totp_secret_encrypted);
    const ok = speakeasy.totp.verify({ secret, encoding: 'base32', token: totpToken, window: 1 });
    if (!ok) return res.status(401).json({ error: 'Invalid two-factor code.' });
  }

  const token = signToken(user.id);
  res.json({ token, email: user.email });
});

// ---------- 2FA: start setup (returns QR code) ----------
router.post('/2fa/setup', requireAuth, async (req, res) => {
  const secret = speakeasy.generateSecret({ name: `Fathom (${req.userId})` });
  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

  // store temporarily, unconfirmed, until the user verifies a code
  db.prepare('UPDATE users SET totp_secret_encrypted = ? WHERE id = ?')
    .run(encrypt(secret.base32), req.userId);

  res.json({ qrCode: qrDataUrl, manualEntryKey: secret.base32 });
});

// ---------- 2FA: confirm setup with a code from the authenticator app ----------
router.post('/2fa/verify', requireAuth, (req, res) => {
  const { token } = req.body;
  const user = db.prepare('SELECT totp_secret_encrypted FROM users WHERE id = ?').get(req.userId);
  if (!user || !user.totp_secret_encrypted) return res.status(400).json({ error: 'Start 2FA setup first.' });

  const secret = decrypt(user.totp_secret_encrypted);
  const ok = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
  if (!ok) return res.status(400).json({ error: 'That code didn\'t match. Try again.' });

  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.userId);
  res.json({ enabled: true });
});

// ---------- 2FA: turn off ----------
router.post('/2fa/disable', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret_encrypted = NULL WHERE id = ?').run(req.userId);
  res.json({ enabled: false });
});

// ---------- who am I ----------
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, totp_enabled, created_at FROM users WHERE id = ?').get(req.userId);
  res.json(user);
});

module.exports = router;
