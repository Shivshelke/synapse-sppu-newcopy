/**
 * SYNAPSE SPPU PYQ — Main Server (MongoDB + Cloudinary)
 */
require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const mongoose  = require('mongoose');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Connect MongoDB ───────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MongoStore = require('connect-mongo').default || require('connect-mongo');

app.use(session({
  secret: process.env.SESSION_SECRET || 'synapse-sppu-secret-2024',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions'
  }),
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── SEO Files ─────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => res.sendFile(path.join(__dirname, 'public', 'robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sitemap.xml')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth',    require('./routes/auth'));
app.use('/api',     require('./routes/api'));
app.use('/admin',   require('./routes/admin'));
app.use('/student', require('./routes/student'));

// ── Catch-all ─────────────────────────────────────────────────────────────────
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ── Local dev server ──────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🧠 SYNAPSE running at http://localhost:${PORT}`);
  });
}

// ── Export for Vercel serverless ──────────────────────────────────────────────
module.exports = app;
