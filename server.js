// server.js — entry point. Run with: node server.js (or npm start)

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const priceRoutes = require('./routes/prices');
const portfolioRoutes = require('./routes/portfolio');

const app = express();

// ---------- security basics ----------
app.use(helmet()); // sets a batch of protective HTTP headers
app.use(cors({ origin: process.env.FRONTEND_URL || '*' })); // only your site can call this API
app.use(express.json({ limit: '10kb' })); // small limit blocks giant junk request bodies

// A generous overall limiter for every route; auth and trade routes have
// their own stricter limits layered on top (see routes/auth.js and routes/portfolio.js).
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests. Slow down and try again shortly.' },
}));

// ---------- routes ----------
app.get('/', (req, res) => res.json({ status: 'Fathom API is running.' }));
app.use('/api/auth', authRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/portfolio', portfolioRoutes);

// ---------- fallback error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Fathom API listening on port ${PORT}`));
