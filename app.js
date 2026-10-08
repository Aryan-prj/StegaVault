let currentMode = 'U';
let selectedImage = null;
let editingNoteId = null;
let currentFolderFilter = 'All';
let currentTimeFilter = 'Today';
let searchQuery = '';

// Initialize data if not exists
if (!localStorage.getItem('stegavault_notes')) {
    localStorage.setItem('stegavault_notes', JSON.stringify([]));
}
if (!localStorage.getItem('stegavault_folders')) {
    localStorage.setItem('stegavault_folders', JSON.stringify(['General', 'Bucket List', 'Finances', 'Travel Plans']));
}
if (localStorage.getItem('stegavault_theme') === 'dark') {
    document.body.classList.add('dark-mode');
}

function toggleDarkMode() {
    if (document.body.classList.contains('dark-mode')) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('stegavault_theme', 'light');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('stegavault_theme', 'dark');
    }
}

function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-mode-u').classList.remove('active');
    document.getElementById('btn-mode-a').classList.remove('active');
    
    if (mode === 'U') {
        document.getElementById('btn-mode-u').classList.add('active');
    } else {
        document.getElementById('btn-mode-a').classList.add('active');
    }
}

function login() {
    const email = document.getElementById('email').value;
    const pwd = document.getElementById('password').value;
    
    if (email === 'demo@stegavault.com' && pwd === 'Demo@2026Secure') {
        document.getElementById('login-screen').classList.add('hidden');
        
        if (currentMode === 'U') {
            document.getElementById('user-screen').classList.remove('hidden');
            renderFolders();
            renderUserNotes();
        } else {
            document.getElementById('attacker-screen').classList.remove('hidden');
            renderAttackerGallery();
        }
    } else {
        alert("Invalid demo credentials.");
    }
}

function logout() {
    document.getElementById('user-screen').classList.add('hidden');
    document.getElementById('attacker-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    
    // Reset views
    showUserView('all-notes');
    resetCreateNote();
}

function showUserView(viewId) {
    document.getElementById('view-all-notes').classList.add('hidden');
    document.getElementById('view-create-note').classList.add('hidden');
    
    if (viewId === 'all-notes') {
        document.getElementById('view-all-notes').classList.remove('hidden');
        renderUserNotes();
    } else if (viewId === 'create-note') {
        document.getElementById('view-create-note').classList.remove('hidden');
        // Populate folder select dropdown
        populateFolderSelect();
    }
}

function renderFolders() {
    const folders = JSON.parse(localStorage.getItem('stegavault_folders'));
    const list = document.getElementById('sidebar-folder-list');
    list.innerHTML = '';
    
    folders.forEach(f => {
        const li = document.createElement('li');
        li.innerText = f;
        li.onclick = () => filterByFolder(f);
        list.appendChild(li);
    });
}

function populateFolderSelect() {
    const folders = JSON.parse(localStorage.getItem('stegavault_folders'));
    const select = document.getElementById('note-folder');
    select.innerHTML = '';
    folders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.innerText = f;
        select.appendChild(opt);
    });
}

function toggleFolders() {
    const list = document.getElementById('sidebar-folder-list');
    const caret = document.getElementById('folder-caret');
    if (list.style.display === 'none') {
        list.style.display = 'block';
        caret.innerText = '^';
    } else {
        list.style.display = 'none';
        caret.innerText = 'v';
    }
}

function createNewFolder() {
    const name = prompt("Enter new folder name:");
    if (name && name.trim()) {
        const folders = JSON.parse(localStorage.getItem('stegavault_folders'));
        if (!folders.includes(name.trim())) {
            folders.push(name.trim());
            localStorage.setItem('stegavault_folders', JSON.stringify(folders));
            renderFolders();
            populateFolderSelect();
        }
    }
}

function filterByFolder(folder) {
    currentFolderFilter = folder;
    document.getElementById('current-view-title').innerText = folder + ' Notes';
    renderUserNotes();
}

