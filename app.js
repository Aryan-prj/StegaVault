// app.js — StegaVault Frontend: Full Backend-Integrated Client
// Session tokens managed via sessionStorage (clears on tab/window close)
// All note data stored server-side in SQLite + stego images. No plaintext in localStorage.

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let currentMode   = 'U';        // 'U' = User side, 'A' = Attacker side (pre-login)
let sessionToken  = '';
let sessionMode   = '';         // 'USER' or 'ATTACKER' (from server after login)
let activePassphrase = '';
let editingNoteId = null;       // DB note id currently being edited (integer or null)
let currentFolderFilter = 'All';
let currentTimeFilter   = 'All';
let searchQuery   = '';
let selectedCarrierPath = 'assets/carrier_images/sunset.jpg';
let isProcessing  = false;

// In-memory decrypted note cache (cleared on logout; never persisted to disk)
const inMemoryDecryptedCache = new Map(); // key: note DB id, value: {title, body}

// Folders are stored in localStorage (non-sensitive UI preference only)
function getFolders() {
    return JSON.parse(localStorage.getItem('stegavault_folders') || '["General","Bucket List","Finances","Travel Plans"]');
}
function saveFolders(arr) {
    localStorage.setItem('stegavault_folders', JSON.stringify(arr));
}

// Theme
if (localStorage.getItem('stegavault_theme') === 'dark') {
    document.body.classList.add('dark-mode');
}

// Update Dark Mode button label/icon
function updateThemeButtonState() {
    const isDark = document.body.classList.contains('dark-mode');
    const label = document.getElementById('dark-mode-label');
    const btn = document.getElementById('btn-dark-mode');
    if (label) label.innerText = isDark ? 'Light Mode' : 'Dark Mode';
    if (btn) {
        const svg = btn.querySelector('svg');
        if (svg) {
            svg.innerHTML = isDark 
                ? '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>'
                : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        }
    }
}

