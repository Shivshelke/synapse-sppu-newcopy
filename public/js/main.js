/**
 * public/js/main.js
 * Public portal — browse, search, download files.
 */

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

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const [configRes, statsRes, authRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/stats'),
      fetch('/student/status')
    ]);
    CONFIG = await configRes.json();
    const stats = await statsRes.json();
    const authData = await authRes.json();

    // Update hero stats
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('count-first').textContent  = `${stats.byYear.first  || 0} papers`;
    document.getElementById('count-second').textContent = `${stats.byYear.second || 0} papers`;
    document.getElementById('count-third').textContent  = `${stats.byYear.third  || 0} papers`;
    document.getElementById('count-fourth').textContent = `${stats.byYear.fourth || 0} papers`;

    // Handle Auth Data
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
      togglePremiumState();
    } else {
      isLoggedIn = false;
      isPremiumUser = false;
      togglePremiumState();
    }

    // Populate search keywords
    populateKeywords();
  } catch(e) { console.error('Init error', e); }
}

function populateKeywords() {
  const suggestions = new Set();
  Object.values(CONFIG).forEach(yearData => {
    if (yearData.branches) yearData.branches.forEach(b => suggestions.add(b));
    if (yearData.subjects) yearData.subjects.forEach(s => suggestions.add(s));
  });
  allKeywords = Array.from(suggestions).sort();
}

// ── Year selection ────────────────────────────────────────────────────────────
function selectYear(year) {
  currentYear = year;
  currentBranch = null;

  const yearData = CONFIG[year];
  if (!yearData) return;

  const panel = document.getElementById('browserPanel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  document.getElementById('panelTitle').textContent = yearData.label;

  // Reset steps
  document.getElementById('branchStep').style.display  = 'block';
  document.getElementById('subjectStep').style.display = 'none';
  document.getElementById('fileStep').style.display    = 'none';

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

  // Highlight selected
  document.querySelectorAll('#branchGrid .tag').forEach(t =>
    t.classList.toggle('active', t.textContent === branch)
  );

  document.getElementById('subjectStep').style.display = 'block';

  // For 2nd+ year: fetch subjects that actually have files for this branch/year
  const res = await fetch(`/api/files?year=${currentYear}&branch=${encodeURIComponent(branch)}`);
  const files = await res.json();

  // Collect unique subjects with files
  const subjectsWithFiles = [...new Set(files.map(f => f.subject))];
  // Also include configured subjects
  const configSubjects = yearData.subjects || [];
  const allSubjects = [...new Set([...configSubjects, ...subjectsWithFiles])];

  buildSubjectTags(allSubjects.length ? allSubjects : subjectsWithFiles);
}

function buildSubjectTags(subjects) {
  const grid = document.getElementById('subjectGrid');
  grid.innerHTML = '';

  if (!subjects || !subjects.length) {
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
}

// ── Subject selection ─────────────────────────────────────────────────────────
async function selectSubject(subject) {
  document.querySelectorAll('#subjectGrid .tag').forEach(t =>
    t.classList.toggle('active', t.textContent === subject)
  );

  document.getElementById('fileStep').style.display = 'block';
  document.getElementById('fileStepLabel').textContent = `Papers for: ${subject}`;

  const params = new URLSearchParams({ year: currentYear, subject });
  if (currentBranch && currentBranch !== 'FE') params.append('branch', currentBranch);

  try {
    const res = await fetch(`/api/files?${params}`);
    const files = await res.json();
    allFiles = files;
    renderFileGrid(files, 'fileGrid');
  } catch(e) {
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

  grid.innerHTML = files.map(f => `
    <div class="file-card">
      <div class="file-icon">📄</div>
      <div class="file-info">
        <div class="file-name" title="${escHtml(f.originalName)}">${escHtml(f.originalName)}</div>
        <div class="file-meta">${escHtml(f.subject)} · ${formatSize(f.size)}</div>
        <div class="file-meta">${formatDate(f.uploadDate)}</div>
      </div>
      <div class="file-actions">
        <a class="btn-view" href="/api/view/${f._id}" target="_blank" title="View PDF">👁 View</a>
        <a class="btn-download" href="/api/download/${f._id}" download="${escHtml(f.originalName || f.subject + '.pdf')}" title="Download PDF">↓ Download</a>
      </div>
    </div>
  `).join('');
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
window.showSuggestions = function(q) {
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

window.hideSuggestions = function() {
  const dropdown = document.getElementById('searchSuggestions');
  if (dropdown) dropdown.style.display = 'none';
};

window.selectSuggestion = function(val) {
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
  grid.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span>Searching…</div>';

  try {
    const res = await fetch(`/api/files?search=${encodeURIComponent(q)}`);
    const files = await res.json();
    renderFileGrid(files, 'searchGrid');
  } catch(e) {
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
    return;
  }
  if (document.getElementById('subjectStep').style.display !== 'none' && currentYear !== 'first') {
    document.getElementById('subjectStep').style.display = 'none';
    document.querySelectorAll('#branchGrid .tag').forEach(t => t.classList.remove('active'));
    return;
  }
  document.getElementById('browserPanel').style.display = 'none';
  currentYear = null; currentBranch = null;
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
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
      nameInput.value = '';
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

window.checkPremiumLogin = function() {
  if (!isLoggedIn) {
    window.location.href = '/student-login.html';
  }
};

window.buyPremium = async function() {
  const btn = document.getElementById('buyPremiumBtn');
  if(btn) {
    btn.textContent = 'Processing...';
    btn.disabled = true;
  }
  
  try {
    const res = await fetch('/student/buy-premium', { method: 'POST' });
    const data = await res.json();
    if(data.success) {
      alert('Payment Successful! Premium Unlocked. ✨');
      init();
    } else {
      alert(data.error || 'Failed to buy premium.');
    }
  } catch(e) {
    alert('Network error during purchase.');
  } finally {
    if(btn) {
      btn.textContent = 'Buy Premium Now ✨';
      btn.disabled = false;
    }
  }
};

window.doStudentLogout = async function() {
  await fetch('/student/logout', { method: 'POST' });
  window.location.reload();
};

function togglePremiumState() {
  const loggedOut = document.getElementById('loggedOutState');
  const free = document.getElementById('freeState');
  const unlocked = document.getElementById('unlockedState');
  
  if (!loggedOut || !free || !unlocked) return;
  
  loggedOut.classList.remove('show', 'active');
  free.classList.remove('show', 'active');
  unlocked.classList.remove('show', 'active');
  
  setTimeout(() => {
    let target;
    if (!isLoggedIn) {
      target = loggedOut;
    } else if (!isPremiumUser) {
      target = free;
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
      list.innerHTML = files.map(f => `
        <li>
          <div>
            <span style="display:block">${escHtml(f.subject)}</span>
            <small style="color:var(--muted)">${f.originalName} · ${formatSize(f.size)}</small>
          </div>
          <a href="${escHtml(f.url)}" target="_blank" class="modal-list-btn" style="text-decoration:none;">View PDF</a>
        </li>
      `).join('');
    }
  } catch(e) {
    list.innerHTML = '<li><span style="color:var(--danger)">Failed to load.</span></li>';
  }
}

function closePremiumModal(e) {
  // If e is provided, ensure we only close if the overlay background or close button was clicked
  if (e && e.target && e.target !== e.currentTarget) return;
  const modal = document.getElementById('premiumModal');
  if (modal) modal.classList.remove('show');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePremiumModal();
});

// Drag & drop visual on the whole body (just nice to have)
document.addEventListener('DOMContentLoaded', init);
