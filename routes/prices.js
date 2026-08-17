const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many orders placed too quickly. Slow down and try again.' },
});

router.use(requireAuth);

router.get('/holdings', async (req, res) => {
  const result = await pool.query('SELECT symbol, quantity FROM holdings WHERE user_id = $1', [req.userId]);
  res.json(result.rows);
});

router.get('/activity', async (req, res) => {
  const result = await pool.query(
    'SELECT type, symbol, quantity, price, created_at FROM activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.userId]
  );
  res.json(result.rows);
});

router.post('/trade', tradeLimiter, async (req, res) => {
  const { side, symbol, usdAmount, price } = req.body;

  if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'Invalid order side.' });
  if (!symbol || typeof symbol !== 'string') return res.status(400).json({ error: 'Missing asset symbol.' });
  const usd = Number(usdAmount);
  const px = Number(price);
  if (!(usd > 0) || !(px > 0)) return res.status(400).json({ error: 'Invalid amount or price.' });

  const qty = usd / px;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const cashRes = await client.query(
      "SELECT quantity FROM holdings WHERE user_id = $1 AND symbol = 'USD_CASH' FOR UPDATE",
      [req.userId]
    );
    const cash = cashRes.rows[0] ? cashRes.rows[0].quantity : 0;

    const upsert = async (sym, delta) => {
      await client.query(
        `INSERT INTO holdings (user_id, symbol, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, symbol) DO UPDATE SET quantity = holdings.quantity + $3`,
        [req.userId, sym, delta]
      );
    };

    if (side === 'buy') {
      if (usd > cash) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Not enough cash balance.' });
      }
      await upsert('USD_CASH', -usd);
      await upsert(symbol, qty);
    } else {
      const heldRes = await client.query(
        'SELECT quantity FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
        [req.userId, symbol]
      );
      const held = heldRes.rows[0] ? heldRes.rows[0].quantity : 0;
      if (held < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `You don't hold enough ${symbol}.` });
      }
      await upsert(symbol, -qty);
      await upsert('USD_CASH', usd);
    }

    await client.query(
      'INSERT INTO activity (user_id, type, symbol, quantity, price) VALUES ($1, $2, $3, $4, $5)',
      [req.userId, side === 'buy' ? 'Buy' : 'Sell', symbol, qty, px]
    );

    await client.query('COMMIT');
    res.json({ ok: true, side, symbol, quantity: qty, price: px });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Trade failed:', err.message);
    res.status(500).json({ error: 'Order could not be completed.' });
  } finally {
    client.release();
  }
});

module.exports = router;
