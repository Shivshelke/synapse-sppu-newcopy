/**
 * SYNAPSE SPPU PYQ — Main Server (MongoDB + Cloudinary)
 */
require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const mongoose  = require('mongoose');
const MongoStore = require('connect-mongo');
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

app.use(session({
  secret: process.env.SESSION_SECRET || 'synapse-sppu-secret-2024',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth',    require('./routes/auth'));
app.use('/api',     require('./routes/api'));
app.use('/admin',   require('./routes/admin'));
app.use('/student', require('./routes/student'));

// ── Catch-all ─────────────────────────────────────────────────────────────────
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => {
  console.log(`\n🧠 SYNAPSE running at http://localhost:${PORT}`);
});
