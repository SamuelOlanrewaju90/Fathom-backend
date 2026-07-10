// routes/prices.js — live prices from CoinGecko's free public API.

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple',
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
    const ids = Object.values(COINGECKO_IDS).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`CoinGecko responded ${r.status}`);
    const raw = await r.json();
    const out = Object.entries(COINGECKO_IDS).map(([sym, id]) => ({
      sym,
      price: raw[id]?.usd ?? null,
      chg: raw[id]?.usd_24h_change ?? null,
    }));
    cache = { data: out, fetchedAt: now };
    res.json(out);
  } catch (err) {
    if (cache.data) return res.json(cache.data);
    res.status(502).json({ error: 'Could not reach the price feed. Try again shortly.' });
  }
});

module.exports = router;
