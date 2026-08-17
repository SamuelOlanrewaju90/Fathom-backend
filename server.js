require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { initSchema } = require('./db');
const authRoutes = require('./routes/auth');
const priceRoutes = require('./routes/prices');
const portfolioRoutes = require('./routes/portfolio');
const leaderboardRoutes = require('./routes/leaderboard');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10kb' }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests. Slow down and try again shortly.' },
}));

app.get('/', (req, res) => res.json({ status: 'Fathom API is running.' }));
app.use('/api/auth', authRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

const PORT = process.env.PORT || 4000;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Fathom API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to set up the database:', err.message);
    process.exit(1);
  });
