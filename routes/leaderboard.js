const express = require('express');
const { pool } = require('../db');
const { getCachedPrices } = require('../services/priceCache');

const router = express.Router();

function maskEmail(email){
  const [user, domain] = email.split('@');
  const visible = user.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, h.symbol, h.quantity
      FROM users u
      JOIN holdings h ON h.user_id = u.id
    `);

    const prices = getCachedPrices();
    const priceMap = {};
    prices.forEach(p => { priceMap[p.sym] = p.price; });

    const totals = {};
    result.rows.forEach(row => {
      if (!totals[row.id]) totals[row.id] = { email: row.email, value: 0 };
      const price = row.symbol === 'USD_CASH' ? 1 : (priceMap[row.symbol] || 0);
      totals[row.id].value += row.quantity * price;
    });

    const ranked = Object.values(totals)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
      .map((entry, i) => ({
        rank: i + 1,
        email: maskEmail(entry.email),
        value: Math.round(entry.value * 100) / 100,
        gainPct: Math.round(((entry.value - 10000) / 10000) * 10000) / 100,
      }));

    res.json(ranked);
  } catch (err) {
    console.error('Leaderboard failed:', err.message);
    res.status(500).json({ error: 'Could not load leaderboard.' });
  }
});

module.exports = router;
