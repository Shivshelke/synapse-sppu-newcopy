/**
 * public/js/dashboard.js
 * Admin dashboard — upload, manage, delete files.
 */

// ── Auth guard ────────────────────────────────────────────────────────────────
(async () => {
  const res = await fetch('/auth/status');
  const data = await res.json();
  if (!data.loggedIn) window.location.href = '/login.html';
})();

let CONFIG = {};
let deleteTargetId = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadConfig();
  await loadStats();
  await loadRecentFiles();
  await loadAdminFiles();
  await loadCatStructure();
  setupDragDrop();
}

// ── Config ────────────────────────────────────────────────────────────────────
async function loadConfig() {
  const res = await fetch('/api/config');
  CONFIG = await res.json();
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('dTotal').textContent = stats.total;
    document.getElementById('dFirst').textContent = stats.byYear.first || 0;
    document.getElementById('dSecond').textContent = stats.byYear.second || 0;
    document.getElementById('dThird').textContent = stats.byYear.third || 0;
    document.getElementById('dFourth').textContent = stats.byYear.fourth || 0;
    if (document.getElementById('dStudents')) {
      document.getElementById('dStudents').textContent = stats.totalStudents || 0;
    }

    // Sidebar Badges
    const bFeedback = document.getElementById('badge-feedback');
    const bRequests = document.getElementById('badge-requests');

    if (stats.totalFeedback > 0) {
      bFeedback.textContent = stats.totalFeedback;
      bFeedback.style.display = 'inline-block';
    } else {
      bFeedback.style.display = 'none';
    }

    if (stats.pendingPremium > 0) {
      bRequests.textContent = stats.pendingPremium;
      bRequests.style.display = 'inline-block';
    } else {
      bRequests.style.display = 'none';
    }
  } catch (e) {
    console.error('Stats load error:', e);
  }
}

// ── Panel navigation ──────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-panel]').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const panelId = item.dataset.panel;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${panelId}`).classList.add('active');
    document.getElementById('topbarTitle').textContent = item.textContent.trim().replace(/^[^ ]+ /, '');

    // Refresh file list on panel switch
    if (panelId === 'files') loadAdminFiles();
    if (panelId === 'students') window.loadAdminStudents();
    if (panelId === 'requests') window.loadPremiumRequests();
    if (panelId === 'premium') window.loadPremiumAdminFiles();
    if (panelId === 'categories') loadCatStructure();
    if (panelId === 'feedback') {
      loadFeedback();
      markFeedbackAsRead();
    }

    // Close sidebar on mobile
    if (window.innerWidth <= 900) document.getElementById('sidebar').classList.remove('open');
  });
});

async function markFeedbackAsRead() {
  try {
    await fetch('/api/feedback/mark-read', { method: 'POST' });
    const bFeedback = document.getElementById('badge-feedback');
    if (bFeedback) bFeedback.style.display = 'none';
  } catch (e) {
    console.error('Mark read error:', e);
  }
}

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ── Upload form: year → branch ────────────────────────────────────────────────
function onYearChange() {
  const year = document.getElementById('upYear').value;
  const branch = document.getElementById('upBranch');
  const subj = document.getElementById('upSubject');

  branch.innerHTML = '<option value="">— Select Branch —</option>';
  subj.innerHTML = '<option value="">— Select Subject —</option><option value="__custom__">+ Type custom subject…</option>';
  branch.disabled = true;
  subj.disabled = true;

  if (!year || !CONFIG[year]) return;

  const branches = CONFIG[year].branches;
  branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b; opt.textContent = b;
    branch.appendChild(opt);
  });
  branch.disabled = false;
}

function onBranchChange() {
  const year = document.getElementById('upYear').value;
  const subj = document.getElementById('upSubject');

  subj.innerHTML = '<option value="">— Select Subject —</option><option value="__custom__">+ Type custom subject…</option>';
  subj.disabled = true;

  if (!year || !CONFIG[year]) return;

  const subjects = CONFIG[year].subjects || [];
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    subj.appendChild(opt);
  });
  subj.disabled = false;

  subj.addEventListener('change', function () {
    document.getElementById('customSubjectGroup').style.display =
      this.value === '__custom__' ? 'block' : 'none';
  });
}

