/**
 * routes/api.js — MongoDB + Cloudinary version
 */
const express = require('express');
const nodemailer = require('nodemailer');
const https = require('https');
const http = require('http');
const OpenAI = require('openai');
const nvidiaClient = process.env.NVIDIA_API_KEY ? new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1'
}) : null;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const router = express.Router();
const File = require('../models/File');
const Feedback = require('../models/Feedback');
const Student = require('../models/Student');

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

    if (file.url.includes('drive.google.com') || (file.publicId && file.publicId.startsWith('google-drive'))) {
      return res.redirect(file.url);
    }

    let baseName = (file.originalName || file.subject || 'file').trim();
    if (baseName.toLowerCase().endsWith('.pdf')) {
      baseName = baseName.slice(0, -4);
    }
    const filename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';
    proxySecure(file.url, res, filename, 'attachment');
  } catch (e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/view/:id — view PDF inline in browser
router.get('/view/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || !file.url) return res.status(404).json({ error: 'File not found.' });

    if (file.url.includes('drive.google.com') || (file.publicId && file.publicId.startsWith('google-drive'))) {
      return res.redirect(file.url);
    }

    let baseName = (file.originalName || file.subject || 'file').trim();
    if (baseName.toLowerCase().endsWith('.pdf')) {
      baseName = baseName.slice(0, -4);
    }
    const filename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';
    proxySecure(file.url, res, filename, 'inline');
  } catch (e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

const CategoryConfig = require('../models/CategoryConfig');

// GET /api/config
router.get('/config', async (req, res) => {
  try {
    let doc = await CategoryConfig.findOne({ key: 'years_config' });
    if (!doc) {
      doc = await CategoryConfig.create({ key: 'years_config' });
    }
    res.json(doc.years);
  } catch (e) {
    console.error('Error loading config from DB:', e);
    res.status(500).json({ error: 'Failed to load configuration.' });
  }
});

// GET /api/files
router.get('/files', async (req, res) => {
  try {
    const { year, branch, subject, semester, search } = req.query;
    const query = { contentType: 'regular' };
    if (year) query.year = year;
    if (branch) query.branch = branch;
    if (subject) query.subject = subject;
    if (semester) query.semester = semester;

    if (search) {
      const r = new RegExp(search, 'i');
      query.$or = [{ originalName: r }, { subject: r }, { branch: r }];
    }
    const files = await File.find(query).sort({ uploadDate: -1 });
    res.json(files);
  } catch (error) {
    console.error("[Files API Error]:", error);
    res.status(500).json({ error: "Failed to retrieve files. The database might be warming up, please try again." });
  }
});

// GET /api/preview/:id — Generate a blurred image preview of the first page
router.get('/preview/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || !file.url) return res.status(404).json({ error: 'File not found.' });

    if (file.url.includes('drive.google.com') || (file.publicId && file.publicId.startsWith('google-drive'))) {
      const previewUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100"><rect width="800" height="1100" fill="%231e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="28" fill="%23a5b4fc">SYNAPSE PREMIUM</text><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="%2394a3b8">Premium Document (Google Drive Link)</text><text x="50%" y="62%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" fill="%2364748b">No preview available. Get Premium to view this link.</text></svg>`;
      return res.json({ previewUrl });
    }

    // Cloudinary transformation: Page 1, Blur 1000, Width 800, format JPG
    // We insert transformations after "/upload/"
    const baseUrl = file.url;
    let previewUrl = baseUrl;

    if (baseUrl.includes('/upload/')) {
      // If it's a PDF, we can select page 1 and blur it
      // Format: .../upload/pg_1,e_blur:1000,w_800,f_jpg/v123/public_id.pdf
      previewUrl = baseUrl.replace('/upload/', '/upload/pg_1,e_blur:1000,w_800,f_jpg/');

      // Also ensure the extension is .jpg for the preview
      if (previewUrl.toLowerCase().endsWith('.pdf')) {
        previewUrl = previewUrl.slice(0, -4) + '.jpg';
      }
    }

    res.json({ previewUrl });
  } catch (e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/premium-files
router.get('/premium-files', async (req, res) => {
  try {
    const { type, year, branch, semester } = req.query;
    const query = type ? { contentType: type } : { contentType: { $ne: 'regular' } };

    if (year) query.year = year;
    if (branch) query.branch = branch;
    if (semester) query.semester = semester;

    const files = await File.find(query).sort({ uploadDate: -1 });

    // If user is premium or admin, return everything.
    // Otherwise, remove the 'url' field to prevent direct downloads.
    const isAuthorized = req.session && (req.session.isAdmin || (req.session.isStudent && req.session.isPremium));

    if (isAuthorized) {
      return res.json(files);
    } else {
      const publicFiles = files.map(f => {
        const obj = f.toObject();
        delete obj.url; // Prevent download
        return obj;
      });
      return res.json(publicFiles);
    }
  } catch (error) {
    console.error("[Premium Files API Error]:", error);
    res.status(500).json({ error: "Failed to retrieve premium files. The database might be warming up, please try again." });
  }
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  try {
    const [total, totalStudents, pendingPremium, totalFeedback, byYearRaw] = await Promise.all([
      File.countDocuments().catch(() => 0),
      Student.countDocuments().catch(() => 0),
      Student.countDocuments({ premiumStatus: 'pending', requestSeen: false }).catch(() => 0),
      Feedback.countDocuments({ isRead: false }).catch(() => 0),
      File.aggregate([{ $group: { _id: '$year', count: { $sum: 1 } } }]).catch(() => [])
    ]);

    const byYear = {};
    if (Array.isArray(byYearRaw)) {
      byYearRaw.forEach(r => { if (r._id) byYear[r._id] = r.count; });
    }

    res.json({
      total: total || 0,
      totalStudents: totalStudents || 0,
      pendingPremium: pendingPremium || 0,
      totalFeedback: totalFeedback || 0,
      byYear
    });
  } catch (e) {
    console.error('[Stats API Error]:', e);
    // Return empty stats instead of 500 to keep UI functional
    res.json({ total: 0, totalStudents: 0, pendingPremium: 0, totalFeedback: 0, byYear: {} });
  }
});

// POST /api/feedback
router.post('/feedback', async (req, res) => {
  try {
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
      } catch (e) { console.error('Email error:', e); }
    }
    // Formspree Integration
    try {
      const data = JSON.stringify({ name: safeName, message: message.trim() });
      const options = {
        hostname: 'formspree.io',
        path: '/f/xjgjlvgo',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };
      const formReq = https.request(options);
      formReq.on('error', (e) => console.error('Formspree error:', e));
      formReq.write(data);
      formReq.end();
    } catch (e) { console.error('Formspree integration error:', e); }

    res.json({ success: true, message: 'Thanks for your feedback! 🚀' });
  } catch (error) {
    console.error("[Feedback API Error]:", error);
    res.status(500).json({ error: "Failed to submit feedback. The database might be warming up, please try again." });
  }
});

// POST /api/feedback/mark-read
router.post('/feedback/mark-read', async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: 'Unauthorized' });
  try {
    await Feedback.updateMany({ isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});
// POST /api/chat (Gemini AI Chatbot)
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required.' });

  // Rule-based fallback function
  const getFallbackReply = (msg) => {
    const lowMsg = msg.toLowerCase();
    
    // Strict rules for names/creator/developer
    if (lowMsg.includes('shivam') || lowMsg.includes('shelke') || lowMsg.includes('developer') || lowMsg.includes('creator') || lowMsg.includes('owner') || lowMsg.includes('founder') || lowMsg.includes('who built') || lowMsg.includes('who made')) {
      return "Shivam Shelke is the developer and creator of SYNAPSE! He built this platform to help SPPU students like you. 🚀";
    }
    
    // Greeting or portal general queries
    if (lowMsg.includes('hello') || lowMsg.includes('hi ') || lowMsg === 'hi' || lowMsg === 'hey') {
      return "Hello there! I am the SYNAPSE assistant. How can I help you today?";
    } else if (lowMsg.includes('pyq') || lowMsg.includes('paper') || lowMsg.includes('download')) {
      return "You can browse and download PYQs by selecting your Year on the home page, then choosing your Branch and Subject. All our papers are for the 2024 Pattern.";
    } else if (lowMsg.includes('premium') || lowMsg.includes('price')) {
      return "Premium gives you access to Solved PYQs, Handwritten Notes, and Practice Banks for just ₹99. Just click on 'Premium PRO' in the navbar to login and buy!";
    } else if (lowMsg.includes('who are you') || lowMsg.includes('name')) {
      return "I'm the SYNAPSE Bot, created to help SPPU students navigate this PYQ portal.";
    }
    
    return "I only know Shivam Shelke as the creator and developer of SYNAPSE! You can ask me about SPPU PYQs, Branches, or Premium content.";
  };

  try {
    if (process.env.GEMINI_API_KEY) {
      const fetch = require('node-fetch');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `You are the SYNAPSE Assistant for SPPU students. Answer very concisely and to the point. Keep it short.

CRITICAL RULES:
1. If the user asks about the developer, creator, owner, founder, or builder of SYNAPSE, you must only identify Shivam Shelke as the sole developer and creator of SYNAPSE.
2. If asked about any other person's name, other developers, or other creators, do NOT mention, discuss, or disclose them. Strictly state that you only know Shivam Shelke as the creator and developer of SYNAPSE. Do not talk about anyone else's names or details under any circumstances.

User asked: ${message}` }] }]
        })
      });

      const data = await response.json();
      if (data.candidates && data.candidates[0].content.parts[0].text) {
        return res.json({ reply: data.candidates[0].content.parts[0].text });
      }
    }

    res.json({ reply: getFallbackReply(message) });
  } catch (error) {
    res.json({ reply: getFallbackReply(message) });
  }
});

module.exports = router;
