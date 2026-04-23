/**
 * routes/api.js — MongoDB + Cloudinary version
 */
const express    = require('express');
const nodemailer = require('nodemailer');
const https      = require('https');
const http       = require('http');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI      = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const router     = express.Router();
const File       = require('../models/File');
const Feedback   = require('../models/Feedback');

// Helper to proxy Cloudinary files with redirect support and header forwarding
function proxySecure(url, res, filename, disposition = 'attachment') {
  const protocol = url.startsWith('https') ? https : http;
  const options = {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Synapse-SPPU-Portal/1.0' }
  };

  protocol.get(url, options, (proxyRes) => {
    // Handle redirects (e.g. 301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      let redirectUrl = proxyRes.headers.location;
      // Handle relative redirects
      if (!redirectUrl.startsWith('http')) {
        const origin = new URL(url).origin;
        redirectUrl = origin + (redirectUrl.startsWith('/') ? '' : '/') + redirectUrl;
      }
      return proxySecure(redirectUrl, res, filename, disposition);
    }

    if (proxyRes.statusCode !== 200) {
      console.error(`[Proxy] Error ${proxyRes.statusCode} for URL: ${url}`);
      return res.status(proxyRes.statusCode || 500).send('File access error.');
    }

    // Set standard headers using Express helpers
    if (disposition === 'attachment') {
      res.attachment(filename);
    } else {
      res.set('Content-Disposition', `inline; filename="${filename}"`);
    }

    res.set('Content-Type', proxyRes.headers['content-type'] || 'application/pdf');
    
    // Forward Content-Length for better browser experience
    if (proxyRes.headers['content-length']) {
      res.set('Content-Length', proxyRes.headers['content-length']);
    }

    // Forward encoding so the browser decompresses it before saving
    if (proxyRes.headers['content-encoding']) {
      res.set('Content-Encoding', proxyRes.headers['content-encoding']);
    }
    if (proxyRes.headers['accept-ranges']) {
      res.set('Accept-Ranges', proxyRes.headers['accept-ranges']);
    }

    proxyRes.pipe(res);

    proxyRes.on('error', (err) => {
      console.error('[Proxy] Stream Error:', err);
      if (!res.headersSent) res.status(500).send('Stream error.');
    });

  }).on('error', (err) => {
    console.error('[Proxy] Connection Error:', err);
    if (!res.headersSent) res.status(500).send('Download failed.');
  });
}

// GET /api/download/:id — proxy PDF with correct content-type
router.get('/download/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || !file.url) return res.status(404).json({ error: 'File not found.' });

    let baseName = (file.originalName || file.subject || 'file').trim();
    if (baseName.toLowerCase().endsWith('.pdf')) {
      baseName = baseName.slice(0, -4);
    }
    const filename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';
    proxySecure(file.url, res, filename, 'attachment');
  } catch(e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/view/:id — view PDF inline in browser
router.get('/view/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || !file.url) return res.status(404).json({ error: 'File not found.' });

    let baseName = (file.originalName || file.subject || 'file').trim();
    if (baseName.toLowerCase().endsWith('.pdf')) {
      baseName = baseName.slice(0, -4);
    }
    const filename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';
    proxySecure(file.url, res, filename, 'inline');
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
// POST /api/chat (Gemini AI Chatbot)
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required.' });

  try {
    if (genAI) {
      // Use Gemini API
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `You are the helpful assistant for SYNAPSE, an SPPU Engineering PYQ (Previous Year Questions) portal.
Your tone is friendly, professional, and concise. Only answer questions related to the SYNAPSE portal, SPPU engineering, PYQs, studying, and student features. If they ask a general question, try to relate it to their studies. If they ask who you are, you are the SYNAPSE Bot powered by Gemini.
The portal features: Free 2024 Pattern PYQs organized by Year (1st to 4th), Branch, and Subject. Premium access costs ₹99 and provides Solved PYQs, Handwritten Notes, and Practice Banks. Students can buy premium by logging in. Admin can upload papers.
Keep responses short, max 3-4 sentences.

User asked: "${message}"`;
      
      const result = await model.generateContent(prompt);
      const reply = result.response.text();
      return res.json({ reply });
    } else {
      // Fallback rule-based
      const msg = message.toLowerCase();
      let reply = "I'm a simple bot right now. You can ask me about SPPU PYQs, Branches, or Premium content!";
      if (msg.includes('hello') || msg.includes('hi ') || msg === 'hi' || msg === 'hey') {
        reply = "Hello there! I am the SYNAPSE assistant. How can I help you today?";
      } else if (msg.includes('pyq') || msg.includes('paper') || msg.includes('download')) {
        reply = "You can browse and download PYQs by selecting your Year on the home page, then choosing your Branch and Subject. All our papers are for the 2024 Pattern.";
      } else if (msg.includes('premium') || msg.includes('price')) {
        reply = "Premium gives you access to Solved PYQs, Handwritten Notes, and Practice Banks for just ₹99. Just click on 'Premium PRO' in the navbar to login and buy!";
      } else if (msg.includes('who are you') || msg.includes('name')) {
        reply = "I'm the SYNAPSE Bot, created to help SPPU students navigate this PYQ portal.";
      }
      setTimeout(() => { res.json({ reply }); }, 600);
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.json({ reply: "I'm sorry, I'm having trouble connecting to my AI brain right now. Try again later!" });
  }
});

module.exports = router;
