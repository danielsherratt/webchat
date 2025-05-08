// cesw_hub/main.js

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

// Track whether we've auto-scrolled each channel
const initialScrolled = {};

// Helpers to show/hide views
function showLogin() {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
}
function showChat() {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'flex';
}

// Greeting
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// 1) Check auth state
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

// 2) Build sidebar channel list
async function loadChannels() {
  const channels = [];
  // Everyone channel
  let msgs = await fetch(`/api/messages?channel=everyone`, { credentials: 'include' }).then(r => r.json());
  let last = msgs[msgs.length - 1];
  channels.push({
    key: 'everyone',
    label: 'Everyone',
    ts: last?.timestamp || 0,
    author: last?.authorRole || null
  });

  // Private channels
  if (userRole === 'member') {
    const key = `private-${userId}`;
    msgs = await fetch(`/api/messages?channel=${key}`, { credentials: 'include' }).then(r => r.json());
    last = msgs[msgs.length - 1];
    channels.push({
      key,
      label: 'Admin',
      ts: last?.timestamp || 0,
      author: last?.authorRole || null
    });
  } else {
    const users = await fetch('/api/users', { credentials: 'include' }).then(r => r.json());
    for (const u of users.filter(u => u.role === 'member')) {
      const key = `private-${u.id}`;
      msgs = await fetch(`/api/messages?channel=${key}`, { credentials: 'include' }).then(r => r.json());
      last = msgs[msgs.length - 1];
      channels.push({
        key,
        label: u.username,
        ts: last?.timestamp || 0,
        author: last?.authorRole || null
      });
    }
  }

  // Sort by timestamp (newest first), keep Everyone at top
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

// Switch channel
function selectChannel(key, label) {
  currentChannel = key;
  chatTitle.textContent = label;
  document.querySelectorAll('#channel-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.channel === key);
  });
  // Reset auto-scroll flag for this channel
  initialScrolled[key] = false;
  loadMessages();
  loadFiles();
}

// 3) Poll for updates
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

// 4) Handle login form submission
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
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  clearInterval(messageInterval);
  showLogin();
};

// Message input: Enter to send, Ctrl+Enter newline
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

// Load and display messages
async function loadMessages() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials: 'include' });
  if (!res.ok) return;
  const data = await res.json();

  pinnedContainer.innerHTML = '';
  messagesDiv.innerHTML     = '';

  for (const msg of data) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
      <span class="meta">[${new Date(msg.timestamp)
        .toLocaleString('en-NZ',{timeZone:'Pacific/Auckland'})}] 
        ${msg.username}:</span> ${msg.content}`;
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

  // Auto-scroll once per channel
  if (!initialScrolled[currentChannel]) {
    const lastMsg = messagesDiv.lastElementChild;
    if (lastMsg) {
      lastMsg.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    initialScrolled[currentChannel] = true;
  }
}

// Send a new message
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

// Toggle pin
async function togglePin(id, pinned) {
  await fetch('/api/messages/pin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pinned })
  });
  loadMessages();
}

// Delete a message
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, { method: 'DELETE', credentials: 'include' });
  loadMessages();
}

// Load and display shared files
async function loadFiles() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials: 'include' });
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
        pdf:'fa-file-pdf',doc:'fa-file-word',docx:'fa-file-word',
        xls:'fa-file-excel',xlsx:'fa-file-excel',
        ppt:'fa-file-powerpoint',pptx:'fa-file-powerpoint'
      };
      thumb.className = `file-icon fas ${iconMap[ext]||'fa-file'}`;
    }
    li.appendChild(thumb);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.innerHTML = `<a href="${url}" target="_blank">${fn}</a>`;
    li.appendChild(nameSpan);

    if (userRole === 'admin') {
      const delBtn = document.createElement('button');
      delBtn.className = 'file-delete';
      delBtn.textContent = '×';
      delBtn.onclick = async () => {
        if (!confirm(`Delete ${fn}?`)) return;
        await fetch(`/api/upload?key=${encodeURIComponent(key)}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        loadFiles();
      };
      li.appendChild(delBtn);
    }

    filesList.appendChild(li);
  }

  // initial scroll of files pane if not done
  if (!initialScrolled[currentChannel + '_files']) {
    filesSection.scrollTo({ top: filesSection.scrollHeight, behavior: 'smooth' });
    initialScrolled[currentChannel + '_files'] = true;
  }
}

// Upload a file and post its link
async function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return alert('No file selected');
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return alert('Upload failed: ' + (err.error || res.status));
  }
  const { filename, url } = await res.json();

  await fetch('/api/messages', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `<a href="${url}" target="_blank">${filename}</a>`, channel: currentChannel })
  });

  fileInput.value = '';
  loadFiles();
  loadMessages();
}

// Initialize
checkAuth();
