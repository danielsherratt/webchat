// cesw_hub/main.js

// Detect or fall back to NZ timezone
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Pacific/Auckland';

// Elements
const loginContainer   = document.getElementById('login-container');
const chatContainer    = document.getElementById('chat-container');
const loginForm        = document.getElementById('login-form');
const logoutBtn        = document.getElementById('logout-btn');
const userInfoDiv      = document.getElementById('user-info');
const channelList      = document.getElementById('channel-list');
const chatTitle        = document.getElementById('chat-title');
const pinnedContainer  = document.getElementById('pinned-messages');
const messagesDiv      = document.getElementById('messages');
const messagesSection  = document.getElementById('messages-section');
const filesList        = document.getElementById('files-list');
const filesSection     = document.getElementById('shared-files');
const messageText      = document.getElementById('message-text');
const sendBtn          = document.getElementById('send-btn');
const fileInput        = document.getElementById('file-input');
const uploadBtn        = document.getElementById('upload-btn');

let userRole, userId;
let currentChannel = 'everyone';
let messageInterval;

// Track first‐load auto-scroll per channel
const initialScrolledMsgs  = {};
const initialScrolledFiles = {};

// Show/hide views
const showLogin = () => {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
};
const showChat  = () => {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'flex';
};

// Greeting helper
function getGreeting() {
  const h = new Date().getHours();
  return h < 12
    ? 'Good morning'
    : h < 18
      ? 'Good afternoon'
      : 'Good evening';
}

// 1) Auth check & init
async function checkAuth() {
  try {
    const res = await fetch('/api/auth', { credentials: 'include' });
    if (res.status === 200) {
      const { username, role, id } = await res.json();
      userRole = role;
      userId   = id;
      userInfoDiv.textContent = `${getGreeting()}, ${username}`;
      showChat();
      if (role === 'admin') uploadBtn.style.display = 'inline-block';
      await loadChannels();
      startPolling();
      return;
    }
  } catch (e) {
    console.error('checkAuth error', e);
  }
  showLogin();
}

// 2) Build sidebar
async function loadChannels() {
  const channels = [];
  // Everyone
  let msgs = await fetch(`/api/messages?channel=everyone`, { credentials:'include' }).then(r=>r.json());
  let last = msgs[msgs.length - 1];
  channels.push({
    key: 'everyone',
    label: 'Everyone',
    ts: last?.timestamp || 0,
    author: last?.authorRole || null
  });

  // Private
  if (userRole === 'member') {
    const key = `private-${userId}`;
    msgs = await fetch(`/api/messages?channel=${key}`, { credentials:'include' }).then(r=>r.json());
    last = msgs[msgs.length - 1];
    channels.push({
      key, label: 'Admin',
      ts: last?.timestamp || 0,
      author: last?.authorRole || null
    });
  } else {
    const users = await fetch('/api/users', { credentials:'include' }).then(r=>r.json());
    for (const u of users.filter(u=>u.role==='member')) {
      const key = `private-${u.id}`;
      msgs = await fetch(`/api/messages?channel=${key}`, { credentials:'include' }).then(r=>r.json());
      last = msgs[msgs.length - 1];
      channels.push({
        key, label: u.username,
        ts: last?.timestamp || 0,
        author: last?.authorRole || null
      });
    }
  }

  // Sort by newest, keep Everyone on top
  const [everyone, ...rest] = channels;
  rest.sort((a,b) => b.ts - a.ts);
  const sorted = [everyone, ...rest];

  channelList.innerHTML = '';
  for (const ch of sorted) {
    const li = document.createElement('li');
    li.textContent    = ch.label + (userRole==='admin' && ch.author==='member' ? ' *' : '');
    li.dataset.channel = ch.key;
    if (ch.key === currentChannel) li.classList.add('active');
    if (userRole==='admin' && ch.author==='member') li.classList.add('bold');
    li.onclick = () => selectChannel(ch.key, ch.label);
    channelList.appendChild(li);
  }
}

// Switch channels
function selectChannel(key, label) {
  currentChannel = key;
  chatTitle.textContent = label;
  document.querySelectorAll('#channel-list li').forEach(li =>
    li.classList.toggle('active', li.dataset.channel === key)
  );
  // reset auto-scroll for this channel
  initialScrolledMsgs[key]  = false;
  initialScrolledFiles[key] = false;
  loadMessages();
  loadFiles();
}

