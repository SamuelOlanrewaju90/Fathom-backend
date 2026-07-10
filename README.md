# Fathom API

The backend for the Fathom site: accounts, login, two-factor auth, live
crypto prices, and a database that stores each user's simulated
portfolio. No real money or crypto moves through this — see the
disclaimer on the website itself.

## What's here

```
backend/
  server.js          entry point
  db.js               SQLite database + table setup (creates fathom.db automatically)
  routes/auth.js       register, login, 2FA
  routes/prices.js     live prices from CoinGecko
  routes/portfolio.js  holdings, activity, simulated trades
  middleware/auth.js   checks login tokens on protected routes
  utils/crypto.js      encrypts 2FA secrets before they're stored
  .env.example         template for required settings
```

## Deploying without a computer (phone-friendly, using Render)

**1. Put this code on GitHub**
- Create a free account at github.com
- Tap "+" → "New repository", name it `fathom-backend`, make it Public, create it
- Use "Add file → Upload files" and upload everything inside this `backend` folder
  (keep the folder structure — `routes/`, `middleware/`, `utils/` should stay as folders)
- Do **not** upload your `.env` file — only `.env.example`

**2. Deploy it on Render**
- Go to render.com, sign up free, choose "New +" → "Web Service"
- Connect your GitHub account and pick the `fathom-backend` repo
- Settings:
  - Build command: `npm install`
  - Start command: `node server.js`
- Under "Environment", add these variables (values from your own `.env`, not the example ones):
  - `JWT_SECRET` — a long random string
  - `ENCRYPTION_KEY` — exactly 32 characters
  - `FRONTEND_URL` — your Netlify site's URL
- Tap "Create Web Service". Render builds and starts it — you'll get a live URL like
  `https://fathom-backend.onrender.com`

**3. Connect the frontend to it**
- Open `js/config.js` in your website files
- Set `API_BASE_URL` to the Render URL from the step above
- Re-upload the site to Netlify

Render's free tier sleeps after inactivity and takes ~30 seconds to wake up
on the first request — normal for a free demo backend, not a bug.

## Running it on your own computer instead (optional)

```
cd backend
npm install
cp .env.example .env    # then fill in real values
node server.js
```

## API summary

| Method | Route | Auth required | What it does |
|---|---|---|---|
| POST | /api/auth/register | no | create an account |
| POST | /api/auth/login | no | log in (returns a token, or asks for a 2FA code) |
| POST | /api/auth/2fa/setup | yes | start 2FA setup, returns a QR code |
| POST | /api/auth/2fa/verify | yes | confirm 2FA with a code from an authenticator app |
| POST | /api/auth/2fa/disable | yes | turn 2FA off |
| GET  | /api/auth/me | yes | current account info |
| GET  | /api/prices | no | live prices for tracked assets |
| GET  | /api/portfolio/holdings | yes | this user's balances |
| GET  | /api/portfolio/activity | yes | this user's recent orders |
| POST | /api/portfolio/trade | yes | place a simulated buy/sell order |
