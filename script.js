/*
  CloudShare - Frontend-only demo UI
  - Drag/drop multi-upload
  - Simulated progress
  - localStorage persistence
  - Download works for small files by storing content; larger files show a message.
*/

(() => {
  'use strict';

  const STORAGE_KEYS = {
    files: 'fsui.files',
    downloads: 'fsui.downloads',
    theme: 'fsui.theme',
  };

  const CONFIG = {
    // UI limits
    maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB
    // Store content only up to this limit for realistic download in a pure frontend demo
    storeContentLimitBytes: 1.5 * 1024 * 1024, // 1.5 MB
    allowed: {
      images: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
      documents: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
      ],
      pdf: ['application/pdf'],
      text: ['text/plain', 'text/markdown'],
      archives: [
        'application/zip',
        'application/x-zip-compressed',
        'application/x-tar',
        'application/gzip',
        'application/vnd.rar',
      ],
      videos: ['video/mp4', 'video/webm', 'video/quicktime'],
      audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4'],
    },

    pageSize: 8,
  };

  // DOM
  const els = {
    themeToggle: document.getElementById('themeToggle'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    mobileMenu: document.getElementById('mobileMenu'),
    dropzone: document.getElementById('dropzone'),
    filePicker: document.getElementById('filePicker'),
    startUploadBtn: document.getElementById('startUploadBtn'),
    clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    selectedFilesList: document.getElementById('selectedFilesList'),

    maxSizeLabel: document.getElementById('maxSizeLabel'),
    allowedTypesLabel: document.getElementById('allowedTypesLabel'),
    contentNote: document.getElementById('contentNote'),

    selectedFiles: null,

    filesGrid: document.getElementById('filesGrid'),
    searchInput: document.getElementById('searchInput'),
    typeFilter: document.getElementById('typeFilter'),
    resetFiltersBtn: document.getElementById('resetFiltersBtn'),
    downloadsStatus: document.getElementById('downloadsStatus'),

    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    paginationInfo: document.getElementById('paginationInfo'),

    toastRegion: document.getElementById('toastRegion'),

    // stats
    statTotalFiles: document.getElementById('statTotalFiles'),
    statTotalDownloads: document.getElementById('statTotalDownloads'),
    statStorage: document.getElementById('statStorage'),

    dashTotalUploads: document.getElementById('dashTotalUploads'),
    dashTotalDownloads: document.getElementById('dashTotalDownloads'),
    dashStorageUsage: document.getElementById('dashStorageUsage'),

    recentUploads: document.getElementById('recentUploads'),
    recentUploadsPreview: document.getElementById('recentUploadsPreview'),

    loadMockBtn: document.getElementById('loadMockBtn'),
  };

  // State
  let uploadSelection = []; // {file, status, progress, error}
  let uiState = {
    search: '',
    filter: 'all',
    page: 1,
  };

  /** Load from localStorage */
  function loadFiles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.files);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveFiles(files) {
    localStorage.setItem(STORAGE_KEYS.files, JSON.stringify(files));
  }

  function loadDownloads() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.downloads);
      return raw ? JSON.parse(raw) : { total: 0 };
    } catch {
      return { total: 0 };
    }
  }

  function saveDownloads(downloads) {
    localStorage.setItem(STORAGE_KEYS.downloads, JSON.stringify(downloads));
  }

  const mimeToGroup = (mime) => {
    if (!mime) return 'other';
    const groups = Object.keys(CONFIG.allowed);
    for (const g of groups) {
      if (CONFIG.allowed[g].includes(mime)) return g;
    }
    return 'other';
  };

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '0 B';
    const thresh = 1024;
    if (bytes < thresh) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let u = -1;
    let val = bytes;
    do {
      val /= thresh;
      u++;
    } while (val >= thresh && u < units.length - 1);
    return `${val.toFixed(val >= 10 || u === 0 ? 1 : 2)} ${units[u]}`;
  }

  function formatMB(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function iconForGroup(group) {
    const map = {
      images: '🖼️',
      documents: '📄',
      pdf: '📕',
      text: '📝',
      archives: '🗜️',
      videos: '🎬',
      audio: '🎵',
      other: '📦',
    };
    return map[group] ?? map.other;
  }

  function genId() {
    return `f_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  function allowedTypesLabel() {
    const parts = [];
    for (const [group, mimes] of Object.entries(CONFIG.allowed)) {
      const name = group === 'documents' ? 'docs' : group;
      parts.push(name);
    }
    return parts.join(', ');
  }

  function allowedMimeList() {
    return Object.values(CONFIG.allowed).flat();
  }

  function toast(type, title, text) {
    const t = document.createElement('div');
    t.className = 'toast';

    const ico = document.createElement('div');
    ico.className = 'toast-ico';
    ico.textContent = type === 'success' ? '✅' : type === 'error' ? '⚠️' : type === 'info' ? 'ℹ️' : '💡';

    const body = document.createElement('div');
    body.className = 'toast-body';

    const tt = document.createElement('div');
    tt.className = 'toast-title';
    tt.textContent = title;

    const tx = document.createElement('div');
    tx.className = 'toast-text';
    tx.textContent = text;

    const close = document.createElement('button');
    close.className = 'toast-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close notification');
    close.innerHTML = '&times;';

    close.addEventListener('click', () => t.remove());

    body.appendChild(tt);
    body.appendChild(tx);

    t.appendChild(ico);
    t.appendChild(body);
    t.appendChild(close);

    els.toastRegion.appendChild(t);
    setTimeout(() => {
      if (t.isConnected) t.remove();
    }, 4200);
  }

  function validateFile(file) {
    const max = CONFIG.maxFileSizeBytes;
    if (file.size > max) {
      return { ok: false, error: `File too large. Max is ${formatBytes(max)}.` };
    }

    const allowedMimes = allowedMimeList();
    const mime = file.type;

    // Some files may have empty type; in that case we reject to stay safe.
    if (!mime || !allowedMimes.includes(mime)) {
      return { ok: false, error: `File type not allowed. (${mime || 'unknown'})` };
    }

    return { ok: true };
  }

  function renderSelection() {
    els.selectedFilesList.innerHTML = '';

    if (!uploadSelection.length) {
      els.selectedFilesList.innerHTML = `
        <div class="upload-row" style="text-align:center; color: var(--muted);">
          No files selected.
        </div>
      `;
      return;
    }

    for (const item of uploadSelection) {
      const row = document.createElement('div');
      row.className = 'upload-row';

      const top = document.createElement('div');
      top.className = 'upload-row-top';

      const left = document.createElement('div');
      left.innerHTML = `
        <div class="file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
        <div class="file-sub">${escapeHtml(item.file.type || 'unknown')} • ${escapeHtml(formatBytes(item.file.size))}</div>
      `;

      const right = document.createElement('div');
      right.className = 'row-right';

      const badge = document.createElement('div');
      badge.className = 'badge ' + badgeClass(item);
      badge.textContent = badgeText(item);

      right.appendChild(badge);

      top.appendChild(left);
      top.appendChild(right);

      const progWrap = document.createElement('div');
      progWrap.className = 'progress';

      const prog = document.createElement('span');
      prog.style.width = `${Math.max(0, Math.min(100, item.progress))}%`;

      progWrap.appendChild(prog);

      if (item.status === 'error') {
        const err = document.createElement('div');
        err.style.color = 'rgba(255,77,109,.95)';
        err.style.fontWeight = '800';
        err.style.fontSize = '12px';
        err.style.marginTop = '8px';
        err.textContent = item.error || 'Upload failed.';
        row.appendChild(top);
        row.appendChild(progWrap);
        row.appendChild(err);
      } else {
        row.appendChild(top);
        row.appendChild(progWrap);
      }

      els.selectedFilesList.appendChild(row);
    }
  }

  function badgeClass(item) {
    if (item.status === 'uploaded') return 'success';
    if (item.status === 'uploading') return 'uploading';
    if (item.status === 'error') return 'error';
    return 'queued';
  }

  function badgeText(item) {
    if (item.status === 'uploaded') return 'Uploaded';
    if (item.status === 'uploading') return `Uploading (${Math.round(item.progress)}%)`;
    if (item.status === 'error') return 'Failed';
    return 'Queued';
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '<')
      .replaceAll('>', '>')
      .replaceAll('"', '"')
      .replaceAll("'", '&#039;');
  }

  async function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('File read failed'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  async function startUpload() {
    if (!uploadSelection.length) {
      toast('info', 'No files selected', 'Choose files before uploading.');
      return;
    }

    const files = loadFiles();
    const downloads = loadDownloads();

    let anyToUpload = false;

    for (const item of uploadSelection) {
      if (item.status !== 'queued') continue;
      anyToUpload = true;

      item.status = 'uploading';
      item.progress = 0;
      renderSelection();

      // Simulated progress
      await new Promise((resolve) => {
        const startedAt = Date.now();
        const duration = 1100 + Math.random() * 900;
        const timer = setInterval(() => {
          const t = Date.now() - startedAt;
          const p = Math.min(1, t / duration);
          item.progress = p * 100;
          renderSelection();
          if (p >= 1) {
            clearInterval(timer);
            resolve();
          }
        }, 70);
      });

      // Validate again (type/size)
      const v = validateFile(item.file);
      if (!v.ok) {
        item.status = 'error';
        item.error = v.error;
        item.progress = 100;
        renderSelection();
        toast('error', 'Upload failed', `${item.file.name}: ${v.error}`);
        continue;
      }

      // Save metadata + optionally content for download
      const group = mimeToGroup(item.file.type);
      const uploadedAt = new Date().toISOString();

      const entry = {
        id: genId(),
        name: item.file.name,
        size: item.file.size,
        type: item.file.type,
        group,
        uploadedAt,
        downloads: 0,
        lastDownloadedAt: null,
        // content is optional for this demo
        content: null,
      };

      try {
        if (item.file.size <= CONFIG.storeContentLimitBytes) {
          entry.content = await readFileAsDataURL(item.file);
        }
      } catch {
        // Keep content null; allow download later only for supported size.
      }

      files.unshift(entry);
      item.status = 'uploaded';
      item.progress = 100;
      renderSelection();
    }

    if (anyToUpload) {
      saveFiles(files);
      saveDownloads(downloads); // downloads total is updated on download
      toast('success', 'Upload complete', 'Your files are now available in Downloads.');
      renderAll();
    }
  }

  function addFilesFromInput(fileList) {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;

    for (const file of arr) {
      const v = validateFile(file);
      uploadSelection.push({
        file,
        status: v.ok ? 'queued' : 'error',
        progress: v.ok ? 0 : 100,
        error: v.ok ? null : v.error,
      });
    }

    renderSelection();
  }

  function clearSelection() {
    uploadSelection = [];
    renderSelection();
  }

  function filterFiles(files) {
    const q = (uiState.search || '').trim().toLowerCase();
    const f = uiState.filter;

    return files.filter((x) => {
      const nameOk = !q || x.name.toLowerCase().includes(q);
      const typeOk = f === 'all' || x.group === f || (f === 'documents' && x.group === 'documents');
      return nameOk && typeOk;
    });
  }

  function renderFileCard(entry) {
    const card = document.createElement('div');
    card.className = 'file-card';

    const icon = document.createElement('div');
    icon.className = 'file-icon';
    icon.textContent = iconForGroup(entry.group);

    const main = document.createElement('div');
    main.className = 'file-main';

    main.innerHTML = `
      <div class="file-title" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</div>
      <div class="file-meta">
        <span>${escapeHtml(formatBytes(entry.size))}</span>
        <span>•</span>
        <span>Uploaded ${timeAgo(entry.uploadedAt)}</span>
      </div>

      <div class="file-actions">
        <button class="btn btn-small btn-primary" type="button" data-action="download" data-id="${escapeHtml(entry.id)}">
          ⬇️ Download
        </button>
        <button class="btn btn-small btn-danger" type="button" data-action="delete" data-id="${escapeHtml(entry.id)}">
          🗑️ Delete
        </button>
      </div>

      ${entry.content ? '' : `<div style="margin-top:8px; color: var(--muted); font-weight:800; font-size:12px;">Backend required for large file downloads</div>`}
    `;

    card.appendChild(icon);
    card.appendChild(main);
    return card;
  }

  function timeAgo(iso) {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - t);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function updateStats(files) {
    const downloads = loadDownloads();
    const totalFiles = files.length;
    const totalDownloads = downloads.total || 0;
    const storageBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

    els.statTotalFiles.textContent = `${totalFiles}`;
    els.statTotalDownloads.textContent = `${totalDownloads}`;
    els.statStorage.textContent = formatMB(storageBytes);

    els.dashTotalUploads.textContent = `${totalFiles}`;
    els.dashTotalDownloads.textContent = `${totalDownloads}`;
    els.dashStorageUsage.textContent = formatMB(storageBytes);
  }

  function renderRecent(files) {
    const recent = [...files].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 5);

    els.recentUploads.innerHTML = '';
    els.recentUploadsPreview.innerHTML = '';

    if (!recent.length) {
      const empty = document.createElement('div');
      empty.style.color = 'var(--muted)';
      empty.style.fontWeight = '800';
      empty.style.fontSize = '13px';
      empty.style.padding = '10px';
      empty.textContent = 'No uploads yet.';
      els.recentUploads.appendChild(empty);

      const empty2 = document.createElement('div');
      empty2.className = 'small-upload';
      empty2.style.marginTop = '12px';
      empty2.innerHTML = `<div class="small-upload-name">No recent files</div><div class="small-upload-meta">Upload to see activity</div>`;
      els.recentUploadsPreview.appendChild(empty2);
      return;
    }

    for (const f of recent) {
      const row = document.createElement('div');
      row.className = 'recent-row';
      row.innerHTML = `
        <div class="recent-row-name">${escapeHtml(f.name)}</div>
        <div class="recent-row-meta">${escapeHtml(timeAgo(f.uploadedAt))}</div>
      `;
      els.recentUploads.appendChild(row);

      const small = document.createElement('div');
      small.className = 'small-upload';
      small.innerHTML = `
        <div>
          <div class="small-upload-name">${escapeHtml(f.name)}</div>
          <div class="small-upload-meta">${escapeHtml(formatBytes(f.size))}</div>
        </div>
        <div style="font-size:18px; opacity:.9" aria-hidden="true">${iconForGroup(f.group)}</div>
      `;
      els.recentUploadsPreview.appendChild(small);
    }
  }

  function renderDownloads() {
    const allFiles = loadFiles();
    const filtered = filterFiles(allFiles);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));
    uiState.page = Math.min(uiState.page, totalPages);

    const start = (uiState.page - 1) * CONFIG.pageSize;
    const end = start + CONFIG.pageSize;
    const pageItems = filtered.slice(start, end);

    els.downloadsStatus.textContent = total
      ? `Showing ${start + 1}–${Math.min(end, total)} of ${total} file(s)`
      : 'No files match your filters.';

    els.filesGrid.innerHTML = '';

    if (!pageItems.length) {
      const empty = document.createElement('div');
      empty.className = 'file-card';
      empty.style.gridTemplateColumns = 'auto 1fr';
      empty.innerHTML = `
        <div class="file-icon" aria-hidden="true">📂</div>
        <div class="file-main">
          <div class="file-title">Nothing to show</div>
          <div class="file-meta">Try uploading files or adjusting search/filter.</div>
        </div>
      `;
      els.filesGrid.appendChild(empty);
    } else {
      for (const entry of pageItems) {
        els.filesGrid.appendChild(renderFileCard(entry));
      }
    }

    els.paginationInfo.textContent = `Page ${uiState.page} / ${totalPages}`;
    els.prevPageBtn.disabled = uiState.page <= 1;
    els.nextPageBtn.disabled = uiState.page >= totalPages;

    // Wire card actions
    els.filesGrid.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        if (!id) return;

        if (action === 'download') {
          await downloadFileById(id);
        } else if (action === 'delete') {
          deleteFileById(id);
        }
      });
    });
  }

  function renderAll() {
    const files = loadFiles();
    updateStats(files);
    renderRecent(files);
    renderDownloads();
  }

  async function downloadFileById(id) {
    const files = loadFiles();
    const entry = files.find((x) => x.id === id);
    if (!entry) return;

    if (!entry.content) {
      toast('info', 'Download not available', 'This file is larger than the demo limit. Connect a backend to enable real downloads.');
      return;
    }

    try {
      const res = await fetch(entry.content);
      const blob = await res.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Update stats
      const downloads = loadDownloads();
      downloads.total = (downloads.total || 0) + 1;
      saveDownloads(downloads);

      entry.downloads = (entry.downloads || 0) + 1;
      entry.lastDownloadedAt = new Date().toISOString();

      saveFiles(files);

      toast('success', 'Download started', `${entry.name}`);
      renderAll();
    } catch {
      toast('error', 'Download failed', 'Could not download this file from the browser cache.');
    }
  }

  function deleteFileById(id) {
    const files = loadFiles();
    const entry = files.find((x) => x.id === id);
    if (!entry) return;

    const next = files.filter((x) => x.id !== id);
    saveFiles(next);
    toast('success', 'File deleted', entry.name);

    // Keep downloads.total unchanged (represents app-level total)
    renderAll();
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (systemDark ? 'dark' : 'light');
    setTheme(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(STORAGE_KEYS.theme, next);
    toast('info', 'Theme updated', next === 'dark' ? 'Dark mode enabled' : 'Light mode enabled');
  }

  function setupNav() {
    // Mobile menu
    els.mobileMenuBtn?.addEventListener('click', () => {
      const isHidden = els.mobileMenu.hasAttribute('hidden');
      if (isHidden) {
        els.mobileMenu.removeAttribute('hidden');
      } else {
        els.mobileMenu.setAttribute('hidden', '');
      }
    });

    els.mobileMenu?.querySelectorAll('[data-mobile-close]').forEach((a) => {
      a.addEventListener('click', () => {
        els.mobileMenu.setAttribute('hidden', '');
      });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!els.mobileMenuBtn || !els.mobileMenu) return;
      const menuOpen = !els.mobileMenu.hasAttribute('hidden');
      if (!menuOpen) return;
      const target = e.target;
      const inside = target instanceof Node && els.mobileMenu.contains(target);
      const btnInside = target instanceof Node && els.mobileMenuBtn.contains(target);
      if (!inside && !btnInside) els.mobileMenu.setAttribute('hidden', '');
    });
  }

  function setupDropzone() {
    const dz = els.dropzone;

    dz.addEventListener('click', () => els.filePicker.click());
    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') els.filePicker.click();
    });

    const onDragOver = (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    };
    const onDragLeave = () => dz.classList.remove('dragover');
    const onDrop = (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      addFilesFromInput(e.dataTransfer.files);
    };

    dz.addEventListener('dragover', onDragOver);
    dz.addEventListener('dragleave', onDragLeave);
    dz.addEventListener('drop', onDrop);

    els.filePicker.addEventListener('change', (e) => {
      addFilesFromInput(e.target.files);
      // Allow selecting the same file again later
      els.filePicker.value = '';
    });
  }

  function setupUploadControls() {
    els.startUploadBtn.addEventListener('click', startUpload);
    els.clearSelectionBtn.addEventListener('click', clearSelection);
  }

  function setupToolbar() {
    els.searchInput.addEventListener('input', () => {
      uiState.search = els.searchInput.value;
      uiState.page = 1;
      renderDownloads();
    });

    els.typeFilter.addEventListener('change', () => {
      uiState.filter = els.typeFilter.value;
      uiState.page = 1;
      renderDownloads();
    });

    els.resetFiltersBtn.addEventListener('click', () => {
      els.searchInput.value = '';
      els.typeFilter.value = 'all';
      uiState.search = '';
      uiState.filter = 'all';
      uiState.page = 1;
      renderDownloads();
    });

    els.prevPageBtn.addEventListener('click', () => {
      uiState.page = Math.max(1, uiState.page - 1);
      renderDownloads();
    });

    els.nextPageBtn.addEventListener('click', () => {
      uiState.page = uiState.page + 1;
      renderDownloads();
    });
  }

  function loadMockData() {
    const existing = loadFiles();
    if (existing.length) {
      toast('info', 'Mock data already present', 'Delete your current files to load mock data again.');
      return;
    }

    // Create small mock content entries (text-only base64)
    const now = Date.now();

    const makeTextDataURL = (text) => {
      const blob = new Blob([text], { type: 'text/plain' });
      return new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.readAsDataURL(blob);
      });
    };

    (async () => {
      const files = [];
      files.push({
        id: genId(),
        name: 'welcome.txt',
        size: 1200,
        type: 'text/plain',
        group: 'text',
        uploadedAt: new Date(now - 1000 * 60 * 15).toISOString(),
        downloads: 2,
        lastDownloadedAt: new Date(now - 1000 * 60 * 3).toISOString(),
        content: await makeTextDataURL('Welcome to CloudShare!\n\nThis is a frontend-only demo.\n'),
      });

      files.push({
        id: genId(),
        name: 'project-notes.md',
        size: 2200,
        type: 'text/markdown',
        group: 'text',
        uploadedAt: new Date(now - 1000 * 60 * 50).toISOString(),
        downloads: 1,
        lastDownloadedAt: new Date(now - 1000 * 60 * 40).toISOString(),
        content: await makeTextDataURL('# Project Notes\n- Upload\n- Search\n- Download\n'),
      });

      files.push({
        id: genId(),
        name: 'mock-report.pdf',
        size: 3.2 * 1024 * 1024,
        type: 'application/pdf',
        group: 'pdf',
        uploadedAt: new Date(now - 1000 * 60 * 120).toISOString(),
        downloads: 0,
        lastDownloadedAt: null,
        // large demo file: no content
        content: null,
      });

      files.push({
        id: genId(),
        name: 'sample-archive.zip',
        size: 2.0 * 1024 * 1024,
        type: 'application/zip',
        group: 'archives',
        uploadedAt: new Date(now - 1000 * 60 * 240).toISOString(),
        downloads: 0,
        lastDownloadedAt: null,
        content: null,
      });

      saveFiles(files);

      const downloads = loadDownloads();
      downloads.total = files.reduce((sum, f) => sum + (f.downloads || 0), 0);
      saveDownloads(downloads);

      toast('success', 'Mock data loaded', 'Use Search/Filter and try Download/Delete.');
      renderAll();
    })();
  }

  function initLabels() {
    els.maxSizeLabel.textContent = formatBytes(CONFIG.maxFileSizeBytes);
    els.allowedTypesLabel.textContent = allowedTypesLabel();

    // contentNote
    els.contentNote.innerHTML = `Small files (≤ ${formatBytes(CONFIG.storeContentLimitBytes)}) can be downloaded in this demo. Larger ones need a backend.`;
  }

  // Init
  function init() {
    initTheme();
    initLabels();
    setupNav();
    setupDropzone();
    setupUploadControls();
    setupToolbar();

    els.themeToggle.addEventListener('click', toggleTheme);

    els.loadMockBtn.addEventListener('click', loadMockData);

    clearSelection();
    renderAll();
  }

  init();
})();

