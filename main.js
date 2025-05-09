// cesw_hub/main.js

// Always use NZST for formatting
const NZ_TZ = 'Pacific/Auckland';

// Element references
const loginContainer   = document.getElementById('login-container');
const chatContainer    = document.getElementById('chat-container');
const loginForm        = document.getElementById('login-form');
const logoutBtn        = document.getElementById('logout-btn');
const adminBtn         = document.getElementById('admin-btn');
const userInfoDiv      = document.getElementById('user-info');
const channelList      = document.getElementById('channel-list');
const chatTitle        = document.getElementById('chat-title');
const pinnedContainer  = document.getElementById('pinned-messages');
const messagesDiv      = document.getElementById('messages');
const filesList        = document.getElementById('files-list');
const messageText      = document.getElementById('message-text');
const sendBtn          = document.getElementById('send-btn');
const fileInput        = document.getElementById('file-input');
const uploadBtn        = document.getElementById('upload-btn');

let userRole, userId, currentChannel = 'everyone';
let pollInterval = null;

// Show/hide helpers
const showLogin = () => {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
};
const showChat = () => {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'flex';
};

// Simple greeting
function greet() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ISO date string (YYYY-MM-DD) in NZ
function toDateStr(ts) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: NZ_TZ });
}

// Heading text for a date
function headingText(dStr) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: NZ_TZ });
  const yday  = new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: NZ_TZ });
  if (dStr === today) return 'Today';
  if (dStr === yday)  return 'Yesterday';
  return new Date(dStr).toLocaleDateString('en-NZ', {
    timeZone: NZ_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// 1) Check auth & initialize
async function checkAuth() {
  try {
    const res = await fetch('/api/auth', { credentials: 'include' });
    if (res.ok) {
      const { username, role, id } = await res.json();
      userRole = role;
      userId   = id;
      userInfoDiv.textContent = `${greet()}, ${username}`;
      if (role === 'admin' && adminBtn) adminBtn.style.display = 'inline-block';
      showChat();
      await loadChannels();
      startPolling();
      return;
    }
  } catch (e) {
    console.error('checkAuth error', e);
  }
  showLogin();
}

// 2) Build sidebar channel list
async function loadChannels() {
  const channels = [];

  // Everyone
  let msgs = await fetch(`/api/messages?channel=everyone`, { credentials: 'include' }).then(r => r.json());
  let last = msgs[msgs.length - 1];
  channels.push({
    key:    'everyone',
    label:  'Everyone',
    ts:     last?.timestamp || 0,
    author: last?.authorRole || null
  });

  // Private chats
  if (userRole === 'member') {
    const key = `private-${userId}`;
    msgs = await fetch(`/api/messages?channel=${key}`, { credentials: 'include' }).then(r => r.json());
    last = msgs[msgs.length - 1];
    channels.push({ key, label: 'Admin', ts: last?.timestamp || 0, author: last?.authorRole || null });
  } else {
    const users = await fetch('/api/users', { credentials: 'include' }).then(r => r.json());
    for (const u of users.filter(u => u.role === 'member')) {
      const key = `private-${u.id}`;
      msgs = await fetch(`/api/messages?channel=${key}`, { credentials: 'include' }).then(r => r.json());
      last = msgs[msgs.length - 1];
      channels.push({ key, label: u.username, ts: last?.timestamp || 0, author: last?.authorRole || null });
    }
  }

  // Sort by most recent, keep "Everyone" at top
  const [everyone, ...rest] = channels;
  rest.sort((a, b) => b.ts - a.ts);
  const sorted = [everyone, ...rest];

  // Render list
  channelList.innerHTML = '';
  for (const ch of sorted) {
    const li = document.createElement('li');
    li.textContent    = ch.label + (userRole === 'admin' && ch.author === 'member' ? ' *' : '');
    li.dataset.channel = ch.key;
    if (ch.key === currentChannel) li.classList.add('active');
    if (userRole === 'admin' && ch.author === 'member') li.classList.add('bold');
    li.onclick = () => selectChannel(ch.key, ch.label);
    channelList.appendChild(li);
  }
}

// Switch to a different channel
function selectChannel(key, label) {
  currentChannel    = key;
  chatTitle.textContent = label;
  document.querySelectorAll('#channel-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.channel === key);
  });
  loadMessages();
  loadFiles();
}

// 3) Polling loop
function startPolling() {
  loadMessages();
  loadFiles();
  loadChannels();
  pollInterval = setInterval(() => {
    loadMessages();
    loadFiles();
    loadChannels();
  }, 1000);
}

// 4) Handle login
loginForm.onsubmit = async e => {
  e.preventDefault();
  const res = await fetch('/api/login', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    })
  });
  if (res.ok) await checkAuth();
  else alert('Login failed');
};

// Logout
logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  clearInterval(pollInterval);
  window.location = '/';
};

// Admin cog button
if (adminBtn) {
  adminBtn.onclick = () => window.location = '/admin.html';
}

