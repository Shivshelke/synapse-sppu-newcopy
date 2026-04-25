/**
 * routes/api.js — MongoDB + Cloudinary version
 */
const express    = require('express');
const nodemailer = require('nodemailer');
const https      = require('https');
const http       = require('http');
const OpenAI     = require('openai');
const nvidiaClient = process.env.NVIDIA_API_KEY ? new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1'
}) : null;
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

// GET /api/preview/:id — Generate a blurred image preview of the first page
router.get('/preview/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || !file.url) return res.status(404).json({ error: 'File not found.' });

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
  } catch(e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/premium-files
router.get('/premium-files', async (req, res) => {
  const { type } = req.query;
  const query = type ? { contentType: type } : { contentType: { $ne: 'regular' } };
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
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  try {
    const [total, totalStudents, pendingPremium, totalFeedback, byYearRaw] = await Promise.all([
      File.countDocuments(),
      require('../models/Student').countDocuments(),
      require('../models/Student').countDocuments({ premiumStatus: 'pending', requestSeen: false }),
      Feedback.countDocuments({ isRead: false }),
      File.aggregate([{ $group: { _id: '$year', count: { $sum: 1 } } }])
    ]);
    const byYear = {};
    byYearRaw.forEach(r => { byYear[r._id] = r.count; });
    res.json({ total, totalStudents, pendingPremium, totalFeedback, byYear });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
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
  } catch(e) { console.error('Formspree integration error:', e); }

  res.json({ success: true, message: 'Thanks for your feedback! 🚀' });
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
    if (lowMsg.includes('shivam') || lowMsg.includes('shelke')) {
      return "Shivam Shelke is the developer and creator of SYNAPSE! He built this platform to help SPPU students like you. 🚀";
    }
    if (lowMsg.includes('hello') || lowMsg.includes('hi ') || lowMsg === 'hi' || lowMsg === 'hey') {
      return "Hello there! I am the SYNAPSE assistant. How can I help you today?";
    } else if (lowMsg.includes('pyq') || lowMsg.includes('paper') || lowMsg.includes('download')) {
      return "You can browse and download PYQs by selecting your Year on the home page, then choosing your Branch and Subject. All our papers are for the 2024 Pattern.";
    } else if (lowMsg.includes('premium') || lowMsg.includes('price')) {
      return "Premium gives you access to Solved PYQs, Handwritten Notes, and Practice Banks for just ₹99. Just click on 'Premium PRO' in the navbar to login and buy!";
    } else if (lowMsg.includes('who are you') || lowMsg.includes('name')) {
      return "I'm the SYNAPSE Bot, created to help SPPU students navigate this PYQ portal.";
    }
    return "I'm a simple bot right now. You can ask me about SPPU PYQs, Branches, or Premium content!";
  };

  try {
    // 1. Try NVIDIA DeepSeek
    if (nvidiaClient) {
      try {
        console.log("Checking NVIDIA DeepSeek...");
        const completion = await nvidiaClient.chat.completions.create({
          model: "deepseek-ai/deepseek-v3", 
          messages: [{ role: "user", content: message }],
          max_tokens: 512
        });
        const reply = completion.choices[0].message.content;
        if (reply) {
          console.log("🤖 DeepSeek Success!");
          return res.json({ reply });
        }
      } catch (nvError) {
        console.error("❌ DeepSeek failed:", nvError.message);
      }
    }

    // 2. Try Gemini
    if (genAI) {
      try {
        console.log("Checking Gemini...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(message);
        const response = await result.response;
        const reply = response.text();
        if (reply) {
          console.log("✅ Gemini Success!");
          return res.json({ reply });
        }
      } catch (gemError) {
        console.error("❌ Gemini failed:", gemError.message);
      }
    }

    // 3. Static Fallback
    console.log("❗ All AI failed. Static reply.");
    return res.json({ reply: getFallbackReply(message) });

  } catch (error) {
    console.error("Main Error:", error);
    res.json({ reply: getFallbackReply(message) });
  }
});

module.exports = router;
