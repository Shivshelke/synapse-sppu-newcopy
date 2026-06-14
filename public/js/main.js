/**
 * public/js/main.js
 * Public portal — browse, search, download files.
 */

// ── PWA Service Worker Registration ──────────────────────────────────────────
let deferredPrompt;
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW Registered'))
      .catch(err => console.log('SW Reg failed', err));
  });
}

// Handle PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.style.display = 'block';
    installBtn.addEventListener('click', async () => {
      installBtn.style.display = 'none';
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      deferredPrompt = null;
    });
  }
});

// ── Mobile Menu ──────────────────────────────────────────────────────────────
function toggleMobileMenu() {
  const nav = document.getElementById('navLinks');
  const btn = document.getElementById('hamburger');
  nav.classList.toggle('mobile-open');
  btn.classList.toggle('open');
}
function closeMobileMenu() {
  document.getElementById('navLinks').classList.remove('mobile-open');
  document.getElementById('hamburger').classList.remove('open');
}

let CONFIG = {};
let currentYear = null;
let currentBranch = null;
let allFiles = [];
let allKeywords = [];
let currentUsername = null;

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  // Load Stats independently
  fetch('/api/stats')
    .then(r => r.json())
    .then(stats => {
      document.getElementById('statTotal').textContent = stats.total || 0;
      if (document.getElementById('count-first')) document.getElementById('count-first').textContent = `${stats.byYear.first || 0} papers`;
      if (document.getElementById('count-second')) document.getElementById('count-second').textContent = `${stats.byYear.second || 0} papers`;
      if (document.getElementById('count-third')) document.getElementById('count-third').textContent = `${stats.byYear.third || 0} papers`;
      if (document.getElementById('count-fourth')) document.getElementById('count-fourth').textContent = `${stats.byYear.fourth || 0} papers`;
    })
    .catch(e => console.error('Stats load error', e));

  // Load Auth independently
  fetch('/student/status')
    .then(r => r.json())
    .then(authData => {
      currentUsername = authData.username || null;
      if (authData.loggedIn) {
        const nav = document.getElementById('studentAuthNav');
        if (nav) {
          nav.innerHTML = `
            <span style="color:var(--text); font-weight:600; font-size:0.9rem;">Hi, ${escHtml(authData.username)}</span>
            <button class="btn-ghost" onclick="doStudentLogout()" style="padding:0.4rem 0.8rem; font-size:0.85rem">Logout</button>
          `;
        }
        const welcome = document.getElementById('premiumWelcomeText');
        if (welcome) welcome.textContent = `Welcome to Premium, ${escHtml(authData.username)}!`;
        isLoggedIn = true;
        isPremiumUser = authData.isPremium || false;
        window.userPremiumStatus = authData.premiumStatus || 'none';
        togglePremiumState();

        const fbNameInput = document.getElementById('fbName');
        if (fbNameInput) fbNameInput.value = authData.username;
      } else {
        isLoggedIn = false;
        isPremiumUser = false;
        togglePremiumState();
      }
    })
    .catch(e => console.error('Auth load error', e));

  // Load Config
  try {
    const configRes = await fetch('/api/config');
    CONFIG = await configRes.json();
    populateKeywords();
    await handleUrlRouting();
  } catch (e) { console.error('Config load error', e); }
}

let isRouting = false;

async function handleUrlRouting() {
  if (isRouting) return;
  isRouting = true;

  try {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean); // e.g. ["catalog", "second", "Computer-Engineering", "Discrete-Mathematics"]
    
    if (parts[0] === 'catalog') {
      const year = parts[1];
      const validYears = ['first', 'second', 'third', 'fourth'];
      if (!validYears.includes(year)) {
        isRouting = false;
        return;
      }

      // Load Year
      selectYear(year);

      if (year === 'first') {
        const subject = parts[2];
        if (subject) {
          const decodedSubject = decodeURIComponent(subject);
          await selectSubject(decodedSubject);
        }
      } else {
        const branch = parts[2];
        const subject = parts[3];
        if (branch) {
          const decodedBranch = decodeURIComponent(branch);
          await selectBranch(decodedBranch, CONFIG[year]);
          if (subject) {
            const decodedSubject = decodeURIComponent(subject);
            await selectSubject(decodedSubject);
          }
        }
      }
    }
  } catch (e) {
    console.error('Routing error:', e);
  } finally {
    isRouting = false;
  }
}
window.addEventListener('popstate', handleUrlRouting);