// ── File pick / drop ──────────────────────────────────────────────────────────
function onFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showUploadAlert('File exceeds 20MB limit.', 'error'); return;
  }
  document.getElementById('dropzone').style.display = 'none';
  document.getElementById('filePreview').style.display = 'flex';
  document.getElementById('fileName').textContent = `${file.name} (${formatSize(file.size)})`;
}

function clearFile() {
  document.getElementById('pdfInput').value = '';
  document.getElementById('dropzone').style.display = 'block';
  document.getElementById('filePreview').style.display = 'none';
  document.getElementById('upCustomFileName').value = '';
}

function setupDragDrop() {
  const zone = document.getElementById('dropzone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      const input = document.getElementById('pdfInput');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      onFileSelect(input);
    }
  });
}

// ── Upload ────────────────────────────────────────────────────────────────────
async function doUpload() {
  const year = document.getElementById('upYear').value;
  const branch = document.getElementById('upBranch').value;
  const subject = document.getElementById('upSubject').value;
  const customSubject = document.getElementById('upCustomSubject').value.trim();
  const customFileName = document.getElementById('upCustomFileName').value.trim();
  const file = document.getElementById('pdfInput').files[0];

  if (!year) { showUploadAlert('Please select a year.', 'error'); return; }
  if (!branch) { showUploadAlert('Please select a branch.', 'error'); return; }
  if (!subject) { showUploadAlert('Please select a subject.', 'error'); return; }
  if (subject === '__custom__' && !customSubject) {
    showUploadAlert('Please enter a custom subject name.', 'error'); return;
  }
  if (!file) { showUploadAlert('Please select a PDF file.', 'error'); return; }

  const btn = document.getElementById('uploadBtn');
  btn.disabled = true; btn.textContent = 'Uploading…';

  const progressWrap = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  progressWrap.style.display = 'block';
  progressFill.style.width = '0%';

  // Simulate progress for UX
  let prog = 0;
  const interval = setInterval(() => {
    prog = Math.min(prog + 8, 85);
    progressFill.style.width = `${prog}%`;
    progressText.textContent = `Uploading… ${prog}%`;
  }, 150);

  const fd = new FormData();
  fd.append('year', year);
  fd.append('branch', branch);
  fd.append('subject', subject === '__custom__' ? customSubject : subject);
  if (subject === '__custom__') fd.append('customSubject', customSubject);
  if (customFileName) fd.append('customFileName', customFileName);
  fd.append('pdf', file);

  try {
    const res = await fetch('/admin/upload', { method: 'POST', body: fd });
    const data = await res.json();
    clearInterval(interval);

    if (data.success) {
      progressFill.style.width = '100%';
      progressText.textContent = 'Upload complete!';
      showUploadAlert('Paper uploaded successfully! ✓', 'success');
      clearFile();
      document.getElementById('upYear').value = '';
      document.getElementById('upBranch').value = '';
      document.getElementById('upSubject').value = '';
      document.getElementById('upCustomFileName').value = '';
      document.getElementById('upBranch').disabled = true;
      document.getElementById('upSubject').disabled = true;
      await loadStats();
      await loadRecentFiles();
    } else {
      showUploadAlert(data.error || 'Upload failed.', 'error');
      progressFill.style.width = '0%';
    }
  } catch (e) {
    clearInterval(interval);
    showUploadAlert('Network error. Please try again.', 'error');
    progressFill.style.width = '0%';
  } finally {
    btn.disabled = false; btn.textContent = 'Upload Paper →';
    setTimeout(() => { progressWrap.style.display = 'none'; }, 2000);
  }
}