// 3) Poll loop
function startPolling() {
  loadMessages();
  loadFiles();
  loadChannels();
  messageInterval = setInterval(() => {
    loadMessages();
    loadFiles();
    loadChannels();
  }, 1000);
}

// 4) Login handler
loginForm.onsubmit = async e => {
  e.preventDefault();
  const res = await fetch('/api/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    })
  });
  if (res.ok) await checkAuth();
  else alert('Login failed');
};

// Logout
logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method:'POST', credentials:'include' });
  clearInterval(messageInterval);
  showLogin();
};

// Input shortcuts
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

// Load messages with one-time auto-scroll
async function loadMessages() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials:'include' });
  if (!res.ok) return;
  const data = await res.json();

  pinnedContainer.innerHTML = '';
  messagesDiv.innerHTML     = '';

  for (const msg of data) {
    const ts = new Date(msg.timestamp).toLocaleString(
      'en-NZ',
      { timeZone: userTimeZone }
    );
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<span class="meta">[${ts}] ${msg.username}:</span> ${msg.content}`;
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
    (msg.pinned ? pinnedContainer : messagesDiv).appendChild(div);
  }

  // auto-scroll only once per channel
  if (!initialScrolledMsgs[currentChannel]) {
    const lastMsg = messagesDiv.lastElementChild;
    if (lastMsg) lastMsg.scrollIntoView({ behavior:'smooth', block:'end' });
    initialScrolledMsgs[currentChannel] = true;
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
  await fetch('/api/messages/pin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pinned })
  });
  loadMessages();
}

// Delete
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, { method:'DELETE', credentials:'include' });
  loadMessages();
}

// Load shared files (one-time auto-scroll)
async function loadFiles() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials:'include' });
  if (!res.ok) return;
  const data = await res.json();

  filesList.innerHTML = '';
  for (const msg of data) {
    const m = msg.content.match(/<a href="([^"]+)" target="_blank">([^<]+)<\/a>/);
    if (!m) continue;
    const [, url, fn] = m;
    const key = decodeURIComponent(url.split('/').pop());
    const ext = fn.split('.').pop().toLowerCase();

    const li = document.createElement('li');
    li.className = 'file-item';

    let thumb;
    if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
      thumb = document.createElement('img');
      thumb.src       = url;
      thumb.className = 'file-thumb';
    } else {
      thumb = document.createElement('i');
      const iconMap = {
        pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word',
        xls:'fa-file-excel', xlsx:'fa-file-excel',
        ppt:'fa-file-powerpoint', pptx:'fa-file-powerpoint'
      };
      thumb.className = `file-icon fas ${iconMap[ext]||'fa-file'}`;
    }
    li.appendChild(thumb);

    const span = document.createElement('span');
    span.className = 'file-name';
    span.innerHTML = `<a href="${url}" target="_blank">${fn}</a>`;
    li.appendChild(span);

    if (userRole === 'admin') {
      const db = document.createElement('button');
      db.className = 'file-delete';
      db.textContent = '×';
      db.onclick = async () => {
        if (!confirm(`Delete ${fn}?`)) return;
        await fetch(`/api/upload?key=${encodeURIComponent(key)}`, {
          method:'DELETE', credentials:'include'
        });
        loadFiles();
      };
      li.appendChild(db);
    }

    filesList.appendChild(li);
  }

  if (!initialScrolledFiles[currentChannel]) {
    filesSection.scrollTo({ top: filesSection.scrollHeight, behavior:'smooth' });
    initialScrolledFiles[currentChannel] = true;
  }
}

// Upload file
async function uploadFile() {
  const f = fileInput.files[0];
  if (!f) return alert('No file selected');
  const fm = new FormData(); fm.append('file', f);

  const r = await fetch('/api/upload', { method:'POST', credentials:'include', body:fm });
  if (!r.ok) {
    const e = await r.json().catch(()=>({}));
    return alert('Upload failed: ' + (e.error || r.status));
  }
  const { filename, url } = await r.json();

  await fetch('/api/messages', {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      content:`<a href="${url}" target="_blank">${filename}</a>`,
      channel: currentChannel
    })
  });

  fileInput.value = '';
  loadFiles();
  loadMessages();
}

// Start
checkAuth();
