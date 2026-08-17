const express = require('express');
const router = express.Router();
const { getLatestPrices } = require('../services/priceCache');

router.get('/', async (req, res) => {
  try {
    const data = await getLatestPrices();
    res.json(data);
  } catch (err) {
    console.error('Price fetch failed:', err.message);
    res.status(502).json({ error: 'Could not reach the price feed. Try again shortly.' });
  }
});

module.exports = router;
