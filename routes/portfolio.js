// routes/portfolio.js — per-user holdings and simulated trades.

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many orders placed too quickly. Slow down and try again.' },
});

router.use(requireAuth);

router.get('/holdings', (req, res) => {
  const rows = db.prepare('SELECT symbol, quantity FROM holdings WHERE user_id = ?').all(req.userId);
  res.json(rows);
});

router.get('/activity', (req, res) => {
  const rows = db.prepare('SELECT type, symbol, quantity, price, created_at FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.userId);
  res.json(rows);
});

router.post('/trade', tradeLimiter, (req, res) => {
  const { side, symbol, usdAmount, price } = req.body;

  if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'Invalid order side.' });
  if (!symbol || typeof symbol !== 'string') return res.status(400).json({ error: 'Missing asset symbol.' });
  const usd = Number(usdAmount);
  const px = Number(price);
  if (!(usd > 0) || !(px > 0)) return res.status(400).json({ error: 'Invalid amount or price.' });

  const qty = usd / px;

  const getRow = (sym) => db.prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?').get(req.userId, sym);
  const cashRow = getRow('USD_CASH');
  const cash = cashRow ? cashRow.quantity : 0;

  const upsert = db.prepare(`
    INSERT INTO holdings (user_id, symbol, quantity) VALUES (?, ?, ?)
    ON CONFLICT(user_id, symbol) DO UPDATE SET quantity = quantity + excluded.quantity
  `);

  const tx = db.transaction(() => {
    if (side === 'buy') {
      if (usd > cash) throw new Error('INSUFFICIENT_CASH');
      upsert.run(req.userId, 'USD_CASH', -usd);
      upsert.run(req.userId, symbol, qty);
    } else {
      const held = getRow(symbol);
      if (!held || held.quantity < qty) throw new Error('INSUFFICIENT_ASSET');
      upsert.run(req.userId, symbol, -qty);
      upsert.run(req.userId, 'USD_CASH', usd);
    }
    db.prepare('INSERT INTO activity (user_id, type, symbol, quantity, price) VALUES (?, ?, ?, ?, ?)')
      .run(req.userId, side === 'buy' ? 'Buy' : 'Sell', symbol, qty, px);
  });

  try {
    tx();
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CASH') return res.status(400).json({ error: 'Not enough cash balance.' });
    if (err.message === 'INSUFFICIENT_ASSET') return res.status(400).json({ error: `You don't hold enough ${symbol}.` });
    return res.status(500).json({ error: 'Order could not be completed.' });
  }

  res.json({ ok: true, side, symbol, quantity: qty, price: px });
});

module.exports = router;
