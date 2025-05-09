// cesw_hub/main.js

// Always display in NZST
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
const messagesSection  = document.getElementById('messages-section');
const messagesDiv      = document.getElementById('messages');
const filesList        = document.getElementById('files-list');
const messageText      = document.getElementById('message-text');
const sendBtn          = document.getElementById('send-btn');
const fileInput        = document.getElementById('file-input');
const uploadBtn        = document.getElementById('upload-btn');

let userRole, userId, currentChannel = 'everyone';
let pollInterval = null;

// Helpers
const showLogin = () => {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
};
const showChat = () => {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'flex';
};
function greet() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function toDateStr(ts) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: NZ_TZ });
}
function headingText(dStr) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: NZ_TZ });
  const yday  = new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: NZ_TZ });
  if (dStr === today) return 'Today';
  if (dStr === yday)  return 'Yesterday';
  return new Date(dStr).toLocaleDateString('en-NZ', {
    timeZone: NZ_TZ,
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

// 1) Auth & init
async function checkAuth() {
  try {
    const res = await fetch('/api/auth', { credentials: 'include' });
    if (res.ok) {
      const { username, role, id } = await res.json();
      userRole = role; userId = id;
      userInfoDiv.textContent = `${greet()}, ${username}`;
      if (role === 'admin' && adminBtn) adminBtn.style.display = 'inline-block';
      showChat();
      await loadChannels();
      startPolling();
      return;
    }
  } catch (e) {
    console.error('checkAuth:', e);
  }
  showLogin();
}

// 2) Load sidebar channels
async function loadChannels() {
  const channels = [];
  let msgs, last;

  // Everyone
  msgs = await fetch(`/api/messages?channel=everyone`, { credentials: 'include' }).then(r => r.json());
  last = msgs[msgs.length - 1];
  channels.push({ key: 'everyone', label: 'Everyone', ts: last?.timestamp || 0, author: last?.authorRole || null });

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

// Switch channel
function selectChannel(key, label) {
  currentChannel    = key;
  chatTitle.textContent = label;
  document.querySelectorAll('#channel-list li').forEach(li =>
    li.classList.toggle('active', li.dataset.channel === key)
  );
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

// 4) Login form
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

// Admin cog
if (adminBtn) {
  adminBtn.onclick = () => window.location = '/admin.html';
}

// Message input shortcuts
messageText.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.ctrlKey) {
    e.preventDefault(); sendMessage();
  } else if (e.key === 'Enter' && e.ctrlKey) {
    messageText.value += '\n';
  }
});
sendBtn.onclick   = sendMessage;
uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = uploadFile;

// 5) Load all messages + pinned inline, with date headings and AM/PM
async function loadMessages() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials: 'include' });
  if (!res.ok) return;
  const data = await res.json();

  // Clear both
  pinnedContainer.innerHTML = '';
  messagesDiv.innerHTML     = '';

  // Temporarily hide so scroll jump isn’t visible
  messagesSection.style.visibility = 'hidden';

  data.sort((a, b) => a.timestamp - b.timestamp);

  let lastDate = null;
  for (const msg of data) {
    // Date heading
    const dStr = toDateStr(msg.timestamp);
    if (dStr !== lastDate) {
      lastDate = dStr;
      const hdr = document.createElement('div');
      hdr.className   = 'date-heading';
      hdr.textContent = headingText(dStr);
      messagesDiv.appendChild(hdr);
    }

    // Message
    const timeStr = new Date(msg.timestamp).toLocaleTimeString('en-NZ', {
      timeZone: NZ_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<span class="meta">[${timeStr}] ${msg.username}:</span> ${msg.content}`;

    // Admin buttons
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

    messagesDiv.appendChild(div);

    // Also keep a copy in the pinned section if pinned
    if (msg.pinned) {
      pinnedContainer.appendChild(div.cloneNode(true));
    }
  }

  // Scroll to bottom, then show
  requestAnimationFrame(() => {
    messagesSection.scrollTop = messagesSection.scrollHeight;
    messagesSection.style.visibility = 'visible';
  });
}

// Send message
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

// Toggle pin
async function togglePin(id, pinned) {
  await fetch('/api/messages/pin', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ id, pinned })
  });
  loadMessages();
}

// Delete message
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, { method: 'DELETE', credentials: 'include' });
  loadMessages();
}

// Load shared files (unchanged)
async function loadFiles() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials: 'include' });
  if (!res.ok) return;
  const data = await res.json();
  filesList.innerHTML = '';
  data.forEach(msg => {
    const m = msg.content.match(/<a href="([^"]+)" target="_blank">([^<]+)<\/a>/);
    if (!m) return;
    const [, url, fn] = m;
    const li = document.createElement('li');
    li.className = 'file-item';

    let thumb;
    const ext = fn.split('.').pop().toLowerCase();
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

    const span = document.createElement('span');
    span.className = 'file-name';
    span.innerHTML = `<a href="${url}" target="_blank">${fn}</a>`;
    li.appendChild(span);

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

  const r = await fetch('/api/upload', { method:'POST', credentials:'include', body:fm });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return alert('Upload failed: ' + (err.error || r.status));
  }
  const { filename, url } = await r.json();
  await fetch('/api/messages', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ content: `<a href="${url}" target="_blank">${filename}</a>`, channel: currentChannel })
  });

  fileInput.value = '';
  loadFiles();
  loadMessages();
}

// Start
checkAuth();
