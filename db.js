const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Add a Postgres database and connect it in your environment variables.');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

async function initSchema(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      totp_secret_encrypted TEXT,
      totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS holdings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
      UNIQUE(user_id, symbol)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      symbol TEXT NOT NULL,
      quantity DOUBLE PRECISION NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

module.exports = { pool, initSchema };
