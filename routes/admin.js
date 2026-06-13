/**
 * routes/admin.js — MongoDB + Cloudinary version
 */
require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();
const File = require('../models/File');
const Feedback = require('../models/Feedback');
const Student = require('../models/Student');

// ── Cloudinary config ─────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Multer + Cloudinary storage ───────────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const { year, branch, subject, contentType, semester } = req.body;
    let folder = 'synapse/misc';

    if (contentType && contentType !== 'regular') {
      folder = `synapse/premium/${contentType}/${year}/${branch}`;
      if (semester) folder += `/${semester}`;
    } else {
      folder = `synapse/${year}/${branch}`;
      if (semester) folder += `/${semester}`;
    }

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
    const { year, branch, subject, customSubject, contentType, semester, isLink, linkUrl, customFileName } = req.body;

    const finalSubject = customSubject && customSubject.trim() ? customSubject.trim() : subject;

    let record;
    if (isLink === 'true') {
      if (!linkUrl) return res.status(400).json({ error: 'Link URL required.' });

      const fileName = customFileName && customFileName.trim()
        ? customFileName.trim()
        : `${finalSubject || 'document'}.pdf`;

      record = {
        originalName: fileName,
        storedName: `google-drive_${Date.now()}`,
        year: year || 'any',
        branch: branch || 'any',
        subject: finalSubject,
        semester: semester || 'any',
        size: 0,
        uploadedBy: req.session.adminUser,
        url: linkUrl,
        publicId: `google-drive_${Date.now()}`,
        contentType: contentType || 'regular'
      };
    } else {
      if (!req.file) return res.status(400).json({ error: 'File required.' });

      record = {
        originalName: req.file.originalname,
        storedName: req.file.filename || req.file.public_id,
        year: year || 'any',
        branch: branch || 'any',
        subject: finalSubject,
        semester: semester || 'any',
        size: req.file.size || 0,
        uploadedBy: req.session.adminUser,
        url: req.file.path,
        publicId: req.file.filename || req.file.public_id,
        contentType: contentType || 'regular'
      };
    }

    const saved = await File.create(record);
    res.json({ success: true, file: saved });
  });
});

// DELETE /admin/files/:id
router.delete('/files/:id', async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });

  try {
    if (file.publicId && !file.publicId.startsWith('google-drive')) {
      await cloudinary.uploader.destroy(file.publicId, { resource_type: 'raw' });
    }
  } catch (e) { }
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

const CategoryConfig = require('../models/CategoryConfig');

// POST /admin/config/subject
router.post('/config/subject', async (req, res) => {
  const { year, branch, subject } = req.body;
  if (!year || !subject || !subject.trim()) {
    return res.status(400).json({ error: 'Year and Subject are required.' });
  }

  try {
    let doc = await CategoryConfig.findOne({ key: 'years_config' });
    if (!doc) {
      doc = new CategoryConfig({ key: 'years_config' });
    }

    const yearData = doc.years[year];
    if (!yearData) return res.status(400).json({ error: 'Invalid year.' });

    const cleanSubject = subject.trim();

    if (year === 'first') {
      if (!Array.isArray(yearData.subjects)) {
        yearData.subjects = [];
      }
      if (!yearData.subjects.includes(cleanSubject)) {
        yearData.subjects.push(cleanSubject);
      }
    } else {
      if (!branch) {
        return res.status(400).json({ error: 'Branch is required for 2nd, 3rd, and 4th Year.' });
      }
      const cleanBranch = branch.trim();
      if (!yearData.subjects || typeof yearData.subjects !== 'object' || Array.isArray(yearData.subjects)) {
        yearData.subjects = {};
      }
      if (!yearData.subjects[cleanBranch]) {
        yearData.subjects[cleanBranch] = [];
      }
      if (!yearData.subjects[cleanBranch].includes(cleanSubject)) {
        yearData.subjects[cleanBranch].push(cleanSubject);
      }
    }

    doc.markModified('years');
    await doc.save();
    res.json({ success: true });
  } catch (e) {
    console.error('Error saving subject config:', e);
    res.status(500).json({ error: 'Database save error.' });
  }
});