function populateKeywords() {
  const suggestions = new Set();
  Object.values(CONFIG).forEach(yearData => {
    if (yearData.branches) yearData.branches.forEach(b => suggestions.add(b));
    if (yearData.subjects) {
      if (Array.isArray(yearData.subjects)) {
        yearData.subjects.forEach(s => suggestions.add(s));
      } else if (typeof yearData.subjects === 'object') {
        Object.values(yearData.subjects).forEach(val => {
          if (Array.isArray(val)) {
            val.forEach(s => suggestions.add(s));
          } else if (typeof val === 'object' && val !== null) {
            Object.values(val).forEach(list => {
              if (Array.isArray(list)) {
                list.forEach(s => suggestions.add(s));
              }
            });
          }
        });
      }
    }
  });
  allKeywords = Array.from(suggestions).sort();
}

// ── Year selection ────────────────────────────────────────────────────────────
function selectYear(year) {
  currentYear = year;
  currentBranch = null;

  if (!isRouting) {
    history.pushState(null, '', `/catalog/${year}`);
  }

  const yearData = CONFIG[year];
  if (!yearData) return;

  const panel = document.getElementById('browserPanel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  document.getElementById('panelTitle').textContent = yearData.label;

  // Reset steps
  document.getElementById('branchStep').style.display = 'block';
  document.getElementById('subjectStep').style.display = 'none';
  document.getElementById('fileStep').style.display = 'none';

  // Build branch list
  const grid = document.getElementById('branchGrid');
  grid.innerHTML = '';

  if (year === 'first') {
    // 1st year: skip branch, go straight to subjects
    document.getElementById('branchStep').style.display = 'none';
    document.getElementById('subjectStep').style.display = 'block';
    currentBranch = 'FE';
    buildSubjectTags(yearData.subjects);
  } else {
    yearData.branches.forEach(branch => {
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = branch;
      tag.onclick = () => selectBranch(branch, yearData);
      grid.appendChild(tag);
    });
  }
}

// ── Branch selection ──────────────────────────────────────────────────────────
async function selectBranch(branch, yearData) {
  currentBranch = branch;

  if (!isRouting) {
    history.pushState(null, '', `/catalog/${currentYear}/${encodeURIComponent(branch)}`);
  }

  // Highlight selected
  document.querySelectorAll('#branchGrid .tag').forEach(t =>
    t.classList.toggle('active', t.textContent === branch)
  );

  document.getElementById('subjectStep').style.display = 'block';

  // Show skeletons for subjects while loading
  const subjectGrid = document.getElementById('subjectGrid');
  if (subjectGrid) {
    subjectGrid.innerHTML = Array(5).fill(0).map(() => `
      <div class="tag skeleton" style="width: 130px; height: 38px; border-radius: 100px; border: none; opacity: 0.65;"></div>
    `).join('');
  }

  // For 2nd+ year: fetch subjects that actually have files for this branch/year
  const res = await fetch(`/api/files?year=${currentYear}&branch=${encodeURIComponent(branch)}`);
  const files = await res.json();

  // Collect unique subjects with files
  const subjectsWithFiles = [...new Set(files.map(f => f.subject))];
  // Also include configured subjects
  let configSubjects = [];
  if (yearData.subjects) {
    if (Array.isArray(yearData.subjects)) {
      configSubjects = yearData.subjects;
    } else if (typeof yearData.subjects === 'object') {
      configSubjects = yearData.subjects[branch] || [];
    }
  }

  if (currentYear === 'first') {
    const allSubjects = [...new Set([...configSubjects, ...subjectsWithFiles])];
    buildSubjectTags(allSubjects.length ? allSubjects : subjectsWithFiles, false);
  } else {
    // Group subjects by pattern: { "2024 Pattern": [...], "2019 Pattern": [...] }
    const subjectsByPattern = {
      "2024 Pattern": [],
      "2019 Pattern": []
    };

    if (configSubjects) {
      if (Array.isArray(configSubjects)) {
        configSubjects.forEach(s => {
          if (s.toLowerCase().includes('2019')) {
            subjectsByPattern["2019 Pattern"].push(s);
          } else {
            subjectsByPattern["2024 Pattern"].push(s);
          }
        });
      } else if (typeof configSubjects === 'object') {
        if (configSubjects["2024 Pattern"]) {
          subjectsByPattern["2024 Pattern"] = [...configSubjects["2024 Pattern"]];
        }
        if (configSubjects["2019 Pattern"]) {
          subjectsByPattern["2019 Pattern"] = [...configSubjects["2019 Pattern"]];
        }
      }
    }

    // Add subjects with files
    files.forEach(f => {
      const patName = (f.pattern === '2019') ? '2019 Pattern' : '2024 Pattern';
      if (!subjectsByPattern[patName]) {
        subjectsByPattern[patName] = [];
      }
      if (!subjectsByPattern[patName].includes(f.subject)) {
        const otherPat = (patName === '2019 Pattern') ? '2024 Pattern' : '2019 Pattern';
        if (!subjectsByPattern[otherPat] || !subjectsByPattern[otherPat].includes(f.subject)) {
          subjectsByPattern[patName].push(f.subject);
        }
      }
    });

    buildSubjectTags(subjectsByPattern, true);
  }
}

function buildSubjectTags(subjects, isGrouped = false) {
  const grid = document.getElementById('subjectGrid');
  grid.innerHTML = '';

  if (!subjects) {
    grid.innerHTML = '<div class="empty-state small"><span class="empty-icon">📭</span>No subjects available yet.</div>';
    return;
  }

  if (!isGrouped) {
    if (!subjects.length) {
      grid.innerHTML = '<div class="empty-state small"><span class="empty-icon">📭</span>No subjects available yet.</div>';
      return;
    }
    subjects.forEach(subject => {
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = subject;
      tag.onclick = () => selectSubject(subject);
      grid.appendChild(tag);
    });
  } else {
    const patterns = Object.entries(subjects);
    const hasAnySubjects = patterns.some(([_, list]) => list && list.length > 0);
    if (!hasAnySubjects) {
      grid.innerHTML = '<div class="empty-state small"><span class="empty-icon">📭</span>No subjects available yet.</div>';
      return;
    }

    patterns.forEach(([patternName, list]) => {
      if (!list || !list.length) return;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'pattern-group';
      groupDiv.style.width = '100%';
      groupDiv.style.marginBottom = '1.5rem';

      const header = document.createElement('h4');
      header.textContent = patternName;
      header.className = 'pattern-header';
      header.style.fontSize = '1.1rem';
      header.style.color = 'var(--accent)';
      header.style.marginBottom = '0.8rem';
      header.style.fontWeight = '700';
      header.style.borderBottom = '1px solid var(--border)';
      header.style.paddingBottom = '0.3rem';
      groupDiv.appendChild(header);

      const tagsContainer = document.createElement('div');
      tagsContainer.style.display = 'flex';
      tagsContainer.style.flexWrap = 'wrap';
      tagsContainer.style.gap = '0.6rem';

      list.forEach(subject => {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.textContent = subject;
        tag.onclick = () => selectSubject(subject, patternName.split(' ')[0]);
        tagsContainer.appendChild(tag);
      });

      groupDiv.appendChild(tagsContainer);
      grid.appendChild(groupDiv);
    });
  }
}

// ── Subject selection ─────────────────────────────────────────────────────────
async function selectSubject(subject, pattern) {
  if (!isRouting) {
    if (currentYear === 'first') {
      history.pushState(null, '', `/catalog/${currentYear}/${encodeURIComponent(subject)}`);
    } else {
      history.pushState(null, '', `/catalog/${currentYear}/${encodeURIComponent(currentBranch)}/${encodeURIComponent(subject)}`);
    }
  }

  document.querySelectorAll('#subjectGrid .tag').forEach(t =>
    t.classList.toggle('active', t.textContent === subject)
  );

  document.getElementById('fileStep').style.display = 'block';
  document.getElementById('fileStepLabel').textContent = `Papers for: ${subject}`;

  const params = new URLSearchParams({ year: currentYear, subject });
  if (currentBranch && currentBranch !== 'FE') params.append('branch', currentBranch);
  if (pattern) params.append('pattern', pattern);

  try {
    // Show skeletons
    const grid = document.getElementById('fileGrid');
    grid.innerHTML = Array(4).fill(0).map(() => `
      <div class="file-card skeleton-card" style="border-color:transparent">
        <div class="skeleton-icon skeleton"></div>
        <div class="file-info">
          <div class="skeleton-text skeleton"></div>
          <div class="skeleton-text short skeleton"></div>
        </div>
        <div class="skeleton-btn skeleton"></div>
      </div>
    `).join('');

    const res = await fetch(`/api/files?${params}`);
    let files = await res.json();

    // Fallback: if no files found and we filtered by pattern, try without pattern filter
    if ((!files || files.length === 0) && pattern) {
      const fallbackParams = new URLSearchParams({ year: currentYear, subject });
      if (currentBranch && currentBranch !== 'FE') fallbackParams.append('branch', currentBranch);
      const fallbackRes = await fetch(`/api/files?${fallbackParams}`);
      const fallbackFiles = await fallbackRes.json();
      if (fallbackFiles && fallbackFiles.length > 0) {
        files = fallbackFiles;
      }
    }

    allFiles = files;
    renderFileGrid(files, 'fileGrid');
  } catch (e) {
    document.getElementById('fileGrid').innerHTML = '<div class="empty-state">Failed to load files.</div>';
  }
}

// ── Render file cards ──────────────────────────────────────────────────────────
function renderFileGrid(files, gridId) {
  const grid = document.getElementById(gridId);
  if (!files.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-icon">📭</span>
        No papers available yet. Check back soon!
      </div>`;
    return;
  }

  grid.innerHTML = files.map((f, i) => {
    const isGdLink = f.publicId && f.publicId.startsWith('google-drive');
    const downloadBtn = isGdLink 
      ? `<a class="btn-download" href="/api/download/${f._id}" target="_blank" title="Open PDF in Google Drive">↗ Open Link</a>`
      : `<a class="btn-download" href="/api/download/${f._id}" download="${escHtml(f.originalName || f.subject + '.pdf')}" title="Download PDF">↓ Download</a>`;

    return `
      <div class="file-card fade-in-card" style="animation-delay: ${i * 0.05}s">
        <div class="file-icon">📄</div>
        <div class="file-info">
          <div class="file-name" title="${escHtml(f.originalName)}">${escHtml(f.originalName)}</div>
          <div class="file-meta">${escHtml(f.subject)} · ${formatSize(f.size)}</div>
          <div class="file-meta">${formatDate(f.uploadDate)}</div>
        </div>
        <div class="file-actions">
          ${downloadBtn}
        </div>
      </div>
    `;
  }).join('');
}

// ── Local filter ──────────────────────────────────────────────────────────────
function filterLocal(q) {
  if (!q) { renderFileGrid(allFiles, 'fileGrid'); return; }
  const filtered = allFiles.filter(f =>
    f.originalName.toLowerCase().includes(q.toLowerCase()) ||
    f.subject.toLowerCase().includes(q.toLowerCase())
  );
  renderFileGrid(filtered, 'fileGrid');
}

// ── Global search / Autocomplete ───────────────────────────────────────────────
window.showSuggestions = function (q) {
  const dropdown = document.getElementById('searchSuggestions');
  if (!dropdown) return;
  if (!q.trim()) { dropdown.style.display = 'none'; return; }

  const qLower = q.toLowerCase();
  let matches = allKeywords.filter(k => k.toLowerCase().includes(qLower));

  if (matches.length === 0) { dropdown.style.display = 'none'; return; }

  dropdown.innerHTML = matches.slice(0, 8).map(m => {
    const safeJs = escHtml(m).replace(/'/g, "\\'");
    return `<div class="suggestion-item" onclick="selectSuggestion('${safeJs}')">${escHtml(m)}</div>`;
  }).join('');
  dropdown.style.display = 'block';
};

window.hideSuggestions = function () {
  const dropdown = document.getElementById('searchSuggestions');
  if (dropdown) dropdown.style.display = 'none';
};

window.selectSuggestion = function (val) {
  document.getElementById('globalSearch').value = val;
  hideSuggestions();
  doGlobalSearch();
};

async function doGlobalSearch() {
  hideSuggestions();
  const q = document.getElementById('globalSearch').value.trim();
  if (!q) return;

  document.getElementById('years').style.display = 'none';
  document.getElementById('browserPanel').style.display = 'none';
  document.getElementById('searchResults').style.display = 'block';
  document.getElementById('searchResults').scrollIntoView({ behavior: 'smooth' });

  const grid = document.getElementById('searchGrid');
  grid.innerHTML = Array(4).fill(0).map(() => `
      <div class="file-card skeleton-card" style="border-color:transparent">
        <div class="skeleton-icon skeleton"></div>
        <div class="file-info">
          <div class="skeleton-text skeleton"></div>
          <div class="skeleton-text short skeleton"></div>
        </div>
        <div class="skeleton-btn skeleton"></div>
      </div>
    `).join('');

  try {
    const res = await fetch(`/api/files?search=${encodeURIComponent(q)}`);
    const files = await res.json();
    renderFileGrid(files, 'searchGrid');
  } catch (e) {
    grid.innerHTML = '<div class="empty-state">Search failed. Try again.</div>';
  }
}

function clearSearch() {
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('years').style.display = 'block';
  document.getElementById('globalSearch').value = '';
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goBack() {
  if (document.getElementById('fileStep').style.display !== 'none') {
    document.getElementById('fileStep').style.display = 'none';
    document.querySelectorAll('#subjectGrid .tag').forEach(t => t.classList.remove('active'));
    if (!isRouting) {
      if (currentYear === 'first') {
        history.pushState(null, '', `/catalog/${currentYear}`);
      } else {
        history.pushState(null, '', `/catalog/${currentYear}/${encodeURIComponent(currentBranch)}`);
      }
    }
    return;
  }
  if (document.getElementById('subjectStep').style.display !== 'none' && currentYear !== 'first') {
    document.getElementById('subjectStep').style.display = 'none';
    document.querySelectorAll('#branchGrid .tag').forEach(t => t.classList.remove('active'));
    if (!isRouting) {
      history.pushState(null, '', `/catalog/${currentYear}`);
    }
    return;
  }
  document.getElementById('browserPanel').style.display = 'none';
  currentYear = null; currentBranch = null;
  if (!isRouting) {
    history.pushState(null, '', `/`);
  }
  document.getElementById('years').scrollIntoView({ behavior: 'smooth' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Feedback ──────────────────────────────────────────────────────────────────
async function submitFeedback() {
  const nameInput = document.getElementById('fbName');
  const msgInput = document.getElementById('fbMessage');
  const btn = document.getElementById('fbBtn');

  const name = nameInput.value.trim();
  const message = msgInput.value.trim();

  if (!message) { showFbAlert('Please enter a message.', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, message })
    });
    const data = await res.json();

    if (data.success) {
      showFbAlert('Message sent! Thank you for your feedback.', 'success');
      // Only clear name if not logged in
      if (isLoggedIn && currentUsername) {
        nameInput.value = currentUsername;
      } else {
        nameInput.value = '';
      }
      msgInput.value = '';
    } else {
      showFbAlert(data.error || 'Failed to send feedback.', 'error');
    }
  } catch (e) {
    showFbAlert('Network error. Try again later.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Feedback';
  }
}

function showFbAlert(msg, type) {
  const el = document.getElementById('feedbackAlert');
  el.textContent = msg;
  el.className = `alert ${type}`;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => el.style.display = 'none', 5000);
}

// ── Enter key for search ──────────────────────────────────────────────────────
document.getElementById('globalSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') doGlobalSearch();
});

// ── Premium Logic ─────────────────────────────────────────────────────────────
let isPremiumUser = false;
let isLoggedIn = false;

window.checkPremiumLogin = function () {
  if (!isLoggedIn) {
    window.location.href = '/student-login.html';
  }
};

window.buyPremium = async function () {
  const btn = document.getElementById('buyPremiumBtn');
  if (btn) {
    btn.textContent = 'Processing...';
    btn.disabled = true;
  }

  try {
    const res = await fetch('/student/buy-premium', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      init();
    } else {
      alert(data.error || 'Failed to buy premium.');
    }
  } catch (e) {
    alert('Network error during purchase.');
  } finally {
    if (btn) {
      btn.textContent = 'Buy Premium Now ✨';
      btn.disabled = false;
    }
  }
};

window.doStudentLogout = async function () {
  await fetch('/student/logout', { method: 'POST' });
  window.location.reload();
};

function togglePremiumState() {
  const loggedOut = document.getElementById('loggedOutState');
  const free = document.getElementById('freeState');
  const unlocked = document.getElementById('unlockedState');
  const buyBtn = document.getElementById('buyPremiumBtn');

  if (!loggedOut || !free || !unlocked) return;

  loggedOut.classList.remove('show', 'active');
  free.classList.remove('show', 'active');
  unlocked.classList.remove('show', 'active');

  setTimeout(() => {
    let target;
    if (!isLoggedIn) {
      target = loggedOut;
    } else if (window.userPremiumStatus === 'pending') {
      target = free;
      if (buyBtn) {
        buyBtn.innerHTML = '<span style="display:flex; align-items:center; gap:8px;">⏳ Request Pending Approval...</span>';
        buyBtn.disabled = true;
        buyBtn.style.opacity = '0.7';
        buyBtn.style.cursor = 'not-allowed';
        buyBtn.style.background = 'var(--muted)';
      }
    } else if (!isPremiumUser) {
      target = free;
      if (buyBtn) {
        buyBtn.textContent = 'Buy Premium Now ✨';
        buyBtn.disabled = false;
        buyBtn.style.opacity = '1';
        buyBtn.style.cursor = 'pointer';
        buyBtn.style.background = ''; // reset to default
      }
    } else {
      target = unlocked;
    }

    target.classList.add('active');
    void target.offsetWidth;
    target.classList.add('show');
  }, 300);
}

// ── Premium Modal Logic ───────────────────────────────────────────────────────
async function openPremiumModal(type) {
  const modal = document.getElementById('premiumModal');
  const title = document.getElementById('prmModalTitle');
  const desc = document.getElementById('prmModalDesc');
  const icon = document.getElementById('prmModalIcon');
  const list = document.getElementById('prmModalList');

  // Set meta
  if (type === 'solved-pyq') {
    title.textContent = 'Solved PYQs';
    desc.textContent = 'Select a subject to view step-by-step solutions curated by our top educators and previous year toppers.';
    icon.textContent = '📄';
  } else if (type === 'notes') {
    title.textContent = 'Handwritten Notes';
    desc.textContent = "Access high-quality topper's notes organized by units and chapters.";
    icon.textContent = '📝';
  } else if (type === 'practice') {
    title.textContent = 'Practice Bank';
    desc.textContent = 'Topic-wise expected questions for exams.';
    icon.textContent = '🎯';
  }

  list.innerHTML = '<li><span>Loading...</span></li>';
  if (modal) modal.classList.add('show');

  try {
    const res = await fetch(`/api/premium-files?type=${type}`);
    const files = await res.json();

    if (files.length === 0) {
      list.innerHTML = '<li><span style="color:var(--muted)">No files available yet.</span></li>';
    } else {
      list.innerHTML = files.map(f => {
        const isGdLink = f.publicId && f.publicId.startsWith('google-drive');
        const actionBtn = isPremiumUser
          ? (isGdLink
              ? `<a href="/api/download/${f._id}" target="_blank" class="modal-list-btn" style="text-decoration:none;">↗ Open Link</a>`
              : `<a href="/api/download/${f._id}" class="modal-list-btn" style="text-decoration:none;">↓ Download</a>`
            )
          : `<button onclick="showPreview('${f._id}')" class="modal-list-btn" style="background:var(--accent); color:white;">🔍 Preview</button>`;

        return `
          <li>
            <div>
              <span style="display:block">${escHtml(f.subject)}</span>
              <small style="color:var(--muted)">${escHtml(f.originalName)} · ${formatSize(f.size)}</small>
            </div>
            <div style="display:flex; gap:8px;">
              ${actionBtn}
            </div>
          </li>
        `;
      }).join('');
    }
  } catch (e) {
    list.innerHTML = '<li><span style="color:var(--danger)">Failed to load.</span></li>';
  }
}

async function showPreview(fileId) {
  const modal = document.getElementById('previewOverlay');
  const img = document.getElementById('previewImage');
  const loader = document.getElementById('previewLoader');

  if (!modal || !img || !loader) return;

  modal.classList.add('show');
  img.style.display = 'none';
  loader.style.display = 'block';

  try {
    const res = await fetch(`/api/preview/${fileId}`);
    const data = await res.json();
    if (data.previewUrl) {
      img.src = data.previewUrl;
      img.onload = () => {
        loader.style.display = 'none';
        img.style.display = 'block';
      };
    } else {
      alert('Could not load preview.');
      closePreview();
    }
  } catch (e) {
    alert('Error loading preview.');
    closePreview();
  }
}

function closePreview() {
  const modal = document.getElementById('previewOverlay');
  if (modal) modal.classList.remove('show');
  const img = document.getElementById('previewImage');
  if (img) img.src = ''; // Clear src
}

function closePremiumModal(e) {
  if (e && e.target && e.target !== e.currentTarget && !e.target.classList.contains('close-btn')) return;
  const modal = document.getElementById('premiumModal');
  if (modal) modal.classList.remove('show');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePremiumModal();
});

// Drag & drop visual on the whole body (just nice to have)
document.addEventListener('DOMContentLoaded', init);

// ── Chatbot Logic ─────────────────────────────────────────────────────────────
function toggleChat() {
  const chatWidget = document.getElementById('chatWidget');
  const chatBody = document.getElementById('chatBody');
  if (chatBody.style.display === 'none') {
    chatBody.style.display = 'flex';
    chatWidget.classList.add('open');
    document.getElementById('chatInput').focus();
  } else {
    chatBody.style.display = 'none';
    chatWidget.classList.remove('open');
  }
}

function handleChatKeypress(event) {
  if (event.key === 'Enter') {
    sendChatMessage();
  }
}

function addMessageToChat(text, type) {
  const messagesContainer = document.getElementById('chatMessages');
  if (!messagesContainer) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${type}-message`;

  const now = new Date();
  const timeStr = now.getHours() + ':' + now.getMinutes().toString().padStart(2, '0');

  msgDiv.innerHTML = `
    <div class="message-content">${text}</div>
    <div class="message-time">${timeStr}</div>
  `;

  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showChatLoading() {
  const messagesContainer = document.getElementById('chatMessages');
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'chat-loading';
  loadingDiv.id = 'chatLoading';
  loadingDiv.innerHTML = '<div class="chat-dot"></div><div class="chat-dot"></div><div class="chat-dot"></div>';
  messagesContainer.appendChild(loadingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideChatLoading() {
  const loadingDiv = document.getElementById('chatLoading');
  if (loadingDiv) loadingDiv.remove();
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  // 1. Add User Message
  addMessageToChat(text, 'user');
  input.value = '';
  input.disabled = true;

  // 2. Show Loading
  showChatLoading();

  // 3. Send to Backend
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    const data = await res.json();
    hideChatLoading();

    // 4. Add Bot Message
    if (data.reply) {
      addMessageToChat(data.reply, 'bot');
    } else {
      addMessageToChat('Sorry, I am having trouble connecting right now.', 'bot');
    }
  } catch (e) {
    console.error('Chat error:', e);
    hideChatLoading();
    addMessageToChat('Network error. Please try again.', 'bot');
  } finally {
    input.disabled = false;
    input.focus();
  }
}
