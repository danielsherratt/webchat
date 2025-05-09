// cesw_hub/main.js

// ========== CONFIG ==========
const NZ_TZ     = 'Pacific/Auckland';
const PAGE_SIZE = 10;

// ========== STATE ==========
let userRole, userId, currentChannel = 'everyone';
let allMessages     = [];
let loadedCount     = PAGE_SIZE;
let autoScroll      = true;
let pollInterval    = null;

// ========== ELEMENTS ==========
const loginContainer  = document.getElementById('login-container');
const chatContainer   = document.getElementById('chat-container');
const loginForm       = document.getElementById('login-form');
const logoutBtn       = document.getElementById('logout-btn');
const adminBtn        = document.getElementById('admin-btn');
const userInfoDiv     = document.getElementById('user-info');
const channelList     = document.getElementById('channel-list');
const chatTitle       = document.getElementById('chat-title');
const pinnedContainer = document.getElementById('pinned-messages');
const messagesDiv     = document.getElementById('messages');
const filesList       = document.getElementById('files-list');
const messageText     = document.getElementById('message-text');
const sendBtn         = document.getElementById('send-btn');
const fileInput       = document.getElementById('file-input');
const uploadBtn       = document.getElementById('upload-btn');

// ========== HELPERS ==========
function showLogin() {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
}
function showChat() {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'flex';
}
function greet() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning'
       : h < 18 ? 'Good afternoon'
       : 'Good evening';
}
function toDateStr(ts) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: NZ_TZ });
}
function headingText(dStr) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: NZ_TZ });
  const yday  = new Date(Date.now() - 864e5)
    .toLocaleDateString('en-CA', { timeZone: NZ_TZ });
  if (dStr === today) return 'Today';
  if (dStr === yday ) return 'Yesterday';
  return new Date(dStr).toLocaleDateString('en-NZ', {
    timeZone: NZ_TZ,
    year:   'numeric',
    month:  'short',
    day:    'numeric'
  });
}
function makeMessageDiv(msg) {
  const timeStr = new Date(msg.timestamp).toLocaleTimeString('en-NZ', {
    timeZone: NZ_TZ,
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true
  });
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `<span class="meta">[${timeStr}] ${msg.username}:</span> ${msg.content}`;

  if (userRole === 'admin') {
    const pin = document.createElement('button');
    pin.className   = 'pin-btn';
    pin.textContent = msg.pinned ? 'Unpin' : 'Pin';
    pin.onclick     = () => { autoScroll = true; togglePin(msg.id, !msg.pinned); };
    div.appendChild(pin);

    const del = document.createElement('button');
    del.className   = 'delete-btn';
    del.textContent = 'Delete';
    del.onclick     = () => { autoScroll = true; deleteMessage(msg.id); };
    div.appendChild(del);
  }

  return div;
}

// ========== AUTH & INIT ==========
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

// ========== CHANNELS SIDEBAR ==========
async function loadChannels() {
  const channels = [];
  let msgs, last;

  msgs = await fetch(`/api/messages?channel=everyone`, { credentials:'include' }).then(r=>r.json());
  last = msgs[msgs.length-1];
  channels.push({ key:'everyone', label:'Everyone', ts:last?.timestamp||0, author:last?.authorRole||null });

  if (userRole === 'member') {
    const key = `private-${userId}`;
    msgs = await fetch(`/api/messages?channel=${key}`, { credentials:'include' }).then(r=>r.json());
    last = msgs[msgs.length-1];
    channels.push({ key, label:'Admin', ts:last?.timestamp||0, author:last?.authorRole||null });
  } else {
    const users = await fetch('/api/users', { credentials:'include' }).then(r=>r.json());
    for (const u of users.filter(u=>u.role==='member')) {
      const key = `private-${u.id}`;
      msgs = await fetch(`/api/messages?channel=${key}`, { credentials:'include' }).then(r=>r.json());
      last = msgs[msgs.length-1];
      channels.push({ key, label:u.username, ts:last?.timestamp||0, author:last?.authorRole||null });
    }
  }

  const [ev, ...rest] = channels;
  rest.sort((a,b) => b.ts - a.ts);

  channelList.innerHTML = '';
  [ev, ...rest].forEach(ch => {
    const li = document.createElement('li');
    li.textContent    = ch.label + (userRole==='admin'&&ch.author==='member'?' *':'');
    li.dataset.channel = ch.key;
    if (ch.key === currentChannel) li.classList.add('active');
    if (userRole==='admin'&&ch.author==='member') li.classList.add('bold');
    li.onclick = () => selectChannel(ch.key, ch.label);
    channelList.appendChild(li);
  });
}

function selectChannel(key, label) {
  currentChannel        = key;
  chatTitle.textContent = label;
  document.querySelectorAll('#channel-list li').forEach(li =>
    li.classList.toggle('active', li.dataset.channel===key)
  );
  allMessages     = [];
  loadedCount     = PAGE_SIZE;
  autoScroll      = true;
  messagesDiv.innerHTML     = '';
  pinnedContainer.innerHTML = '';
  loadAllMessages();
  loadFiles();
}

// ========== POLLING ==========
function startPolling() {
  loadAllMessages();
  loadFiles();
  loadChannels();
  pollInterval = setInterval(()=>{
    loadAllMessages();
    loadFiles();
    loadChannels();
  }, 1000);
}

