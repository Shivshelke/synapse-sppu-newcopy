/**
 * routes/auth.js — Admin login using env credentials
 */
require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required.' });

  if (username !== process.env.ADMIN_USERNAME)
    return res.status(401).json({ error: 'Invalid credentials.' });

  const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

  req.session.isAdmin   = true;
  req.session.adminUser = username;
  return res.json({ success: true });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /auth/status
router.get('/status', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.isAdmin) });
});

// POST /auth/change-password — updates env hash in memory only (restart resets)
router.post('/change-password', async (req, res) => {
  if (!req.session || !req.session.isAdmin)
    return res.status(401).json({ error: 'Unauthorized.' });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both passwords required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  const valid = await bcrypt.compare(currentPassword, process.env.ADMIN_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(newPassword, 10);
  res.json({ success: true, message: 'Password updated for this session.' });
});

module.exports = router;
