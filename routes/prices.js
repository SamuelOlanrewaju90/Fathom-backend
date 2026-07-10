// routes/prices.js — live prices from CoinCap's free public API.

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const COINCAP_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'xrp',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  LINK: 'chainlink',
};

let cache = { data: null, fetchedAt: 0 };
const CACHE_MS = 20000;

router.get('/', async (req, res) => {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_MS) {
    return res.json(cache.data);
  }

  try {
    const ids = Object.values(COINCAP_IDS).join(',');
    const url = `https://api.coincap.io/v2/assets?ids=${ids}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`CoinCap responded ${r.status}`);
    const raw = await r.json();

    const out = Object.entries(COINCAP_IDS).map(([sym, id]) => {
      const row = raw.data.find(x => x.id === id);
      return {
        sym,
        price: row ? parseFloat(row.priceUsd) : null,
        chg: row ? parseFloat(row.changePercent24Hr) : null,
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