// ========== LOGIN / LOGOUT ==========
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

logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method:'POST', credentials:'include' });
  clearInterval(pollInterval);
  window.location = '/';
};

if (adminBtn) adminBtn.onclick = () => window.location = '/admin.html';

// ========== MESSAGE INPUT ==========
messageText.addEventListener('keydown', e => {
  if (e.key==='Enter' && !e.ctrlKey) { e.preventDefault(); sendMessage(); }
  else if (e.key==='Enter' && e.ctrlKey) { messageText.value += '\n'; }
});
sendBtn.onclick   = sendMessage;
uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = uploadFile;

// ========== LOAD & PAGE MESSAGES ==========
async function loadAllMessages() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, {
    credentials:'include'
  });
  if (!res.ok) return;
  const data = await res.json();
  data.sort((a,b) => a.timestamp - b.timestamp);
  allMessages = data;
  loadedCount = PAGE_SIZE;
  renderPage();
}

function renderPage() {
  // Pinned
  pinnedContainer.innerHTML = '';
  allMessages.slice(-loadedCount)
    .filter(m => m.pinned)
    .forEach(m => pinnedContainer.appendChild(makeMessageDiv(m).cloneNode(true)));

  // Feed
  messagesDiv.innerHTML = '';
  let lastDate = null;
  allMessages.slice(-loadedCount).forEach(m => {
    const dStr = toDateStr(m.timestamp);
    if (dStr !== lastDate) {
      lastDate = dStr;
      const hdr = document.createElement('div');
      hdr.className   = 'date-heading';
      hdr.textContent = headingText(dStr);
      messagesDiv.appendChild(hdr);
    }
    messagesDiv.appendChild(makeMessageDiv(m));
  });

  if (autoScroll) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    autoScroll = false;
  }
}

// ========== INFINITE SCROLL UP ==========
messagesDiv.addEventListener('scroll', () => {
  if (messagesDiv.scrollTop < 50 && loadedCount < allMessages.length) {
    const prevHeight = messagesDiv.scrollHeight;
    loadedCount = Math.min(loadedCount + PAGE_SIZE, allMessages.length);
    autoScroll = false;
    renderPage();
    messagesDiv.scrollTop = messagesDiv.scrollHeight - prevHeight;
  }
  const atBottom = messagesDiv.scrollTop + messagesDiv.clientHeight >= messagesDiv.scrollHeight - 1;
  if (atBottom) autoScroll = true;
});

// ========== SEND / PIN / DELETE ==========
async function sendMessage() {
  const content = messageText.value.trim();
  if (!content) return;
  await fetch('/api/messages', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ content, channel:currentChannel })
  });
  messageText.value = '';
  autoScroll        = true;
  loadedCount       = PAGE_SIZE;
  loadAllMessages();
}

async function togglePin(id, pinned) {
  const res = await fetch('/api/messages/pin', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ id, pinned })
  });
  if (res.ok) {
    const msg = allMessages.find(m => m.id === id);
    if (msg) msg.pinned = pinned;
    autoScroll = true;
    renderPage();
  } else {
    alert('Pin/unpin failed');
  }
}

async function deleteMessage(id) {
  const res = await fetch(`/api/messages?id=${id}`, {
    method:      'DELETE',
    credentials: 'include'
  });
  if (res.ok) {
    allMessages = allMessages.filter(m => m.id !== id);
    autoScroll  = true;
    renderPage();
  } else {
    alert('Delete failed');
  }
}

// ========== SHARED FILES ==========
async function loadFiles() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, {
    credentials:'include'
  });
  if (!res.ok) return;
  const data = await res.json();
  filesList.innerHTML = '';

  data.forEach(msg => {
    const m = msg.content.match(/<a href="([^"]+)" target="_blank">([^<]+)<\/a>/);
    if (!m) return;
    const [, url, fn] = m;
    const ext = fn.split('.').pop().toLowerCase();

    const a = document.createElement('a');
    a.href       = url;
    a.target     = '_blank';
    a.className  = 'file-card';

    let thumb;
    if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
      thumb = document.createElement('img'); thumb.src = url; thumb.alt = fn;
    } else {
      thumb = document.createElement('i');
      const icons = {
        pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word',
        xls:'fa-file-excel', xlsx:'fa-file-excel',
        ppt:'fa-file-powerpoint', pptx:'fa-file-powerpoint'
      };
      thumb.className = `file-icon fas ${icons[ext]||'fa-file'}`;
    }
    a.appendChild(thumb);

    const nameDiv = document.createElement('div');
    nameDiv.className  = 'file-name';
    nameDiv.textContent = fn;
    a.appendChild(nameDiv);

    filesList.appendChild(a);
  });
}

// ========== UPLOAD ==========
async function uploadFile() {
  const f = fileInput.files[0];
  if (!f) return alert('No file selected');
  const fm = new FormData(); fm.append('file', f);
  const r  = await fetch('/api/upload', { method:'POST', credentials:'include', body:fm });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    return alert('Upload failed: ' + (e.error || r.status));
  }
  const { filename, url } = await r.json();
  await fetch('/api/messages', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ content:`<a href="${url}" target="_blank">${filename}</a>`, channel:currentChannel })
  });
  fileInput.value = '';
  loadFiles();
  autoScroll   = true;
  loadedCount  = PAGE_SIZE;
  loadAllMessages();
}

// ========== START ==========
checkAuth();
