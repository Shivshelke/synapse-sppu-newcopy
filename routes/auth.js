/**
 * routes/auth.js — Admin login using env credentials
 */
require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

// Hash is computed once at startup from ADMIN_PASSWORD env var
// This avoids $ sign corruption in Railway environment variables
let adminPasswordHash = null;

async function getAdminHash() {
  if (adminPasswordHash) return adminPasswordHash;

  // 1. Check for a pre-computed hash in the env (prioritized)
  if (process.env.ADMIN_PASSWORD_HASH) {
    adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  } 
  // 2. Fallback to plain password from env
  else if (process.env.ADMIN_PASSWORD) {
    adminPasswordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  } 
  // 3. Fallback to hardcoded default
  else {
    adminPasswordHash = await bcrypt.hash('Admin@Synapse2024', 10);
  }
  
  return adminPasswordHash;
}

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required.' });

  if (username !== (process.env.ADMIN_USERNAME || 'Synapse07'))
    return res.status(401).json({ error: 'Invalid credentials.' });

  const hash  = await getAdminHash();
  const valid = await bcrypt.compare(password, hash);
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

// POST /auth/change-password
router.post('/change-password', async (req, res) => {
  if (!req.session || !req.session.isAdmin)
    return res.status(401).json({ error: 'Unauthorized.' });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both passwords required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  const hash  = await getAdminHash();
  const valid = await bcrypt.compare(currentPassword, hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

  adminPasswordHash = await bcrypt.hash(newPassword, 10);
  res.json({ success: true, message: 'Password updated for this session.' });
});

module.exports = router;