// Message input shortcuts
messageText.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.ctrlKey) {
    e.preventDefault();
    sendMessage();
  } else if (e.key === 'Enter' && e.ctrlKey) {
    messageText.value += '\n';
  }
});
sendBtn.onclick   = sendMessage;
uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = uploadFile;

// 5) Load & render **all** messages, pinned + feed, with date headings
async function loadMessages() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials: 'include' });
  if (!res.ok) return;
  const data = await res.json();

  // Clear both sections
  pinnedContainer.innerHTML = '';
  messagesDiv.innerHTML     = '';

  // Sort ascending
  data.sort((a, b) => a.timestamp - b.timestamp);

  let lastDate = null;
  data.forEach(msg => {
    // Date heading
    const dStr = toDateStr(msg.timestamp);
    if (dStr !== lastDate) {
      lastDate = dStr;
      const h = document.createElement('div');
      h.className   = 'date-heading';
      h.textContent = headingText(dStr);
      messagesDiv.appendChild(h);
    }

    // Message bubble
    const timeStr = new Date(msg.timestamp)
      .toLocaleTimeString('en-NZ', {
        timeZone: NZ_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<span class="meta">[${timeStr}] ${msg.username}:</span> ${msg.content}`;

    // Admin controls
    if (userRole === 'admin') {
      const pinBtn = document.createElement('button');
      pinBtn.className   = 'pin-btn';
      pinBtn.textContent = msg.pinned ? 'Unpin' : 'Pin';
      pinBtn.onclick     = () => togglePin(msg.id, !msg.pinned);
      div.appendChild(pinBtn);

      const delBtn = document.createElement('button');
      delBtn.className   = 'delete-btn';
      delBtn.textContent = 'Delete';
      delBtn.onclick     = () => deleteMessage(msg.id);
      div.appendChild(delBtn);
    }

    // Append inline
    messagesDiv.appendChild(div);

    // If pinned, also append to pinned section
    if (msg.pinned) {
      pinnedContainer.appendChild(div.cloneNode(true));
    }
  });

  // **No auto-scroll** – user controls scrolling
}

// Send a message
async function sendMessage() {
  const content = messageText.value.trim();
  if (!content) return;
  await fetch('/api/messages', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ content, channel: currentChannel })
  });
  messageText.value = '';
  loadMessages();
}

// Toggle pin status
async function togglePin(id, pinned) {
  await fetch('/api/messages/pin', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ id, pinned })
  });
  loadMessages();
}

// Delete a message
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, { method: 'DELETE', credentials: 'include' });
  loadMessages();
}

// Load shared files
async function loadFiles() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials: 'include' });
  if (!res.ok) return;
  const data = await res.json();
  filesList.innerHTML = '';

  data.forEach(msg => {
    const match = msg.content.match(/<a href="([^"]+)" target="_blank">([^<]+)<\/a>/);
    if (!match) return;
    const [, url, fn] = match;
    const li = document.createElement('li');
    li.className = 'file-item';

    // Thumbnail or icon
    const ext = fn.split('.').pop().toLowerCase();
    let thumb;
    if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
      thumb = document.createElement('img');
      thumb.src       = url;
      thumb.className = 'file-thumb';
    } else {
      thumb = document.createElement('i');
      const icons = {
        pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word',
        xls:'fa-file-excel', xlsx:'fa-file-excel',
        ppt:'fa-file-powerpoint', pptx:'fa-file-powerpoint'
      };
      thumb.className = `file-icon fas ${icons[ext]||'fa-file'}`;
    }
    li.appendChild(thumb);

    // Filename link
    const span = document.createElement('span');
    span.className = 'file-name';
    span.innerHTML = `<a href="${url}" target="_blank">${fn}</a>`;
    li.appendChild(span);

    // Admin delete
    if (userRole === 'admin') {
      const db = document.createElement('button');
      db.className   = 'file-delete';
      db.textContent = '×';
      db.onclick     = async () => {
        if (!confirm(`Delete ${fn}?`)) return;
        await fetch(`/api/upload?key=${encodeURIComponent(url.split('/').pop())}`, {
          method:      'DELETE',
          credentials: 'include'
        });
        loadFiles();
      };
      li.appendChild(db);
    }

    filesList.appendChild(li);
  });
}

// Upload a file
async function uploadFile() {
  const f = fileInput.files[0];
  if (!f) return alert('No file selected');
  const fm = new FormData();
  fm.append('file', f);

  const res = await fetch('/api/upload', {
    method:      'POST',
    credentials: 'include',
    body:        fm
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return alert('Upload failed: ' + (err.error || res.status));
  }

  const { filename, url } = await res.json();
  await fetch('/api/messages', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({
      content: `<a href="${url}" target="_blank">${filename}</a>`,
      channel: currentChannel
    })
  });

  fileInput.value = '';
  loadFiles();
  loadMessages();
}

// Start it up
checkAuth();
