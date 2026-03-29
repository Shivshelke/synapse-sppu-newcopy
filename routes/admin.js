/**
 * routes/admin.js — MongoDB + Cloudinary version
 */
require('dotenv').config();
const express    = require('express');
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
      resource_type: 'raw',
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

module.exports = router;
