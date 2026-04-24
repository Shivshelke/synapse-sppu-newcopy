/**
 * routes/admin.js — MongoDB + Cloudinary version
 */
require('dotenv').config();
const express    = require('express');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { requireAdmin } = require('../middleware/auth');
const router     = express.Router();
const File       = require('../models/File');
const Feedback   = require('../models/Feedback');
const Student    = require('../models/Student');

// ── Cloudinary config ─────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Multer + Cloudinary storage ───────────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const { year, branch, subject, contentType } = req.body;
    const folder = contentType && contentType !== 'regular'
      ? `synapse/premium/${contentType}`
      : `synapse/${year}/${branch}`;
    return {
      folder,
      resource_type: 'image',
      format: 'pdf',
      public_id: `${subject}_${Date.now()}`
    };
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Only PDFs allowed.'));
  }
});

router.use(requireAdmin);

// GET /admin/dashboard
router.get('/dashboard', (req, res) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// POST /admin/upload
router.post('/upload', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const { year, branch, subject, customSubject, contentType } = req.body;
    if (!req.file) return res.status(400).json({ error: 'File required.' });

    const finalSubject = customSubject && customSubject.trim() ? customSubject.trim() : subject;
    const record = {
      originalName: req.file.originalname,
      storedName:   req.file.filename || req.file.public_id,
      year:         year || 'any',
      branch:       branch || 'any',
      subject:      finalSubject,
      size:         req.file.size || 0,
      uploadedBy:   req.session.adminUser,
      url:          req.file.path,
      publicId:     req.file.filename || req.file.public_id,
      contentType:  contentType || 'regular'
    };
    const saved = await File.create(record);
    res.json({ success: true, file: saved });
  });
});

// DELETE /admin/files/:id
router.delete('/files/:id', async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });

  try { await cloudinary.uploader.destroy(file.publicId, { resource_type: 'raw' }); } catch(e) {}
  await File.deleteOne({ _id: req.params.id });
  res.json({ success: true });
});

// GET /admin/files
router.get('/files', async (req, res) => {
  const { contentType } = req.query;
  const query = contentType
    ? { contentType }
    : { contentType: 'regular' };
  const files = await File.find(query).sort({ uploadDate: -1 });
  res.json(files);
});

// GET /admin/feedback
router.get('/feedback', async (req, res) => {
  const list = await Feedback.find().sort({ date: -1 });
  res.json(list);
});

// DELETE /admin/feedback/:id
router.delete('/feedback/:id', async (req, res) => {
  await Feedback.deleteOne({ _id: req.params.id });
  res.json({ success: true });
});

// GET /admin/students
router.get('/students', async (req, res) => {
  const students = await Student.find({}, '-password').sort({ registeredAt: -1 });
  res.json(students);
});

// POST /admin/config/subject (in-memory only for now)
router.post('/config/subject', (req, res) => res.json({ success: true }));
router.delete('/config/subject', (req, res) => res.json({ success: true }));
router.post('/config/branch', (req, res) => res.json({ success: true }));

// GET /admin/premium-requests — always returns ALL pending requests
router.get('/premium-requests', async (req, res) => {
  const requests = await Student.find({ premiumStatus: 'pending' }, '-password').sort({ requestedAt: -1 });
  res.json(requests);
});

// POST /admin/premium-requests/mark-seen
router.post('/premium-requests/mark-seen', async (req, res) => {
  try {
    await Student.updateMany({ premiumStatus: 'pending', requestSeen: false }, { requestSeen: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to mark as seen.' });
  }
});

// POST /admin/approve-premium/:id
router.post('/approve-premium/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    student.isPremium = true;
    student.premiumStatus = 'active';
    await student.save();

    // Send Email Notification
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });
      const mailOptions = {
        from: `"Synapse SPPU" <${process.env.EMAIL_USER}>`,
        to: student.email,
        subject: 'Premium Access Approved! 🚀 - Synapse SPPU',
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #6366f1;">Congratulations @${student.username}!</h2>
            <p>Your request for <b>Premium Access</b> has been approved by the Admin.</p>
            <p>You can now access all Premium Question Papers, Notes, and exclusive content on the portal.</p>
            <br>
            <a href="https://synapse-sppu.vercel.app" style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
            <br><br>
            <p style="color: #666; font-size: 0.9em;">Happy Studying!<br>Team Synapse</p>
          </div>
        `
      };
      transporter.sendMail(mailOptions).catch(e => console.error('Email send error:', e));
    }

    res.json({ success: true, message: 'Student approved and notified!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve student.' });
  }
});

// POST /admin/reject-premium/:id
router.post('/reject-premium/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    student.premiumStatus = 'none';
    await student.save();

    // Send Email Notification
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });
      const mailOptions = {
        from: `"Synapse SPPU" <${process.env.EMAIL_USER}>`,
        to: student.email,
        subject: 'Update on your Premium Request - Synapse SPPU',
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #ef4444;">Hello @${student.username}</h2>
            <p>Your request for Premium Access could not be approved at this time.</p>
            <p><b>Possible reasons:</b> Invalid payment screenshot, incorrect details, or technical issues.</p>
            <p>Please try requesting again with a valid proof of payment.</p>
            <br>
            <p style="color: #666; font-size: 0.9em;">Regards,<br>Team Synapse</p>
          </div>
        `
      };
      transporter.sendMail(mailOptions).catch(e => console.error('Email send error:', e));
    }

    res.json({ success: true, message: 'Student rejected and notified.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject student.' });
  }
});

// POST /admin/revoke-premium/:id
router.post('/revoke-premium/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    student.isPremium = false;
    student.premiumStatus = 'none';
    await student.save();

    res.json({ success: true, message: 'Premium access revoked successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke premium access.' });
  }
});

module.exports = router;