function filterSearch() {
    searchQuery = document.getElementById('search-input').value.toLowerCase();
    renderUserNotes();
}

function setTimeFilter(filter, btnElement) {
    currentTimeFilter = filter;
    document.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    renderUserNotes();
}

let currentUploadType = '';

function triggerFileInput(acceptType) {
    currentUploadType = acceptType;
    const uploadInput = document.getElementById('media-upload');
    uploadInput.accept = acceptType;
    uploadInput.click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        let html = '';
        if (currentUploadType.includes('image')) {
            html = `<img src="${e.target.result}" alt="inserted image" style="max-width:100%; border-radius:8px;"/>`;
        } else if (currentUploadType.includes('video')) {
            html = `<video controls src="${e.target.result}" style="max-width:100%; border-radius:8px;"></video>`;
        } else if (currentUploadType.includes('audio')) {
            html = `<audio controls src="${e.target.result}"></audio>`;
        }
        document.execCommand('insertHTML', false, html);
    };
    reader.readAsDataURL(file);
    
    // reset input
    event.target.value = '';
}

function proceedToImageSelection() {
    const title = document.getElementById('note-title').value.trim();
    const body = document.getElementById('note-body').innerHTML.trim();
    
    if (!title || !body) {
        alert("Please enter title and note content.");
        return;
    }
    
    document.getElementById('step-2').classList.remove('hidden');
}

function selectImage(src, element) {
    selectedImage = src;
    
    const imgs = document.querySelectorAll('.carrier-img');
    imgs.forEach(img => img.classList.remove('selected'));
    
    element.classList.add('selected');
    document.getElementById('btn-secure').disabled = false;
}

function renderUserNotes() {
    const allNotes = JSON.parse(localStorage.getItem('stegavault_notes'));
    const notesList = document.getElementById('notes-list');
    notesList.innerHTML = '';
    
    // Apply filters
    let filteredNotes = allNotes;
    
    if (currentFolderFilter === 'Archive') {
        filteredNotes = allNotes.filter(n => n.archived);
    } else {
        filteredNotes = allNotes.filter(n => !n.archived);
        if (currentFolderFilter !== 'All') {
            filteredNotes = filteredNotes.filter(n => n.folder === currentFolderFilter);
        }
    }
    
    if (searchQuery) {
        filteredNotes = filteredNotes.filter(n => 
            (n.title && n.title.toLowerCase().includes(searchQuery)) || 
            (n.body && n.body.toLowerCase().includes(searchQuery))
        );
    }
    
    // Simplified time filter for demo (just shows all if 'All' isn't selected since we don't have real dates)
    // In a real app we would check n.id (timestamp) against current date
    
    const colors = ['#f0ebf8', '#ffece0', '#f4fae1', '#fff2db'];
    
    filteredNotes.forEach((note, index) => {
        const color = colors[index % colors.length];
        
        const noteCard = document.createElement('div');
        noteCard.className = 'note-card-fancy';
        noteCard.onclick = () => editNote(note.id);
        
        // Strip HTML for the preview
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.body;
        const textContent = tempDiv.textContent || tempDiv.innerText || "";
        const shortBody = textContent.split('\n').filter(l => l.trim() !== '');
        
        let linesHtml = '';
        for (let i = 0; i < Math.min(shortBody.length, 3); i++) {
            linesHtml += `<div class="card-line">${shortBody[i]}</div>`;
        }
        
        noteCard.innerHTML = `
            <div class="card-header-color" style="background: ${color}">
                <span>${note.title || 'Untitled Note'}</span>
                <span class="time">${new Date(note.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <div class="card-body-lines">
                ${linesHtml}
            </div>
            <div class="card-footer-icon">
                <div class="edit-circle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </div>
            </div>
        `;
        notesList.appendChild(noteCard);
    });
}