router.delete('/config/subject', (req, res) => res.json({ success: true }));

// POST /admin/config/branch
router.post('/config/branch', async (req, res) => {
  const { year, branch } = req.body;
  if (!year || !branch || !branch.trim()) {
    return res.status(400).json({ error: 'Year and Branch are required.' });
  }

  try {
    let doc = await CategoryConfig.findOne({ key: 'years_config' });
    if (!doc) {
      doc = new CategoryConfig({ key: 'years_config' });
    }

    const yearData = doc.years[year];
    if (!yearData) return res.status(400).json({ error: 'Invalid year.' });

    const cleanBranch = branch.trim();
    if (!yearData.branches.includes(cleanBranch)) {
      yearData.branches.push(cleanBranch);
    }

    doc.markModified('years');
    await doc.save();
    res.json({ success: true });
  } catch (e) {
    console.error('Error saving branch config:', e);
    res.status(500).json({ error: 'Database save error.' });
  }
});

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
        subject: '🚀 Your Premium Access is Active! - Synapse SPPU',
        html: `
          <div style="background-color: #0f172a; padding: 40px 20px; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
            <div style="max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 20px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
              <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">SYNAPSE PREMIUM</h1>
              </div>
              <div style="padding: 40px 30px; text-align: center;">
                <div style="color: #94a3b8; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Access Granted</div>
                <h2 style="color: white; margin: 0 0 20px 0; font-size: 28px; font-weight: 700;">Welcome to the Inner Circle, @${student.username}!</h2>
                <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                  Your request for <b>Premium Access</b> has been verified and approved. You now have unlimited access to all exclusive PYQs, detailed notes, and premium features.
                </p>
                <a href="https://sppupyq-synapse.vercel.app" style="display: inline-block; background: #6366f1; color: white; padding: 16px 32px; border-radius: 12px; font-weight: 600; text-decoration: none; transition: all 0.2s;">
                  Start Learning Now
                </a>
                <div style="margin-top: 40px; padding-top: 25px; border-top: 1px solid #334155;">
                  <p style="color: #64748b; font-size: 13px; margin: 0;">
                    Unleash your potential with Synapse.<br>
                    Keep learning, keep growing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        `
      };
      await transporter.sendMail(mailOptions);
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
          <div style="background-color: #0f172a; padding: 40px 20px; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
            <div style="max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 20px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
              <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">PREMIUM REQUEST</h1>
              </div>
              <div style="padding: 40px 30px; text-align: center;">
                <div style="color: #94a3b8; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Action Required</div>
                <h2 style="color: white; margin: 0 0 20px 0; font-size: 24px; font-weight: 700;">Hello @${student.username},</h2>
                <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin-bottom: 30px; text-align: left;">
                  Your request for Premium Access could not be approved at this time. This is usually due to:
                  <ul style="color: #94a3b8; text-align: left; padding-left: 20px; margin-top: 10px;">
                    <li>Missing or unclear payment screenshot.</li>
                    <li>Incorrect transaction details.</li>
                    <li>Duplicate request.</li>
                  </ul>
                  Please ensure your proof of payment is clear and try submitting the request again.
                </p>
                <a href="https://sppupyq-synapse.vercel.app" style="display: inline-block; border: 1px solid #475569; color: white; padding: 14px 28px; border-radius: 12px; font-weight: 600; text-decoration: none;">
                  Re-submit Request
                </a>
                <div style="margin-top: 40px; padding-top: 25px; border-top: 1px solid #334155;">
                  <p style="color: #64748b; font-size: 13px; margin: 0;">
                    Need help? Contact support via the dashboard feedback section.
                  </p>
                </div>
              </div>
            </div>
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