// ─── Circular Ripple Dark Mode Toggle ─────────────────────────────────────────
function toggleDarkMode(event) {
    const isCurrentlyDark = document.body.classList.contains('dark-mode');
    const targetDark = !isCurrentlyDark;

    // Coordinate origin from click event (or button center fallback)
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    if (event && (event.clientX || event.clientY)) {
        x = event.clientX;
        y = event.clientY;
    } else {
        const btn = document.getElementById('btn-dark-mode');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.top + rect.height / 2;
        }
    }

    // Modern View Transitions API with circular clipPath expansion
    if (document.startViewTransition) {
        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        const transition = document.startViewTransition(() => {
            if (targetDark) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
            localStorage.setItem('stegavault_theme', targetDark ? 'dark' : 'light');
            updateThemeButtonState();
        });

        transition.ready.then(() => {
            document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${endRadius}px at ${x}px ${y}px)`
                    ]
                },
                {
                    duration: 520,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    pseudoElement: '::view-transition-new(root)'
                }
            );
        }).catch(() => {});
        return;
    }

    // Fallback Ripple Element for browsers without View Transitions
    const ripple = document.createElement('div');
    ripple.className = 'theme-transition-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.backgroundColor = targetDark ? '#121212' : '#fbfbfc';
    document.body.appendChild(ripple);

    requestAnimationFrame(() => {
        ripple.classList.add('animating');
    });

    setTimeout(() => {
        if (targetDark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        localStorage.setItem('stegavault_theme', targetDark ? 'dark' : 'light');
        updateThemeButtonState();
        setTimeout(() => {
            ripple.remove();
        }, 150);
    }, 450);
}

// ─── API Helper ───────────────────────────────────────────────────────────────
async function apiCall(method, path, body = null) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': sessionToken
        }
    };
    if (body !== null) opts.body = JSON.stringify(body);

    let res;
    try {
        res = await fetch(path, opts);
    } catch (err) {
        throw new Error('Network error — is the server running? ' + err.message);
    }

    const data = await res.json();

    if (res.status === 401) {
        // Session expired — kick back to login
        _clearSession();
        showLoginScreen();
        throw new Error('Session expired. Please log in again.');
    }
    if (res.status === 403) {
        throw new Error('ACCESS_DENIED: ' + (data.message || 'Forbidden'));
    }
    return { status: res.status, data };
}

// ─── Mode Selection (Pre-Login Dots) ──────────────────────────────────────────
// setMode is called by the two camouflaged dots BEFORE login.
// It only changes the visual state; it does NOT switch screens post-login.
function setMode(mode) {
    currentMode = mode;
    const btnU = document.getElementById('btn-mode-u');
    const btnA = document.getElementById('btn-mode-a');
    if (btnU) btnU.classList.toggle('active', mode === 'U');
    if (btnA) btnA.classList.toggle('active', mode === 'A');
}

// ─── Password Toggle ──────────────────────────────────────────────────────────
function togglePasswordVisibility() {
    const pwdInput = document.getElementById('password');
    const eyeIcon  = document.getElementById('eye-icon');
    if (!pwdInput) return;

    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        if (eyeIcon) eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>`;
    } else {
        pwdInput.type = 'password';
        if (eyeIcon) eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>`;
    }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login() {
    const email = (document.getElementById('email').value || '').trim();
    const pwd   = (document.getElementById('password').value || '');

    if (!email || !pwd) {
        alert('Please enter your email and password.');
        return;
    }

    // Determine mode from pre-login dot selection
    const mode = (currentMode === 'A') ? 'ATTACKER' : 'USER';

    let res, data;
    try {
        const result = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pwd, mode })
        });
        data = await result.json();
        res = result;
    } catch (err) {
        alert('Cannot reach server. Please make sure the StegaVault server is running.\n\nRun: python server.py');
        return;
    }

    if (!res.ok || data.status !== 'success') {
        alert('Login failed: ' + (data.message || 'Unknown error'));
        return;
    }

    // Store session
    sessionToken = data.token;
    sessionMode  = data.mode;    // 'USER' or 'ATTACKER'
    activePassphrase = pwd;      // Retained in memory only for this session
    sessionStorage.setItem('stegavault_token', sessionToken);
    sessionStorage.setItem('stegavault_mode', sessionMode);
    sessionStorage.setItem('stegavault_passphrase', activePassphrase);

    // Switch screens
    document.getElementById('login-screen').classList.add('hidden');

    if (sessionMode === 'USER') {
        document.getElementById('user-screen').classList.remove('hidden');
        loadCarriersList();
        renderFolders();
        renderUserNotes();
    } else {
        document.getElementById('attacker-screen').classList.remove('hidden');
        renderAttackerGallery();
    }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout() {
    if (sessionToken) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'X-Session-Token': sessionToken }
            });
        } catch (_) {}
    }
    _clearSession();
    showLoginScreen();
}

function _clearSession() {
    sessionToken     = '';
    sessionMode      = '';
    activePassphrase = '';
    editingNoteId    = null;
    inMemoryDecryptedCache.clear();
    sessionStorage.removeItem('stegavault_token');
    sessionStorage.removeItem('stegavault_mode');
    sessionStorage.removeItem('stegavault_passphrase');
}

function showLoginScreen() {
    document.getElementById('user-screen').classList.add('hidden');
    document.getElementById('attacker-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    currentMode = 'U';
    setMode('U');
    resetCreateNote();
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function updateStatusBadge(status) {
    const el = document.getElementById('note-save-status');
    if (!el) return;
    el.className = 'note-status-indicator ' + status.toLowerCase();
    el.innerText = status;
}

// ─── User View Switching ──────────────────────────────────────────────────────
function showUserView(viewId) {
    document.getElementById('view-all-notes').classList.add('hidden');
    document.getElementById('view-create-note').classList.add('hidden');

    if (viewId === 'all-notes') {
        document.getElementById('view-all-notes').classList.remove('hidden');
        if (currentFolderFilter !== 'Bin') {
            document.getElementById('time-filters-container').classList.remove('hidden');
            document.getElementById('bin-actions-container').classList.add('hidden');
        }
        renderUserNotes();
    } else if (viewId === 'create-note') {
        document.getElementById('view-create-note').classList.remove('hidden');
        populateFolderSelect();
        updateStatusBadge('Protected');
    }
}

// ─── Passphrase Modal (Fallback if session passphrase is unavailable) ─────────
function promptPassphraseModal() {
    document.getElementById('first-time-modal').classList.remove('hidden');
    document.getElementById('setup-passphrase').value = '';
}

function submitAuthSetup() {
    const p = document.getElementById('setup-passphrase').value;
    if (!p) { alert('Passphrase cannot be empty.'); return; }
    activePassphrase = p;
    sessionStorage.setItem('stegavault_passphrase', p);
    document.getElementById('first-time-modal').classList.add('hidden');
    renderUserNotes();
}

// ─── Font Size & Color Styling Controls ───────────────────────────────────────
let savedSelectionRange = null;

function saveEditorSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        savedSelectionRange = sel.getRangeAt(0);
    }
}

function restoreEditorSelection() {
    if (savedSelectionRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedSelectionRange);
    }
}

function changeFontSize(sizeStr) {
    if (!sizeStr) return;
    const editor = document.getElementById('note-body');
    if (!editor) return;

    editor.focus();
    restoreEditorSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        // No text highlighted: apply style directly to editor or insert sized span
        document.execCommand('fontSize', false, '7');
        const fontElements = editor.getElementsByTagName('font');
        for (let el of fontElements) {
            if (el.size === '7') {
                el.removeAttribute('size');
                el.style.fontSize = sizeStr;
            }
        }
        return;
    }

    // Wrap highlighted selection inside a span with the exact font-size
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = sizeStr;
    try {
        span.appendChild(range.extractContents());
        range.insertNode(span);
        // Reselect wrapped span
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        sel.addRange(newRange);
    } catch (e) {
        document.execCommand('fontSize', false, '7');
        const fontElements = editor.getElementsByTagName('font');
        for (let el of fontElements) {
            if (el.size === '7') {
                el.removeAttribute('size');
                el.style.fontSize = sizeStr;
            }
        }
    }
}

function changeTextColor(colorHex) {
    if (!colorHex) return;
    const editor = document.getElementById('note-body');
    if (!editor) return;

    // Update color bar visual under the "A" icon
    const indicator = document.getElementById('color-bar-indicator');
    if (indicator) indicator.style.backgroundColor = colorHex;

    editor.focus();
    restoreEditorSelection();

    document.execCommand('foreColor', false, colorHex);
}

// ─── Carrier Selection Modal & Note Save Flow ─────────────────────────────────
function openSaveModal() {
    const title = (document.getElementById('note-title').value || '').trim();
    const body = document.getElementById('note-body').innerHTML.trim();

    if (!title && !body) {
        alert('Please enter a note title or content before saving.');
        return;
    }

    if (!activePassphrase) {
        promptPassphraseModal();
        return;
    }

    loadCarriersList();
    const modal = document.getElementById('carrier-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeCarrierModal() {
    const modal = document.getElementById('carrier-modal');
    if (modal) modal.classList.add('hidden');
}

function confirmSaveNote() {
    closeCarrierModal();
    secureNote();
}

// ─── Carrier Images ───────────────────────────────────────────────────────────
async function loadCarriersList() {
    const container = document.getElementById('carrier-thumbnails');
    if (!container) return;
    container.innerHTML = '';

    // Try server API first
    let carriers = [];
    try {
        const { data } = await apiCall('GET', '/api/carriers/list');
        if (data.carriers && data.carriers.length > 0) {
            carriers = data.carriers.map(c => c.url);
        }
    } catch (_) {}

    // Fallback to known defaults
    if (carriers.length === 0) {
        carriers = [
            'assets/carrier_images/sunset.jpg',
            'assets/carrier_images/mountain.jpg',
            'assets/carrier_images/forest.jpg',
            'assets/carrier_images/city.jpg',
            'assets/carrier_images/abstract.jpg',
            'assets/carrier_images/desert.jpg',
            'assets/carrier_images/ocean.jpg',
            'assets/carrier_images/space.jpg'
        ];
    }

    carriers.forEach((path, idx) => {
        const img = document.createElement('img');
        img.src = path;
        img.className = 'carrier-thumb' + (idx === 0 ? ' selected' : '');
        img.title = path.split('/').pop();
        img.onclick = () => selectCarrier(path, img);
        container.appendChild(img);
    });

    // Default selection
    selectedCarrierPath = carriers[0];
}

function selectCarrier(path, element) {
    selectedCarrierPath = path;
    const nameSpan = document.getElementById('selected-carrier-name');
    if (nameSpan) nameSpan.innerText = path.split('/').pop();
    document.querySelectorAll('.carrier-thumb').forEach(el => el.classList.remove('selected'));
    if (element) element.classList.add('selected');
}

// ─── Folders ──────────────────────────────────────────────────────────────────
function renderFolders() {
    const folders = getFolders();
    const list = document.getElementById('sidebar-folder-list');
    if (!list) return;
    list.innerHTML = '';
    folders.forEach(f => {
        const li = document.createElement('li');
        li.innerText = f;
        li.onclick = () => filterByFolder(f);
        list.appendChild(li);
    });
}

function populateFolderSelect() {
    const folders = getFolders();
    const select = document.getElementById('note-folder');
    if (!select) return;
    select.innerHTML = '';
    folders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.innerText = f;
        select.appendChild(opt);
    });
}

function toggleFolders() {
    const list  = document.getElementById('sidebar-folder-list');
    if (list.style.display === 'none') {
        list.style.display = 'block';
    } else {
        list.style.display = 'none';
    }
}

function createNewFolder() {
    const name = prompt('Enter new folder name:');
    if (name && name.trim()) {
        const folders = getFolders();
        if (!folders.includes(name.trim())) {
            folders.push(name.trim());
            saveFolders(folders);
            renderFolders();
            populateFolderSelect();
        }
    }
}

function filterByFolder(folder) {
    currentFolderFilter = folder;
    const title = document.getElementById('current-view-title');
    if (title) title.innerText = folder + ' Notes';
    document.getElementById('time-filters-container').classList.remove('hidden');
    document.getElementById('bin-actions-container').classList.add('hidden');
    const binBtn = document.getElementById('btn-nav-bin');
    if (binBtn) binBtn.classList.remove('active');
    renderUserNotes();
}

// ─── Bin (Trash) View ─────────────────────────────────────────────────────────
function showBin() {
    currentFolderFilter = 'Bin';
    const title = document.getElementById('current-view-title');
    if (title) title.innerText = 'Bin';
    document.getElementById('time-filters-container').classList.add('hidden');
    document.getElementById('bin-actions-container').classList.remove('hidden');
    const binBtn = document.getElementById('btn-nav-bin');
    if (binBtn) binBtn.classList.add('active');
    showUserView('all-notes');
}

async function emptyBin() {
    if (!confirm('Are you sure you want to permanently delete all items in the Bin? This cannot be undone.')) return;
    try {
        await apiCall('POST', '/api/notes/bin/empty');
        inMemoryDecryptedCache.clear();
        renderUserNotes();
    } catch (err) {
        alert('Could not empty bin: ' + err.message);
    }
}

async function restoreNote(id, event) {
    if (event) event.stopPropagation();
    try {
        await apiCall('POST', '/api/notes/restore', { note_id: id });
        renderUserNotes();
    } catch (err) {
        alert('Could not restore note: ' + err.message);
    }
}

async function permanentlyDeleteNote(id, event) {
    if (event) event.stopPropagation();
    if (!confirm('Permanently delete this note? It will be removed immediately.')) return;
    try {
        await apiCall('DELETE', `/api/notes/${id}?permanent=true`);
        inMemoryDecryptedCache.delete(id);
        renderUserNotes();
    } catch (err) {
        alert('Could not delete note: ' + err.message);
    }
}

function filterSearch() {
    searchQuery = (document.getElementById('search-input').value || '').toLowerCase();
    renderUserNotes();
}

function setTimeFilter(filter, btnElement) {
    currentTimeFilter = filter;
    document.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    renderUserNotes();
}

// ─── Media Toolbar ────────────────────────────────────────────────────────────
function triggerFileInput(acceptType) {
    const uploadInput = document.getElementById('media-upload');
    uploadInput.accept = acceptType;
    uploadInput.click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        let html = '';
        if (file.type.includes('image'))      html = `<img src="${e.target.result}" alt="inserted image" style="max-width:100%; border-radius:8px;"/>`;
        else if (file.type.includes('video')) html = `<video controls src="${e.target.result}" style="max-width:100%; border-radius:8px;"></video>`;
        else if (file.type.includes('audio')) html = `<audio controls src="${e.target.result}"></audio>`;
        document.execCommand('insertHTML', false, html);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

// ─── Render Notes (from Server DB) ───────────────────────────────────────────
async function renderUserNotes() {
    const notesList = document.getElementById('notes-list');
    if (!notesList) return;
    notesList.innerHTML = '<p style="color:var(--text-light); margin-top:2rem;">Loading notes…</p>';

    let notes = [];
    try {
        const { data } = await apiCall('GET', '/api/notes');
        notes = data.notes || [];
    } catch (err) {
        notesList.innerHTML = `<p style="color:var(--accent-danger,#c0392b); margin-top:2rem;">${err.message}</p>`;
        return;
    }

    // Client-side filters (folder, bin, search)
    const binNotes = notes.filter(n => n.archived);
    const activeNotes = notes.filter(n => !n.archived);

    // Update bin count badge
    const binBadge = document.getElementById('bin-count-badge');
    if (binBadge) {
        if (binNotes.length > 0) {
            binBadge.innerText = binNotes.length;
            binBadge.classList.remove('hidden');
        } else {
            binBadge.classList.add('hidden');
        }
    }

    let filtered = activeNotes;
    const isBinView = (currentFolderFilter === 'Bin');

    if (isBinView) {
        filtered = binNotes;
    } else if (currentFolderFilter !== 'All') {
        filtered = activeNotes.filter(n => n.folder === currentFolderFilter);
    }

    // Time filter (only apply to active view, not bin)
    if (!isBinView && currentTimeFilter !== 'All') {
        const now = new Date();
        filtered = filtered.filter(n => {
            const d = new Date(n.updated_at || n.created_at);
            if (currentTimeFilter === 'Today') {
                return d.toDateString() === now.toDateString();
            } else if (currentTimeFilter === 'This Week') {
                const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
                return d >= weekAgo;
            } else if (currentTimeFilter === 'This Month') {
                return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            }
            return true;
        });
    }

    // Search filter (against cached decrypted titles only — we don't expose ciphertext)
    if (searchQuery) {
        filtered = filtered.filter(n => {
            const cached = inMemoryDecryptedCache.get(n.id);
            const title = (cached ? cached.title : n.title || '').toLowerCase();
            const body  = (cached ? cached.body  : '').toLowerCase();
            return title.includes(searchQuery) || body.includes(searchQuery);
        });
    }

    notesList.innerHTML = '';

    if (filtered.length === 0) {
        if (isBinView) {
            notesList.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; min-height:260px; text-align:center; color:var(--text-light); padding:2rem 1rem;">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4; margin-bottom:1rem;">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <p style="font-size:1.15rem; font-weight:600; color:var(--text-color); margin-bottom:0.45rem;">Bin is empty</p>
                    <p style="font-size:0.88rem; max-width:380px; line-height:1.5;">Deleted notes are kept here for 15 days before automatic permanent deletion.</p>
                </div>
            `;
        } else {
            notesList.innerHTML = '<p style="color:var(--text-light); margin-top:2rem;">No notes in this view. Click "Create Note" to write one.</p>';
        }
        return;
    }

    const colors = ['#f0ebf8', '#ffece0', '#f4fae1', '#fff2db'];

    for (let i = 0; i < filtered.length; i++) {
        const record = filtered[i];
        const color  = colors[i % colors.length];

        // Try in-memory cache first (avoid expensive per-card decrypt)
        let cached = inMemoryDecryptedCache.get(record.id);

        const displayTitle = (cached && cached.title) ? cached.title : (record.title || 'Protected Note');
        const displayBody  = cached ? cached.body : '🔒 Encrypted · click to open';

        const noteCard = document.createElement('div');
        noteCard.className = 'note-card-fancy' + (isBinView ? ' bin-card' : '');

        if (!isBinView) {
            noteCard.onclick = () => editNote(record.id);
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = displayBody;
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        const shortBody   = textContent.split('\n').filter(l => l.trim() !== '');
        let linesHtml = '';
        for (let j = 0; j < Math.min(shortBody.length, 3); j++) {
            linesHtml += `<div class="card-line">${shortBody[j]}</div>`;
        }
        if (!linesHtml) {
            linesHtml = `<div class="card-line" style="color:var(--text-light);">${isBinView ? 'Deleted note' : 'Click to open and decrypt…'}</div>`;
        }

        // Calculate days left in bin (15 days max)
        let binInfoHtml = '';
        if (isBinView) {
            const delTime = record.deleted_at ? new Date(record.deleted_at.replace(' ', 'T') + 'Z') : new Date(record.updated_at || record.created_at);
            const daysPassed = (Date.now() - delTime.getTime()) / (1000 * 60 * 60 * 24);
            const daysLeft = Math.max(1, Math.ceil(15 - daysPassed));
            binInfoHtml = `<span class="bin-days-left">Purges in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}</span>`;
        }

        const ts = record.updated_at || record.created_at || '';
        const timeStr = ts ? new Date(ts.replace(' ', 'T') + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        const actionIconsHtml = isBinView ? `
            <div class="bin-card-actions">
                <button class="card-action-btn restore" onclick="restoreNote(${record.id}, event)" title="Restore note">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                    <span>Restore</span>
                </button>
                <button class="card-action-btn perm-delete" onclick="permanentlyDeleteNote(${record.id}, event)" title="Delete permanently now">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        ` : `
            <div class="card-footer-icon">
                <div class="edit-circle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </div>
            </div>
        `;

        noteCard.innerHTML = `
            <div class="card-header-color" style="background: ${color}">
                <span>${displayTitle}</span>
                <span class="time">${binInfoHtml || timeStr}</span>
            </div>
            <div class="card-body-lines">${linesHtml}</div>
            ${actionIconsHtml}`;
        notesList.appendChild(noteCard);
    }
}

// ─── Secure Save (Create / Update) ────────────────────────────────────────────
async function secureNote() {
    if (isProcessing) return;

    const title  = (document.getElementById('note-title').value || '').trim();
    const body   = document.getElementById('note-body').innerHTML.trim();
    const folder = document.getElementById('note-folder').value || 'General';

    if (!title && !body) {
        alert('Please enter a note title or content.');
        return;
    }

    if (!activePassphrase) {
        promptPassphraseModal();
        return;
    }

    isProcessing = true;
    updateStatusBadge('Saving');

    try {
        const { data: result } = await apiCall('POST', '/api/notes/secure_save', {
            note_id:        editingNoteId || null,
            title:          title || 'Untitled Note',
            folder:         folder,
            content:        body,
            passphrase:     activePassphrase,
            carrier_image:  selectedCarrierPath
        });

        if (result.status !== 'success') {
            if (result.error_type === 'CAPACITY') {
                alert('Image Capacity Error: ' + result.message + '\n\nPlease select a larger carrier image or reduce note length.');
            } else {
                alert('Security Engine Error: ' + (result.message || 'Unknown error'));
            }
            updateStatusBadge('Protected');
            isProcessing = false;
            return;
        }

        // Update in-memory cache immediately (zero extra round-trip)
        const dbId = result.note_id;
        inMemoryDecryptedCache.set(dbId, { title: result.title, body });

        // Show stego preview thumbnail from server-side base64
        const previewBox = document.getElementById('stego-artifact-preview');
        if (result.stego_image && previewBox) {
            document.getElementById('stego-preview-thumbnail').src = result.stego_image;
            document.getElementById('stego-preview-path').innerText = result.stego_path || 'PNG Stego Container';
            previewBox.classList.remove('hidden');
        }

        editingNoteId = dbId; // Now editing the saved record

        updateStatusBadge('Saved');
        setTimeout(() => {
            updateStatusBadge('Protected');
            resetCreateNote();
            showUserView('all-notes');
            isProcessing = false;
        }, 500);

    } catch (err) {
        console.error('Save note error:', err);
        updateStatusBadge('Protected');
        isProcessing = false;
        alert('Failed to secure note: ' + err.message);
    }
}

// ─── Edit / Decrypt Note ──────────────────────────────────────────────────────
async function editNote(id) {
    if (!activePassphrase) {
        promptPassphraseModal();
        return;
    }

    editingNoteId = id;
    document.getElementById('editor-title-display').innerText = 'Edit Note';

    // Fetch note metadata from server
    let noteRecord;
    try {
        const { data } = await apiCall('GET', `/api/notes/${id}`);
        noteRecord = data.note;
    } catch (err) {
        alert('Could not load note: ' + err.message);
        return;
    }

    // Decrypt — check in-memory cache first
    let decrypted = inMemoryDecryptedCache.get(id);

    if (!decrypted) {
        updateStatusBadge('Decrypting');
        try {
            const { data: decResult } = await apiCall('POST', '/api/notes/secure_read', {
                stego_path: noteRecord.stego_path,
                passphrase: activePassphrase
            });
            if (decResult.status === 'success') {
                decrypted = {
                    title: (decResult.metadata && decResult.metadata.title) || noteRecord.title,
                    body:  decResult.note_text
                };
                inMemoryDecryptedCache.set(id, decrypted);
            } else {
                alert('Decryption failed: ' + decResult.message);
                updateStatusBadge('Protected');
                return;
            }
        } catch (err) {
            alert('Decryption error: ' + err.message);
            updateStatusBadge('Protected');
            return;
        }
    }

    document.getElementById('note-title').value       = decrypted.title || noteRecord.title;
    document.getElementById('note-body').innerHTML    = decrypted.body  || '';

    populateFolderSelect();
    if (noteRecord.folder) {
        document.getElementById('note-folder').value = noteRecord.folder;
    }

    // Show stego preview using server-relative image URL
    const previewBox = document.getElementById('stego-artifact-preview');
    if (noteRecord.stego_path && previewBox) {
        document.getElementById('stego-preview-thumbnail').src = noteRecord.stego_path;
        document.getElementById('stego-preview-path').innerText = noteRecord.stego_path;
        previewBox.classList.remove('hidden');
    }

    document.getElementById('btn-delete-icon').style.display = 'inline-flex';
    updateStatusBadge('Protected');
    showUserView('create-note');
}

// ─── Delete Note ──────────────────────────────────────────────────────────────
async function deleteNote() {
    if (!editingNoteId) return;
    if (!confirm('Move this note to the Bin? It will be kept for 15 days before permanent deletion.')) return;

    try {
        await apiCall('DELETE', `/api/notes/${editingNoteId}`);
    } catch (err) {
        alert('Could not move note to bin: ' + err.message);
        return;
    }

    inMemoryDecryptedCache.delete(editingNoteId);
    resetCreateNote();
    currentFolderFilter = 'All';
    const title = document.getElementById('current-view-title');
    if (title) title.innerText = 'My Notes';
    document.getElementById('time-filters-container').classList.remove('hidden');
    document.getElementById('bin-actions-container').classList.add('hidden');
    const binBtn = document.getElementById('btn-nav-bin');
    if (binBtn) binBtn.classList.remove('active');
    showUserView('all-notes');
}

// ─── Reset Editor ─────────────────────────────────────────────────────────────
function resetCreateNote() {
    editingNoteId = null;
    const titleEl = document.getElementById('note-title');
    const bodyEl  = document.getElementById('note-body');
    if (titleEl) titleEl.value     = '';
    if (bodyEl)  bodyEl.innerHTML  = '';
    const deleteBtn = document.getElementById('btn-delete-icon');
    if (deleteBtn) deleteBtn.style.display = 'none';
    const previewBox = document.getElementById('stego-artifact-preview');
    if (previewBox) previewBox.classList.add('hidden');
    updateStatusBadge('Protected');
    const editorTitle = document.getElementById('editor-title-display');
    if (editorTitle) editorTitle.innerText = 'Create Note';
}

// ─── Archive View ──────────────────────────────────────────────────────────────
function showArchive() {
    currentFolderFilter = 'Archive';
    const title = document.getElementById('current-view-title');
    if (title) title.innerText = 'Archived Notes';
    showUserView('all-notes');
}

// ─── Attacker Gallery (Read-only, Images Only) ────────────────────────────────
async function renderAttackerGallery() {
    const gallery = document.getElementById('attacker-gallery');
    if (!gallery) return;
    gallery.innerHTML = '<p style="color:var(--text-light); padding:2rem;">Loading images…</p>';

    try {
        const { data } = await apiCall('GET', '/api/gallery');
        const images   = data.images || [];

        gallery.innerHTML = '';

        if (images.length === 0) {
            gallery.innerHTML = '<p style="color:var(--text-light); padding:2rem;">No media files stored on disk.</p>';
            return;
        }

        images.forEach(img => {
            const el    = document.createElement('img');
            el.src      = img.image_url;    // relative URL served by server
            el.className = 'gallery-img';
            el.title    = `Stored Image #${img.id} · ${img.carrier_name}`;
            el.onclick  = () => openModal(el.src);
            gallery.appendChild(el);
        });
    } catch (err) {
        gallery.innerHTML = `<p style="color:var(--accent-danger,#c0392b); padding:2rem;">${err.message}</p>`;
    }
}

// ─── Image Modal ──────────────────────────────────────────────────────────────
function openModal(src) {
    document.getElementById('modal-img').src = src;
    document.getElementById('image-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('image-modal').classList.add('hidden');
}

// ─── DOMContentLoaded — Session Restore ───────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    // Update theme toggle icon & label state
    updateThemeButtonState();

    // Attach selection listener on note body to preserve highlight range for font styling
    const noteBody = document.getElementById('note-body');
    if (noteBody) {
        noteBody.addEventListener('mouseup', saveEditorSelection);
        noteBody.addEventListener('keyup', saveEditorSelection);
    }

    // Always load carriers list (needed for note editor)
    // Don't await — happens in background
    loadCarriersList();

    // Restore existing session if token is in sessionStorage
    const savedToken = sessionStorage.getItem('stegavault_token');
    const savedMode  = sessionStorage.getItem('stegavault_mode');
    const savedPass  = sessionStorage.getItem('stegavault_passphrase');

    if (savedToken) {
        // Verify session is still valid on the server
        try {
            const res  = await fetch('/api/auth/session', { headers: { 'X-Session-Token': savedToken } });
            const data = await res.json();

            if (data.status === 'success') {
                sessionToken     = savedToken;
                sessionMode      = savedMode  || 'USER';
                activePassphrase = savedPass  || '';

                document.getElementById('login-screen').classList.add('hidden');

                if (sessionMode === 'USER') {
                    document.getElementById('user-screen').classList.remove('hidden');
                    renderFolders();
                    renderUserNotes();
                } else {
                    document.getElementById('attacker-screen').classList.remove('hidden');
                    renderAttackerGallery();
                }
                return;
            }
        } catch (_) {}

        // Session invalid / server not running — clear and show login
        _clearSession();
    }
});