function showUploadAlert(msg, type) {
  const el = document.getElementById('uploadAlert');
  el.textContent = msg;
  el.className = `alert ${type}`;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── Recent files ──────────────────────────────────────────────────────────────
async function loadRecentFiles() {
  const res = await fetch('/admin/files');
  const files = await res.json();
  const el = document.getElementById('recentList');

  if (!files.length) {
    el.innerHTML = '<div class="empty-state small">No files uploaded yet</div>';
    return;
  }

  el.innerHTML = files.slice(0, 6).map(f => `
    <div class="recent-item">
      <div class="recent-dot"></div>
      <div>
        <div class="recent-name" title="${escHtml(f.originalName)}">${escHtml(f.originalName)}</div>
        <div class="recent-meta">${escHtml(f.year)} · ${escHtml(f.branch)} · ${formatDate(f.uploadDate)}</div>
      </div>
    </div>
  `).join('');
}

// ── Manage files panel ────────────────────────────────────────────────────────
async function loadAdminFiles() {
  const year = document.getElementById('filterYear').value;
  const search = document.getElementById('filterSearch').value;
  const params = new URLSearchParams();
  if (year) params.append('year', year);
  if (search) params.append('search', search);

  const res = await fetch(`/admin/files?${params}`);
  const files = await res.json();
  const el = document.getElementById('adminFileList');

  if (!files.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📭</span>
        No papers found. Upload some!
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="file-table-wrap">
      <table class="file-table">
        <thead>
          <tr>
            <th>File Name</th>
            <th>Year</th>
            <th>Branch</th>
            <th>Subject</th>
            <th>Size</th>
            <th>Uploaded</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${files.map(f => `
            <tr>
              <td><a href="${escHtml(f.url)}" target="_blank" style="color:var(--accent)">${escHtml(f.originalName)}</a></td>
              <td><span class="badge badge-year">${escHtml(f.year)}</span></td>
              <td><span class="badge badge-branch">${escHtml(f.branch)}</span></td>
              <td>${escHtml(f.subject)}</td>
              <td>${formatSize(f.size)}</td>
              <td>${formatDate(f.uploadDate)}</td>
              <td>
                <button class="btn-del" onclick="openDeleteModal('${escHtml(f._id)}', '${escHtml(f.originalName)}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Delete modal ──────────────────────────────────────────────────────────────
function openDeleteModal(id, name) {
  deleteTargetId = id;
  document.getElementById('deleteModalText').textContent = `Delete "${name}"? This cannot be undone.`;
  document.getElementById('deleteModal').style.display = 'flex';
  document.getElementById('confirmDeleteBtn').onclick = doDelete;
}

function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
  deleteTargetId = null;
}

async function doDelete() {
  if (!deleteTargetId) return;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true; btn.textContent = 'Deleting…';

  try {
    const res = await fetch(`/admin/files/${deleteTargetId}`, { method: 'DELETE' });
    const data = await res.json();
    closeDeleteModal();
    if (data.success) {
      await loadStats();
      await loadAdminFiles();
      await loadRecentFiles();
    } else {
      alert(data.error || 'Delete failed.');
    }
  } catch (e) {
    alert('Network error. Please try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Delete';
  }
}

// ── Feedback ──────────────────────────────────────────────────────────────────
async function loadFeedback() {
  const el = document.getElementById('adminFeedbackList');
  if (!el) return;

  try {
    const res = await fetch('/admin/feedback');
    const list = await res.json();

    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span>No feedback received yet.</div>';
      return;
    }

    el.innerHTML = `<div class="fb-grid">
      ${list.map(f => `
        <div class="fb-card">
          <div class="fb-header">
            <div>
              <div class="fb-name">${escHtml(f.name)}</div>
              <div class="fb-date">${formatDate(f.date)}</div>
            </div>
            <button class="btn-del small" onclick="deleteFeedback('${f._id}')">Delete</button>
          </div>
          <div class="fb-msg">${escHtml(f.message)}</div>
        </div>
      `).join('')}
    </div>`;
  } catch (e) {
    el.innerHTML = '<div class="empty-state">Failed to load feedback.</div>';
  }
}

async function deleteFeedback(id) {
  if (!confirm('Delete this feedback?')) return;
  try {
    const res = await fetch(`/admin/feedback/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadFeedback();
    } else {
      alert(data.error || 'Failed to delete');
    }
  } catch (e) {
    alert('Network error');
  }
}

// ── Categories ────────────────────────────────────────────────────────────────
async function loadCatStructure() {
  const res = await fetch('/api/config');
  const data = await res.json();
  const el = document.getElementById('catStructure');

  el.innerHTML = Object.entries(data).map(([key, yearData]) => `
    <div class="cat-year-block">
      <div class="cat-year-title">${escHtml(yearData.label)}</div>
      <div style="margin-bottom:.4rem;font-size:.78rem;color:var(--muted)">Branches:</div>
      <div class="cat-tag-list" style="margin-bottom:.6rem">
        ${yearData.branches.map(b => `<span class="cat-tag">${escHtml(b)}</span>`).join('')}
      </div>
      ${yearData.subjects.length ? `
        <div style="margin-bottom:.4rem;font-size:.78rem;color:var(--muted)">Subjects:</div>
        <div class="cat-tag-list">
          ${yearData.subjects.map(s => `<span class="cat-tag">${escHtml(s)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

async function addSubject() {
  const year = document.getElementById('catYear').value;
  const subject = document.getElementById('catSubject').value.trim();
  if (!subject) { showCatAlert('Enter a subject name.', 'error'); return; }

  const res = await fetch('/admin/config/subject', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, subject })
  });
  const data = await res.json();
  if (data.success) {
    showCatAlert('Subject added!', 'success');
    document.getElementById('catSubject').value = '';
    await loadCatStructure();
    await loadConfig();
  } else {
    showCatAlert(data.error || 'Failed.', 'error');
  }
}

async function addBranch() {
  const year = document.getElementById('catBYear').value;
  const branch = document.getElementById('catBranch').value.trim();
  if (!branch) { showCatBAlert('Enter a branch name.', 'error'); return; }

  const res = await fetch('/admin/config/branch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, branch })
  });
  const data = await res.json();
  if (data.success) {
    showCatBAlert('Branch added!', 'success');
    document.getElementById('catBranch').value = '';
    await loadCatStructure();
    await loadConfig();
  } else {
    showCatBAlert(data.error || 'Failed.', 'error');
  }
}

function showCatAlert(msg, type) {
  const el = document.getElementById('catAlert');
  el.textContent = msg; el.className = `alert ${type}`; el.style.display = 'block';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 3000);
}
function showCatBAlert(msg, type) {
  const el = document.getElementById('catBAlert');
  el.textContent = msg; el.className = `alert ${type}`; el.style.display = 'block';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ── Password change ───────────────────────────────────────────────────────────
async function doChangePassword() {
  const cur = document.getElementById('pwCurrent').value;
  const nw = document.getElementById('pwNew').value;
  const conf = document.getElementById('pwConfirm').value;
  const el = document.getElementById('pwAlert');

  el.style.display = 'none';

  if (!cur || !nw || !conf) { showPwAlert('All fields are required.', 'error'); return; }
  if (nw !== conf) { showPwAlert('New passwords do not match.', 'error'); return; }
  if (nw.length < 8) { showPwAlert('Password must be at least 8 characters.', 'error'); return; }

  const res = await fetch('/auth/change-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: cur, newPassword: nw })
  });
  const data = await res.json();
  if (data.success) {
    showPwAlert('Password updated successfully! ✓', 'success');
    document.getElementById('pwCurrent').value = '';
    document.getElementById('pwNew').value = '';
    document.getElementById('pwConfirm').value = '';
  } else {
    showPwAlert(data.error || 'Failed to update password.', 'error');
  }
}

function showPwAlert(msg, type) {
  const el = document.getElementById('pwAlert');
  el.textContent = msg; el.className = `alert ${type}`; el.style.display = 'block';
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function doLogout() {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Close modal on background click ──────────────────────────────────────────
document.getElementById('deleteModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeDeleteModal();
});

// ── Premium Upload & Listing ──────────────────────────────────────────────────
window.onPremiumFileSelect = function (input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showPrmAlert('File exceeds 20MB limit.', 'error'); return;
  }
  document.getElementById('prmDropzone').style.display = 'none';
  document.getElementById('prmFilePreview').style.display = 'flex';
  document.getElementById('prmFileNameDisplay').textContent = `${file.name} (${formatSize(file.size)})`;
}

window.clearPremiumFile = function () {
  document.getElementById('prmPdfInput').value = '';
  document.getElementById('prmDropzone').style.display = 'block';
  document.getElementById('prmFilePreview').style.display = 'none';
  document.getElementById('prmCustomName').value = '';
}

window.doPremiumUpload = async function () {
  const type = document.getElementById('prmType').value;
  const year = document.getElementById('prmYear').value;
  const subject = document.getElementById('prmSubject').value.trim();
  const custom = document.getElementById('prmCustomName').value.trim();
  const file = document.getElementById('prmPdfInput').files[0];

  if (!type) { showPrmAlert('Please select a premium type.', 'error'); return; }
  if (!subject) { showPrmAlert('Please enter a subject name.', 'error'); return; }
  if (!file) { showPrmAlert('Please select a PDF file.', 'error'); return; }

  const btn = document.getElementById('prmUploadBtn');
  btn.disabled = true; btn.textContent = 'Uploading…';

  const progressWrap = document.getElementById('prmUploadProgress');
  const progressFill = document.getElementById('prmProgressFill');
  const progressText = document.getElementById('prmProgressText');
  progressWrap.style.display = 'block';
  progressFill.style.width = '0%';

  let prog = 0;
  const interval = setInterval(() => {
    prog = Math.min(prog + 8, 85);
    progressFill.style.width = `${prog}%`;
    progressText.textContent = `Uploading… ${prog}%`;
  }, 150);

  const fd = new FormData();
  fd.append('contentType', type);
  if (year) fd.append('year', year);
  fd.append('subject', subject);
  if (custom) fd.append('customFileName', custom);
  fd.append('pdf', file);

  try {
    const res = await fetch('/admin/upload', { method: 'POST', body: fd });
    const data = await res.json();
    clearInterval(interval);

    if (data.success) {
      progressFill.style.width = '100%';
      progressText.textContent = 'Upload complete!';
      showPrmAlert('Premium content uploaded successfully! ✨', 'success');
      window.clearPremiumFile();
      document.getElementById('prmType').value = '';
      document.getElementById('prmYear').value = '';
      document.getElementById('prmSubject').value = '';

      await window.loadPremiumAdminFiles();
    } else {
      showPrmAlert(data.error || 'Upload failed.', 'error');
      progressFill.style.width = '0%';
    }
  } catch (e) {
    clearInterval(interval);
    showPrmAlert('Network error. Please try again.', 'error');
    progressFill.style.width = '0%';
  } finally {
    btn.disabled = false; btn.textContent = 'Upload Premium File ✨';
    setTimeout(() => { progressWrap.style.display = 'none'; }, 2000);
  }
}

function showPrmAlert(msg, type) {
  const el = document.getElementById('premiumAlert');
  el.textContent = msg; el.className = `alert ${type}`; el.style.display = 'block';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

window.loadPremiumAdminFiles = async function () {
  const el = document.getElementById('premiumAdminFileList');
  if (!el) return;

  try {
    const p1 = fetch('/admin/files?contentType=solved-pyq').then(r => r.json());
    const p2 = fetch('/admin/files?contentType=notes').then(r => r.json());
    const p3 = fetch('/admin/files?contentType=practice').then(r => r.json());

    // We get them separately so we can render them grouped if needed, or just combine
    const [d1, d2, d3] = await Promise.all([p1, p2, p3]);
    const files = [...d1, ...d2, ...d3];
    files.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    if (!files.length) {
      el.innerHTML = '<div class="empty-state small">No premium files found.</div>';
      return;
    }

    el.innerHTML = `
    <div class="file-table-wrap">
      <table class="file-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>File Name</th>
            <th>Subject</th>
            <th>Size</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${files.map(f => {
      let badge = '';
      if (f.contentType === 'solved-pyq') badge = '<span class="badge" style="background:#f59e0b;color:#111">Solved PYQ</span>';
      if (f.contentType === 'notes') badge = '<span class="badge" style="background:#8b5cf6;color:#fff">Notes</span>';
      if (f.contentType === 'practice') badge = '<span class="badge" style="background:#ec4899;color:#fff">Practice</span>';

      return `
            <tr>
              <td>${badge}</td>
              <td><a href="${escHtml(f.url)}" target="_blank" style="color:var(--accent)">${escHtml(f.originalName)}</a></td>
              <td>${escHtml(f.subject)}</td>
              <td>${formatSize(f.size)}</td>
              <td>
                <button class="btn-del small" onclick="openDeleteModal('${escHtml(f._id)}', '${escHtml(f.originalName)}')">Delete</button>
              </td>
            </tr>
            `;
    }).join('')}
        </tbody>
      </table>
    </div>`;
  } catch (e) {
    el.innerHTML = '<div class="empty-state">Error loading premium files.</div>';
  }
}

window.loadAdminStudents = async function () {
  const el = document.getElementById('adminStudentList');
  if (!el) return;

  try {
    const res = await fetch('/admin/students');
    const students = await res.json();

    if (!students || !students.length) {
      el.innerHTML = '<div class="empty-state">No student accounts created yet.</div>';
      return;
    }

    el.innerHTML = `
    <div class="file-table-wrap">
      <table class="file-table">
        <thead>
          <tr>
            <th>Student Username</th>
            <th>Email Addr.</th>
            <th>Premium Status</th>
            <th>Account Registered Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${students.map(s => {
      let premiumBadge = '<span class="badge" style="background:var(--muted); color:#fff">Free</span>';
      if (s.isPremium) premiumBadge = '<span class="badge" style="background:#10b981; color:#fff">Premium ✨</span>';
      else if (s.premiumStatus === 'pending') premiumBadge = '<span class="badge" style="background:#f59e0b; color:#111">Pending ⏳</span>';

      const revokeBtn = s.isPremium 
        ? `<button class="btn-del small" onclick="window.revokePremium('${s._id}')" style="padding: 4px 10px;">Revoke</button>` 
        : '';

      return `
            <tr>
              <td style="font-weight:600; color:var(--text)">@${escHtml(s.username)}</td>
              <td style="color:var(--muted)">${escHtml(s.email)}</td>
              <td>${premiumBadge}</td>
              <td>${formatDate(s.registeredAt)}</td>
              <td>${revokeBtn}</td>
            </tr>
            `;
    }).join('')}
        </tbody>
      </table>
    </div>`;
  } catch (e) {
    el.innerHTML = '<div class="empty-state">Error loading students list.</div>';
  }
}

window.loadPremiumRequests = async function () {
  const el = document.getElementById('premiumRequestList');
  if (!el) return;

  try {
    const res = await fetch('/admin/premium-requests');
    const requests = await res.json();

    if (!requests || !requests.length) {
      el.innerHTML = '<div class="empty-state">No pending premium requests.</div>';
      return;
    }

    el.innerHTML = `
    <div class="file-table-wrap">
      <table class="file-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Requested Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${requests.map(r => `
            <tr>
              <td style="font-weight:600; color:var(--text)">@${escHtml(r.username)}</td>
              <td style="color:var(--muted)">${escHtml(r.email)}</td>
              <td>${formatDate(r.registeredAt)}</td>
              <td>
                <div style="display:flex; gap:0.5rem;">
                  <button class="btn-primary small" onclick="window.approvePremium('${r._id}')" style="background:#10b981; border-color:#10b981; padding: 4px 10px;">Approve</button>
                  <button class="btn-del small" onclick="window.rejectPremium('${r._id}')" style="padding: 4px 10px;">Reject</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
  } catch (e) {
    el.innerHTML = '<div class="empty-state">Error loading requests.</div>';
  }
}

window.approvePremium = async function (id) {
  if (!confirm('Approve this student for Premium access?')) return;
  try {
    const res = await fetch(`/admin/approve-premium/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      window.loadPremiumRequests();
      loadStats();
    } else {
      alert(data.error || 'Failed to approve');
    }
  } catch (e) {
    alert('Network error');
  }
}

window.rejectPremium = async function (id) {
  if (!confirm('Reject this premium request?')) return;
  try {
    const res = await fetch(`/admin/reject-premium/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      window.loadPremiumRequests();
      loadStats();
    } else {
      alert(data.error || 'Failed to reject');
    }
  } catch (e) {
    alert('Network error');
  }
}

window.revokePremium = async function (id) {
  if (!confirm('Are you sure you want to REVOKE premium access for this student?')) return;
  try {
    const res = await fetch(`/admin/revoke-premium/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      window.loadAdminStudents();
      loadStats();
    } else {
      alert(data.error || 'Failed to revoke');
    }
  } catch (e) {
    alert('Network error');
  }
};

// ── Start ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
