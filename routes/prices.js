// routes/prices.js — live prices from Binance's free public API.

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const BINANCE_SYMBOLS = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  USDC: 'USDCUSDT',
  XRP: 'XRPUSDT',
  ADA: 'ADAUSDT',
  DOGE: 'DOGEUSDT',
  LINK: 'LINKUSDT',
};

let cache = { data: null, fetchedAt: 0 };
const CACHE_MS = 20000;

router.get('/', async (req, res) => {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_MS) {
    return res.json(cache.data);
  }

  try {
    const symbols = JSON.stringify(Object.values(BINANCE_SYMBOLS));
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Binance responded ${r.status}`);
    const raw = await r.json();

    const out = Object.entries(BINANCE_SYMBOLS).map(([sym, pair]) => {
      const row = raw.find(x => x.symbol === pair);
      return {
        sym,
        price: row ? parseFloat(row.lastPrice) : null,
        chg: row ? parseFloat(row.priceChangePercent) : null,
      };
    });

    cache = { data: out, fetchedAt: now };
    res.json(out);
  } catch (err) {
    console.error('Price fetch failed:', err.message);
    if (cache.data) return res.json(cache.data);
    res.status(502).json({ error: 'Could not reach the price feed. Try again shortly.' });
  }
});

module.exports = router;
