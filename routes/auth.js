const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const rateLimit = require('express-rate-limit');

const { pool } = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});

function signToken(userId){
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

router.post('/register', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) return res.status(409).json({ error: 'An account with that email already exists.' });

  const hash = await bcrypt.hash(password, 12);
  const inserted = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
    [email, hash]
  );
  const userId = inserted.rows[0].id;

  await pool.query(
    'INSERT INTO holdings (user_id, symbol, quantity) VALUES ($1, $2, $3)',
    [userId, 'USD_CASH', 10000]
  );

  const token = signToken(userId);
  res.status(201).json({ token, email });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password, totpToken } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
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

router.post('/2fa/setup', requireAuth, async (req, res) => {
  const secret = speakeasy.generateSecret({ name: `Fathom (${req.userId})` });
  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
  await pool.query('UPDATE users SET totp_secret_encrypted = $1 WHERE id = $2', [encrypt(secret.base32), req.userId]);
  res.json({ qrCode: qrDataUrl, manualEntryKey: secret.base32 });
});

router.post('/2fa/verify', requireAuth, async (req, res) => {
  const { token } = req.body;
  const result = await pool.query('SELECT totp_secret_encrypted FROM users WHERE id = $1', [req.userId]);
  const user = result.rows[0];
  if (!user || !user.totp_secret_encrypted) return res.status(400).json({ error: 'Start 2FA setup first.' });

  const secret = decrypt(user.totp_secret_encrypted);
  const ok = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
  if (!ok) return res.status(400).json({ error: "That code didn't match. Try again." });

  await pool.query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.userId]);
  res.json({ enabled: true });
});

router.post('/2fa/disable', requireAuth, async (req, res) => {
  await pool.query('UPDATE users SET totp_enabled = FALSE, totp_secret_encrypted = NULL WHERE id = $1', [req.userId]);
  res.json({ enabled: false });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT id, email, totp_enabled, created_at FROM users WHERE id = $1', [req.userId]);
  res.json(result.rows[0]);
});

router.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  const valid = await bcrypt.compare(currentPassword || '', result.rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

  const newHash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.userId]);
  res.json({ ok: true });
});

router.delete('/me', requireAuth, async (req, res) => {
  const { password } = req.body;
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  const valid = await bcrypt.compare(password || '', result.rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Password is incorrect.' });

  await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
  res.json({ ok: true });
});

module.exports = router;
