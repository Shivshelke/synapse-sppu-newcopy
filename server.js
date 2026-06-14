/**
 * SYNAPSE SPPU PYQ — Main Server (MongoDB + Cloudinary)
 */
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Connect MongoDB ───────────────────────────────────────────────────────────
// ── Connect MongoDB ───────────────────────────────────────────────────────────
const connectDB = async () => {
  const state = mongoose.connection.readyState;

  // 1. Connected
  if (state === 1) {
    return mongoose.connection;
  }

  // 2. Connecting - wait for current connection to resolve
  if (state === 2) {
    console.log('⏳ MongoDB connection in progress, waiting...');
    return new Promise((resolve, reject) => {
      mongoose.connection.once('connected', () => resolve(mongoose.connection));
      mongoose.connection.once('error', (err) => reject(err));
    });
  }

  // 3. Disconnected / Disconnecting - establish new connection
  try {
    console.log('⏳ Connecting to MongoDB...');
    const db = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
      heartbeatFrequencyMS: 10000
    });
    console.log('✅ MongoDB connected');
    return db;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    throw err;
  }
};

// Initial connect for local dev or first Vercel invocation
connectDB();

// Middleware to ensure DB is connected for database-reliant routes
const ensureDbConnected = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection failed in route middleware:', err);
    res.status(500).json({ error: 'Database connection failed.' });
  }
};

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
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 1 day
    autoRemove: 'native'
  }),
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── SEO Directory & Dynamic Injections Helper ─────────────────────────────────
const fs = require('fs');
async function generateSeoDirectory() {
  try {
    const File = require('./models/File');
    const allCombinations = await File.find({ contentType: 'regular' }, 'year branch subject').lean();

    const grouped = {};
    allCombinations.forEach(f => {
      if (!f.year) return;
      const yr = f.year.toLowerCase();
      if (!grouped[yr]) {
        grouped[yr] = {
          label: yr.charAt(0).toUpperCase() + yr.slice(1) + ' Year',
          branches: {}
        };
      }
      const br = f.branch || 'FE';
      if (!grouped[yr].branches[br]) {
        grouped[yr].branches[br] = new Set();
      }
      if (f.subject) {
        grouped[yr].branches[br].add(f.subject);
      }
    });

    let directoryHtml = `
<div class="seo-directory-section" style="margin-top: 5rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 4rem; text-align: left;">
  <h2 style="font-family: 'Syne', sans-serif; font-size: 1.8rem; font-weight: 700; color: var(--text); margin-bottom: 0.5rem; text-align: center;">SPPU PYQ Catalog Directory</h2>
  <p style="color: var(--text-secondary); text-align: center; font-size: 0.95rem; margin-bottom: 3rem; max-width: 600px; margin-left: auto; margin-right: auto; opacity: 0.8; line-height: 1.5;">
    Quickly navigate to Savitribai Phule Pune University previous year question papers by choosing your branch and subject catalog.
  </p>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem;">
`;

    const yearOrder = ['first', 'second', 'third', 'fourth'];
    yearOrder.forEach(yearKey => {
      const yearVal = grouped[yearKey];
      if (!yearVal) return;

      directoryHtml += `
    <div style="background: rgba(255, 255, 255, 0.01); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 16px; padding: 1.8rem; backdrop-filter: blur(10px); display: flex; flex-direction: column;" class="directory-card">
      <h3 style="font-family: 'Syne', sans-serif; font-size: 1.25rem; font-weight: 700; color: var(--accent); margin-top: 0; margin-bottom: 1.2rem; border-bottom: 2px solid rgba(99, 102, 241, 0.2); padding-bottom: 0.5rem;">${yearVal.label}</h3>
      <div style="display: flex; flex-direction: column; gap: 1.2rem; flex-grow: 1;">
`;

      for (const [brKey, subjectsSet] of Object.entries(yearVal.branches)) {
        const branchUrl = brKey === 'FE'
          ? `/catalog/${yearKey}`
          : `/catalog/${yearKey}/${encodeURIComponent(brKey)}`;

        directoryHtml += `
        <details style="border: none; margin-bottom: 0.5rem;" class="directory-branch-details">
          <summary style="display: inline-flex; align-items: center; gap: 6px; background: rgba(99, 102, 241, 0.1); color: var(--accent); padding: 0.4rem 0.8rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.6rem; cursor: pointer; list-style: none; outline: none; user-select: none; width: max-content;" class="directory-branch-link">
            <span style="font-size: 0.95rem;">📁</span> SPPU ${brKey} <span class="details-arrow">▼</span>
          </summary>
          <ul style="list-style: none; padding: 0 0 0.5rem 0.5rem; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; border-left: 1px solid var(--border); margin-left: 0.8rem; animation: slideFadeDown 0.25s ease-out;">
`;

        Array.from(subjectsSet).sort().forEach(sub => {
          const subUrl = brKey === 'FE'
            ? `/catalog/${yearKey}/${encodeURIComponent(sub)}`
            : `/catalog/${yearKey}/${encodeURIComponent(brKey)}/${encodeURIComponent(sub)}`;
          directoryHtml += `
            <li style="margin: 0; padding: 0;">
              <a href="${subUrl}" style="display: flex; align-items: flex-start; gap: 8px; color: var(--text-secondary); text-decoration: none; font-size: 0.85rem; padding: 0.2rem 0.4rem; border-radius: 4px;" class="directory-subject-link">
                <span style="opacity: 0.6; margin-top: 2px;">📄</span>
                <span style="line-height: 1.4;">${sub}</span>
              </a>
            </li>
`;
        });

        directoryHtml += `
          </ul>
        </details>
`;
      }

      directoryHtml += `
      </div>
    </div>
`;
    });

    directoryHtml += `
  </div>
</div>
`;
    return directoryHtml;
  } catch (dirErr) {
    console.error('Directory generation error:', dirErr);
    return '';
  }
}

