// middleware/auth.js — checks the login token sent by the browser
// and attaches the user id to the request if it's valid.

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Log in to continue.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your session has expired. Log in again.' });
  }
}

module.exports = { requireAuth };
