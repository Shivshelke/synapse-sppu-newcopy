/**
 * routes/student.js — MongoDB version
 */
const express  = require('express');
const bcrypt   = require('bcryptjs');
const router   = express.Router();
const Student  = require('../models/Student');

// POST /student/register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Username, email, and password are required.' });

  const exists = await Student.findOne({ $or: [{ username }, { email }] });
  if (exists) return res.status(400).json({ error: 'Username or email already in use.' });

  const hashed = await bcrypt.hash(password, 10);
  const student = await Student.create({ username, email, password: hashed, isPremium: false });

  req.session.isStudent    = true;
  req.session.studentUser  = username;
  req.session.isPremium    = false;
  res.json({ success: true, message: 'Registration successful.' });
});

// POST /student/login
router.post('/login', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Username, email, and password required.' });

  const student = await Student.findOne({ username, email });
  if (!student) return res.status(401).json({ error: 'Invalid credentials.' });

  const valid = await bcrypt.compare(password, student.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

  req.session.isStudent   = true;
  req.session.studentUser = username;
  req.session.isPremium   = student.isPremium || false;
  return res.json({ success: true, username, isPremium: req.session.isPremium });
});

// POST /student/logout
router.post('/logout', (req, res) => {
  req.session.isStudent   = false;
  req.session.studentUser = null;
  req.session.isPremium   = false;
  res.json({ success: true });
});

// GET /student/status
router.get('/status', (req, res) => {
  if (req.session && req.session.isStudent)
    return res.json({ loggedIn: true, username: req.session.studentUser, isPremium: req.session.isPremium || false });
  res.json({ loggedIn: false });
});

// POST /student/buy-premium
router.post('/buy-premium', async (req, res) => {
  if (!req.session || !req.session.isStudent)
    return res.status(401).json({ error: 'Unauthorized.' });

  await Student.updateOne({ username: req.session.studentUser }, { isPremium: true });
  req.session.isPremium = true;
  res.json({ success: true, message: 'Premium unlocked!' });
});

module.exports = router;
