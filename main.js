// File: cesw_hub/main.js

// Elements
const loginContainer  = document.getElementById('login-container');
const chatContainer   = document.getElementById('chat-container');
const loginForm       = document.getElementById('login-form');
const logoutBtn       = document.getElementById('logout-btn');
const pinnedContainer = document.getElementById('pinned-messages');
const messagesDiv     = document.getElementById('messages');
const messageText     = document.getElementById('message-text');
const sendBtn         = document.getElementById('send-btn');
const fileInput       = document.getElementById('file-input');
const uploadBtn       = document.getElementById('upload-btn');
const filesList       = document.getElementById('files-list');
const channelButtons  = document.querySelectorAll('#channel-selector button');

let currentChannel = 'everyone';
let userRole       = null;

// Function: show login or chat
function showLogin() {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
}
function showChat() {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'block';
}

// Auth check
async function checkAuth() {
  try {
    const res = await fetch('/api/auth', { credentials: 'include' });
    if (res.status === 200) {
      const data = await res.json();
      userRole = data.role;
      showChat();
      if (userRole === 'admin') uploadBtn.style.display = 'inline-block';
      startChat();
      return;
    }
  } catch (e) {
    console.error('checkAuth error', e);
  }
  showLogin();
}

// Initialize chat polling and loads
let messageInterval;
function startChat() {
  loadMessages();
  loadFiles();
  if (messageInterval) clearInterval(messageInterval);
  messageInterval = setInterval(loadMessages, 1000);
}

// Login form
loginForm.onsubmit = async e => {
  e.preventDefault();
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      })
    });
    if (res.ok) {
      await checkAuth();
      return;
    }
  } catch (e) {
    console.error('login error', e);
  }
  alert('Login failed');
};

// Logout
logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  showLogin();
  if (messageInterval) clearInterval(messageInterval);
};

// Channel selector
channelButtons.forEach(btn => {
  btn.onclick = () => {
    channelButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentChannel = btn.dataset.channel;
    loadMessages();
  };
});

// Enter/ Ctrl+Enter behavior
messageText.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.ctrlKey) {
    e.preventDefault();
    sendMessage();
  } else if (e.key === 'Enter' && e.ctrlKey) {
    messageText.value += '\n';
  }
});
sendBtn.onclick = sendMessage;
uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = uploadFile;

// Load messages
async function loadMessages() {
  try {
    const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    data.reverse();

    pinnedContainer.innerHTML = '';
    messagesDiv.innerHTML     = '';

    data.forEach(msg => {
      const div = document.createElement('div');
      div.className = 'message';
      div.innerHTML = `<span class="meta">[${new Date(msg.timestamp)
        .toLocaleString('en-NZ',{timeZone:'Pacific/Auckland'})}] ${msg.username}:</span> ${msg.content}`;
      if (userRole === 'admin') {
        const pinBtn = document.createElement('button');
        pinBtn.className = 'pin-btn';
        pinBtn.textContent = msg.pinned ? 'Unpin' : 'Pin';
        pinBtn.onclick = () => togglePin(msg.id, !msg.pinned);
        div.appendChild(pinBtn);
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = 'Delete';
        delBtn.onclick = () => deleteMessage(msg.id);
        div.appendChild(delBtn);
      }
      if (msg.pinned) pinnedContainer.appendChild(div);
      else messagesDiv.appendChild(div);
    });
  } catch (e) {
    console.error('loadMessages error', e);
  }
}

// Send message
async function sendMessage() {
  const content = messageText.value.trim();
  if (!content) return;
  await fetch('/api/messages', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, channel: currentChannel })
  });
  messageText.value = '';
  loadMessages();
}

// Pin/unpin
async function togglePin(id, pinned) {
  const res = await fetch('/api/messages/pin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pinned })
  });
  if (!res.ok) console.error('togglePin failed', res.status);
  loadMessages();
}

// Delete message
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, { method: 'DELETE', credentials: 'include' });
  loadMessages();
}

// Load files
async function loadFiles() {
  try {
    const res = await fetch('/api/upload', { credentials: 'include' });
    if (!res.ok) return;
    const files = await res.json();
    filesList.innerHTML = '';
    files.forEach(f => {
      const li = document.createElement('li');
      li.className = 'file-item';
      const ext = f.filename.split('.').pop().toLowerCase();
      let thumb;
      if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
        thumb = document.createElement('img');
        thumb.src = f.url;
        thumb.className = 'file-thumb';
      } else {
        thumb = document.createElement('i');
        const iconMap = { pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word', xls:'fa-file-excel', xlsx:'fa-file-excel', ppt:'fa-file-powerpoint', pptx:'fa-file-powerpoint' };
        thumb.className = `file-icon fas ${iconMap[ext] || 'fa-file'}`;
      }
      li.appendChild(thumb);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'file-name';
      nameSpan.innerHTML = `<a href="${f.url}" target="_blank">${f.filename}</a>`;
      li.appendChild(nameSpan);
      const delBtn = document.createElement('button');
      delBtn.className = 'file-delete';
      delBtn.textContent = '×';
      delBtn.onclick = async () => {
        if (!confirm(`Delete ${f.filename}?`)) return;
        const dres = await fetch(`/api/upload?key=${encodeURIComponent(f.key)}`, { method: 'DELETE', credentials: 'include' });
        if (dres.ok) loadFiles();
      };
      li.appendChild(delBtn);
      filesList.appendChild(li);
    });
  } catch (e) {
    console.error('loadFiles error', e);
  }
}

// Upload file
async function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return alert('No file selected');
  const form = new FormData();
  form.append('file', file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return alert('Upload failed: ' + (err.error || res.status));
    }
    const { filename, url } = await res.json();
    await fetch('/api/messages', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ content: `<a href="${url}" target="_blank">${filename}</a>`, channel: currentChannel })
    });
    fileInput.value = '';
    loadFiles();
    loadMessages();
  } catch (e) {
    console.error('uploadFile error', e);
    alert('Upload error');
  }
}