// ── Root SEO Route ────────────────────────────────────────────────────────────
app.get('/', ensureDbConnected, async (req, res) => {
  try {
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const directoryHtml = await generateSeoDirectory();
    html = html.replace('<div id="seo-links-directory"></div>', directoryHtml);
    res.send(html);
  } catch (err) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── SEO Files ─────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /

Sitemap: https://sppupyq.vercel.app/sitemap.xml`);
});

app.get('/sitemap.xml', ensureDbConnected, async (req, res) => {
  try {
    const File = require('./models/File');
    const files = await File.find({ contentType: 'regular' }, 'year branch subject').lean();

    // Create a set of unique URLs
    const urls = new Set();
    urls.add('https://sppupyq.vercel.app/');
    urls.add('https://sppupyq.vercel.app/student-login.html');

    // Add Year page catalogs
    ['first', 'second', 'third', 'fourth'].forEach(y => {
      urls.add(`https://sppupyq.vercel.app/catalog/${y}`);
    });

    files.forEach(f => {
      if (f.year) {
        if (f.year === 'first') {
          if (f.subject) {
            urls.add(`https://sppupyq.vercel.app/catalog/first/${encodeURIComponent(f.subject)}`);
          }
        } else if (f.branch) {
          urls.add(`https://sppupyq.vercel.app/catalog/${f.year}/${encodeURIComponent(f.branch)}`);
          if (f.subject) {
            urls.add(`https://sppupyq.vercel.app/catalog/${f.year}/${encodeURIComponent(f.branch)}/${encodeURIComponent(f.subject)}`);
          }
        }
      }
    });

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(urls).map(url => `  <url>
    <loc>${url.replace(/&/g, '&amp;')}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${url.includes('catalog') ? '0.8' : '1.0'}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.header('Content-Type', 'text/xml');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(sitemap.trim());
  } catch (err) {
    console.error('Sitemap generation error:', err);
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://sppupyq.vercel.app/</loc>
    <lastmod>2026-06-14</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
    res.header('Content-Type', 'text/xml');
    res.send(sitemap.trim());
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));
app.use('/api', ensureDbConnected, require('./routes/api'));
app.use('/admin', ensureDbConnected, require('./routes/admin'));
app.use('/student', ensureDbConnected, require('./routes/student'));



// ── Catalog SEO Dynamic Meta Injection ────────────────────────────────────────
app.get('/catalog/:year/:branch?/:subject?', ensureDbConnected, async (req, res) => {
  const { year, branch, subject } = req.params;

  let title = "SPPU PYQ 2024 Pattern — Pune University Engineering Question Papers | SYNAPSE";
  let description = "Download SPPU Engineering Previous Year Question Papers (PYQs) for 2024 Pattern. Free access to all branches: Computer, IT, Mechanical, Civil, E&TC, and more.";

  const formattedYear = year.charAt(0).toUpperCase() + year.slice(1);
  const formattedBranch = branch ? decodeURIComponent(branch).replace(/-/g, ' ') : '';
  const formattedSubject = subject ? decodeURIComponent(subject).replace(/-/g, ' ') : '';

  if (subject) {
    title = `${formattedSubject} | ${formattedBranch || 'First Year'} SPPU PYQ Catalog — SYNAPSE`;
    description = `Download Savitribai Phule Pune University (SPPU) Previous Year Question Papers (PYQs) for ${formattedSubject} (${formattedBranch || 'First Year'}). Free PDF downloads.`;
  } else if (branch) {
    title = `${formattedBranch} (${formattedYear} Year) SPPU Engineering PYQs — SYNAPSE`;
    description = `Access Savitribai Phule Pune University (SPPU) Engineering ${formattedBranch} branch previous year question papers for ${formattedYear} Year.`;
  } else if (year) {
    title = `${formattedYear} Year SPPU Engineering PYQs — SYNAPSE`;
    description = `Browse Savitribai Phule Pune University (SPPU) Engineering previous year question papers for ${formattedYear} Year.`;
  }

  // Construct Breadcrumbs
  const breadcrumbList = [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://sppupyq.vercel.app/"
    }
  ];

  if (year) {
    breadcrumbList.push({
      "@type": "ListItem",
      "position": 2,
      "name": `${formattedYear} Year`,
      "item": `https://sppupyq.vercel.app/catalog/${year}`
    });
  }

  if (branch) {
    breadcrumbList.push({
      "@type": "ListItem",
      "position": 3,
      "name": formattedBranch,
      "item": `https://sppupyq.vercel.app/catalog/${year}/${encodeURIComponent(branch)}`
    });
  }

  if (subject) {
    const pos = branch ? 4 : 3;
    const urlPath = branch
      ? `https://sppupyq.vercel.app/catalog/${year}/${encodeURIComponent(branch)}/${encodeURIComponent(subject)}`
      : `https://sppupyq.vercel.app/catalog/${year}/${encodeURIComponent(subject)}`;
    breadcrumbList.push({
      "@type": "ListItem",
      "position": pos,
      "name": formattedSubject,
      "item": urlPath
    });
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbList
  };

  // Construct FAQ Schema
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `How to download SPPU ${formattedSubject || formattedBranch || formattedYear + ' Year'} Previous Year Question Papers (PYQs)?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `You can download Savitribai Phule Pune University (SPPU) engineering previous year question papers (PYQs) for ${formattedSubject || formattedBranch || formattedYear + ' Year'} in PDF format for free on SYNAPSE. Simply browse the catalog to find In-Sem and End-Sem papers.`
        }
      },
      {
        "@type": "Question",
        "name": `Are ${formattedSubject || 'SPPU engineering'} papers updated for the 2024 Pattern?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `Yes, we host the latest 2024 Pattern SPPU question papers for ${formattedSubject || 'all classes and branches'}, as well as legacy 2019 Pattern papers for comprehensive revision.`
        }
      }
    ]
  };

  // Query files from DB
  let files = [];
  try {
    const File = require('./models/File');
    const query = { contentType: 'regular' };
    if (year) query.year = year;
    if (branch && branch !== 'FE') query.branch = formattedBranch;
    if (subject) query.subject = formattedSubject;

    files = await File.find(query).sort({ uploadDate: -1 }).lean();
  } catch (dbErr) {
    console.error('Failed to fetch files for SEO container:', dbErr);
  }

  try {
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

    // Replace Meta Tags dynamically
    html = html.replace(/<title>[^<]+<\/title>/g, `<title>${title}</title>`);
    html = html.replace(/<meta name="title" content="[^"]+"/g, `<meta name="title" content="${title}"`);
    html = html.replace(/<meta name="description" content="[^"]+"/g, `<meta name="description" content="${description}"`);
    html = html.replace(/<meta property="og:title" content="[^"]+"/g, `<meta property="og:title" content="${title}"`);
    html = html.replace(/<meta property="og:description" content="[^"]+"/g, `<meta property="og:description" content="${description}"`);
    html = html.replace(/<meta property="twitter:title" content="[^"]+"/g, `<meta property="twitter:title" content="${title}"`);
    html = html.replace(/<meta property="twitter:description" content="[^"]+"/g, `<meta property="twitter:description" content="${description}"`);
    html = html.replace(/<link rel="canonical" href="[^"]+"/g, `<link rel="canonical" href="https://sppupyq.vercel.app${req.originalUrl}"`);

    // Inject Breadcrumb Schema & FAQ Schema
    const schemaScript = `
  <script type="application/ld+json">
  ${JSON.stringify(breadcrumbSchema, null, 2)}
  </script>
  <script type="application/ld+json">
  ${JSON.stringify(faqSchema, null, 2)}
  </script>
</head>`;
    html = html.replace('</head>', schemaScript);

    // Inject dynamic HTML crawler content
    const listHtml = files.length > 0
      ? `<ul>\n      ${files.map(f => `<li><a href="/api/download/${f._id}">${f.originalName || f.subject}</a> - ${f.subject} (${f.pattern} Pattern, ${f.branch || 'First Year'})</li>`).join('\n      ')}\n    </ul>`
      : `<p>No papers uploaded yet for this catalog section.</p>`;

    const seoIntroText = subject 
      ? `Download Savitribai Phule Pune University (SPPU) Previous Year Question Papers (PYQs) for ${formattedSubject} (${formattedBranch || 'First Year'}). Access free PDF downloads for 2024 Pattern and 2019 Pattern Insem & Endsem exams.`
      : `Browse all Pune University (SPPU) Engineering Previous Year Question Papers for ${formattedBranch || formattedYear + ' Year'}. Download branch-wise question papers.`;

    const crawlerContent = `
  <div id="seo-crawler-content" style="display:none;">
    <h1>SPPU ${formattedSubject || formattedBranch || formattedYear + ' Year'} Previous Year Question Papers (PYQ)</h1>
    <h2>Savitribai Phule Pune University Exam Papers PDF Download</h2>
    <p>${seoIntroText}</p>
    ${listHtml}
  </div>
`;
    html = html.replace('<div id="seo-crawler-content" style="display:none;"></div>', crawlerContent);

    // Inject dynamic SEO footer directory links
    const directoryHtml = await generateSeoDirectory();
    html = html.replace('<div id="seo-links-directory"></div>', directoryHtml);

    res.send(html);
  } catch (err) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

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