function editNote(id) {
    const notes = JSON.parse(localStorage.getItem('stegavault_notes'));
    const note = notes.find(n => n.id === id);
    if (!note) return;
    
    editingNoteId = id;
    document.getElementById('editor-title-display').innerText = 'Edit Note';
    document.getElementById('note-title').value = note.title;
    document.getElementById('note-body').innerHTML = note.body;
    
    populateFolderSelect();
    if (note.folder) {
        document.getElementById('note-folder').value = note.folder;
    }
    
    selectedImage = note.image;
    const imgs = document.querySelectorAll('.carrier-img');
    imgs.forEach(img => {
        img.classList.remove('selected');
        if (img.src.includes(note.image)) img.classList.add('selected');
    });
    
    if (selectedImage) {
        document.getElementById('btn-secure').disabled = false;
    }
    
    document.getElementById('btn-delete-icon').style.display = 'block';
    showUserView('create-note');
}

function secureNote() {
    const title = document.getElementById('note-title').value.trim();
    const body = document.getElementById('note-body').innerHTML.trim();
    const folder = document.getElementById('note-folder').value;
    
    const notes = JSON.parse(localStorage.getItem('stegavault_notes'));
    
    if (editingNoteId) {
        const idx = notes.findIndex(n => n.id === editingNoteId);
        if (idx !== -1) {
            notes[idx].title = title;
            notes[idx].body = body;
            notes[idx].folder = folder;
            notes[idx].image = selectedImage;
        }
    } else {
        notes.push({
            id: Date.now(),
            title: title,
            body: body,
            folder: folder,
            image: selectedImage
        });
    }
    
    localStorage.setItem('stegavault_notes', JSON.stringify(notes));
    
    resetCreateNote();
    currentFolderFilter = 'All';
    document.getElementById('current-view-title').innerText = 'My Notes';
    showUserView('all-notes');
}

function resetCreateNote() {
    editingNoteId = null;
    document.getElementById('editor-title-display').innerText = 'Create Note';
    document.getElementById('note-title').value = '';
    document.getElementById('note-body').innerHTML = '';
    document.getElementById('step-2').classList.add('hidden');
    selectedImage = null;
    document.getElementById('btn-secure').disabled = true;
    document.getElementById('btn-delete-icon').style.display = 'none';
    
    const imgs = document.querySelectorAll('.carrier-img');
    imgs.forEach(img => img.classList.remove('selected'));
}

function deleteNote() {
    if (!editingNoteId) return;
    const notes = JSON.parse(localStorage.getItem('stegavault_notes'));
    const idx = notes.findIndex(n => n.id === editingNoteId);
    if (idx !== -1) {
        notes[idx].archived = true;
        localStorage.setItem('stegavault_notes', JSON.stringify(notes));
    }
    resetCreateNote();
    currentFolderFilter = 'All';
    document.getElementById('current-view-title').innerText = 'My Notes';
    showUserView('all-notes');
}

function showArchive() {
    currentFolderFilter = 'Archive';
    document.getElementById('current-view-title').innerText = 'Archived Notes';
    showUserView('all-notes');
}

function renderAttackerGallery() {
    const notes = JSON.parse(localStorage.getItem('stegavault_notes'));
    const gallery = document.getElementById('attacker-gallery');
    
    gallery.innerHTML = '';
    
    // Attacker only sees non-archived notes (or we can assume deleted notes are "shredded")
    const activeNotes = notes.filter(n => !n.archived);
    
    activeNotes.forEach(note => {
        if (!note.image) return; // skip if no carrier image
        const img = document.createElement('img');
        img.src = note.image;
        img.className = 'gallery-img';
        img.onclick = () => openModal(note.image);
        gallery.appendChild(img);
    });
}

function openModal(src) {
    document.getElementById('modal-img').src = src;
    document.getElementById('image-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('image-modal').classList.add('hidden');
}
