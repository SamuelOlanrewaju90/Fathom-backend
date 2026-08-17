const fetch = require('node-fetch');

const COINGECKO_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', USDC: 'usd-coin',
  XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', LINK: 'chainlink',
};

let cache = { data: null, fetchedAt: 0 };
const CACHE_MS = 20_000;

async function getLatestPrices(){
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const ids = Object.values(COINGECKO_IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&x_cg_demo_api_key=${process.env.COINGECKO_API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`CoinGecko responded ${r.status}`);
  const raw = await r.json();

  const out = Object.entries(COINGECKO_IDS).map(([sym, id]) => ({
    sym,
    price: raw[id]?.usd ?? null,
    chg: raw[id]?.usd_24h_change ?? null,
  }));

  cache = { data: out, fetchedAt: now };
  return out;
}

function getCachedPrices(){
  return cache.data || [];
}

module.exports = { getLatestPrices, getCachedPrices };
