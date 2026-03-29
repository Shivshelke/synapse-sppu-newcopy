/**
 * routes/api.js — MongoDB + Cloudinary version
 */
const express    = require('express');
const nodemailer = require('nodemailer');
const https      = require('https');
const http       = require('http');
const router     = express.Router();
const File       = require('../models/File');
const Feedback   = require('../models/Feedback');

// GET /api/download/:id — proxy PDF with correct content-type
router.get('/download/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || !file.url) return res.status(404).json({ error: 'File not found.' });

    const fileUrl = file.url;
    const filename = (file.originalName || file.subject || 'file').replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const protocol = fileUrl.startsWith('https') ? https : http;
    protocol.get(fileUrl, (proxyRes) => {
      proxyRes.pipe(res);
    }).on('error', () => res.status(500).json({ error: 'Download failed.' }));
  } catch(e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/view/:id — view PDF inline in browser
router.get('/view/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || !file.url) return res.status(404).json({ error: 'File not found.' });

    const fileUrl = file.url;
    const filename = (file.originalName || file.subject || 'file').replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    const protocol = fileUrl.startsWith('https') ? https : http;
    protocol.get(fileUrl, (proxyRes) => {
      proxyRes.pipe(res);
    }).on('error', () => res.status(500).json({ error: 'View failed.' }));
  } catch(e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Hardcoded config (year/branch/subject taxonomy stored in memory)
const CONFIG = {
  first:  { label: '1st Year', branches: ['FE'], subjects: ['Engineering Mathematics – I','Engineering Mathematics – II','Engineering Physics','Engineering Chemistry','Basic Electrical Engineering','Basic Electronics Engineering','Engineering Graphics','Engineering Mechanics','Fundamentals of Programming Languages','Programming and Problem Solving'] },
  second: { label: '2nd Year', branches: ['Computer Engineering','Information Technology','AIML','Electronics & Telecommunication','Mechanical Engineering','Civil Engineering','Electrical Engineering','Chemical Engineering','Instrumentation Engineering','Production Engineering'], subjects: [] },
  third:  { label: '3rd Year', branches: ['Computer Engineering','Information Technology','AIML','Electronics & Telecommunication','Mechanical Engineering','Civil Engineering','Electrical Engineering','Chemical Engineering','Instrumentation Engineering','Production Engineering'], subjects: [] },
  fourth: { label: '4th Year', branches: ['Computer Engineering','Information Technology','AIML','Electronics & Telecommunication','Mechanical Engineering','Civil Engineering','Electrical Engineering','Chemical Engineering','Instrumentation Engineering','Production Engineering'], subjects: [] }
};

// GET /api/config
router.get('/config', (req, res) => res.json(CONFIG));

// GET /api/files
router.get('/files', async (req, res) => {
  const { year, branch, subject, search } = req.query;
  const query = { contentType: 'regular' };
  if (year)    query.year    = year;
  if (branch)  query.branch  = branch;
  if (subject) query.subject = subject;
  if (search) {
    const r = new RegExp(search, 'i');
    query.$or = [{ originalName: r }, { subject: r }, { branch: r }];
  }
  const files = await File.find(query).sort({ uploadDate: -1 });
  res.json(files);
});

// GET /api/premium-files
router.get('/premium-files', async (req, res) => {
  if (!req.session || (!req.session.isStudent && !req.session.isAdmin))
    return res.status(401).json({ error: 'Please log in to view premium files.' });
  if (req.session.isStudent && !req.session.isPremium)
    return res.status(403).json({ error: 'Premium required.' });

  const { type } = req.query;
  const query = type ? { contentType: type } : { contentType: { $ne: 'regular' } };
  const files = await File.find(query).sort({ uploadDate: -1 });
  res.json(files);
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  const [total, totalStudents, byYearRaw] = await Promise.all([
    File.countDocuments(),
    require('../models/Student').countDocuments(),
    File.aggregate([{ $group: { _id: '$year', count: { $sum: 1 } } }])
  ]);
  const byYear = {};
  byYearRaw.forEach(r => { byYear[r._id] = r.count; });
  res.json({ total, totalStudents, byYear });
});

// POST /api/feedback
router.post('/feedback', async (req, res) => {
  const { name, message } = req.body;
  if (!message || !message.trim())
    return res.status(400).json({ error: 'Message is required.' });

  const safeName = name && name.trim() ? name.trim() : 'Anonymous';
  await Feedback.create({ name: safeName, message: message.trim() });

  // Email notification
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
      await t.sendMail({ from: `"Synapse" <${process.env.EMAIL_USER}>`, to: process.env.EMAIL_USER, subject: `Feedback from ${safeName}`, text: message.trim() });
    } catch(e) { console.error('Email error:', e); }
  }
  res.json({ success: true, message: 'Thanks for your feedback! 🚀' });
});

module.exports = router;
