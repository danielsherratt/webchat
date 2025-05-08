// File: cesw_hub/main.js

// Elements
const loginContainer  = document.getElementById('login-container');
const chatContainer   = document.getElementById('chat-container');
const loginForm       = document.getElementById('login-form');
const logoutBtn       = document.getElementById('logout-btn');
const currentUserSpan = document.getElementById('current-user');
const channelList     = document.getElementById('channel-list');
const chatTitle       = document.getElementById('chat-title');
const pinnedContainer = document.getElementById('pinned-messages');
const messagesDiv     = document.getElementById('messages');
const filesList       = document.getElementById('files-list');
const messageText     = document.getElementById('message-text');
const sendBtn         = document.getElementById('send-btn');
const fileInput       = document.getElementById('file-input');
const uploadBtn       = document.getElementById('upload-btn');

let userRole, userId, currentChannel = 'everyone', messageInterval;

// Show/hide helpers
function showLogin() {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
}
function showChat() {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'flex';
}

// 1) Check authentication and initialize
async function checkAuth() {
  try {
    const res = await fetch('/api/auth', { credentials: 'include' });
    if (res.status === 200) {
      const { username, role, id } = await res.json();
      userRole = role;
      userId   = id;
      currentUserSpan.textContent = username;
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

// 2) Build and sort the channel list
async function loadChannels() {
  const channels = [];

  // Everyone channel
  let msgs = await fetch(`/api/messages?channel=everyone`, { credentials: 'include' })
                    .then(r => r.json());
  let last = msgs[msgs.length - 1];
  channels.push({
    key:    'everyone',
    label:  'Everyone',
    ts:     last?.timestamp || 0,
    author: last?.authorRole || null
  });

  // Private channels
  if (userRole === 'member') {
    // Member sees one private chat (with admins)
    const key = `private-${userId}`;
    msgs = await fetch(`/api/messages?channel=${key}`, { credentials: 'include' })
              .then(r => r.json());
    last = msgs[msgs.length - 1];
    channels.push({
      key,
      label: 'Admin',
      ts:    last?.timestamp || 0,
      author:last?.authorRole || null
    });
  } else {
    // Admin sees one private chat per member
    const users = await fetch('/api/users', { credentials: 'include' })
                       .then(r => r.json());
    for (const u of users.filter(u => u.role === 'member')) {
      const key = `private-${u.id}`;
      msgs = await fetch(`/api/messages?channel=${key}`, { credentials: 'include' })
                .then(r => r.json());
      last = msgs[msgs.length - 1];
      channels.push({
        key,
        label: u.username,
        ts:    last?.timestamp || 0,
        author:last?.authorRole || null
      });
    }
  }

  // Sort channels by timestamp, but keep Everyone at top
  const [everyone, ...rest] = channels;
  rest.sort((a, b) => b.ts - a.ts);
  const sorted = [everyone, ...rest];

  // Render the list
  channelList.innerHTML = '';
  for (const ch of sorted) {
    const li = document.createElement('li');
    // Append '*' only if you're an admin and the last message was from a member
    li.textContent = ch.label 
      + (userRole === 'admin' && ch.author === 'member' ? ' *' : '');
    li.dataset.channel = ch.key;
    if (ch.key === currentChannel) li.classList.add('active');
    // Maintain bold styling for member-last channels
    if (ch.author === 'member') li.classList.add('bold');
    li.onclick = () => selectChannel(ch.key, ch.label);
    channelList.appendChild(li);
  }
}

// Switch channels when clicked
function selectChannel(key, label) {
  currentChannel = key;
  chatTitle.textContent = label;
  document.querySelectorAll('#channel-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.channel === key);
  });
  loadMessages();
  loadFiles();
}

// 3) Start polling for messages/files
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

// 4) Handle login submission
loginForm.onsubmit = async e => {
  e.preventDefault();
  const res = await fetch('/api/login', {
    method:     'POST',
    credentials:'include',
    headers:    { 'Content-Type': 'application/json' },
    body:       JSON.stringify({
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

// Message input: Enter to send, Ctrl+Enter for newline
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

// Load messages (oldest at top, auto-scroll)
async function loadMessages() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials: 'include' });
  if (!res.ok) return;
  const data = await res.json();

  pinnedContainer.innerHTML = '';
  messagesDiv.innerHTML     = '';

  data.forEach(msg => {
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

    if (msg.pinned) pinnedContainer.appendChild(div);
    else             messagesDiv.appendChild(div);
  });

  // Scroll to bottom
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Send a new message
async function sendMessage() {
  const content = messageText.value.trim();
  if (!content) return;
  await fetch('/api/messages', {
    method:     'POST',
    credentials:'include',
    headers:    { 'Content-Type': 'application/json' },
    body:       JSON.stringify({ content, channel: currentChannel })
  });
  messageText.value = '';
  loadMessages();
}

// Toggle pin status
async function togglePin(id, pinned) {
  await fetch('/api/messages/pin', {
    method:     'POST',
    credentials:'include',
    headers:    { 'Content-Type': 'application/json' },
    body:       JSON.stringify({ id, pinned })
  });
  loadMessages();
}

// Delete a message
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, { method: 'DELETE', credentials: 'include' });
  loadMessages();
}

// Load files that were posted in the current channel
async function loadFiles() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, { credentials: 'include' });
  if (!res.ok) return;
  const data = await res.json();
  filesList.innerHTML = '';

  data.forEach(msg => {
    const match = msg.content.match(/<a href="([^"]+)" target="_blank">([^<]+)<\/a>/);
    if (!match) return;

    const [, url, filename] = match;
    const key = decodeURIComponent(url.split('/').pop());
    const ext = filename.split('.').pop().toLowerCase();

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
        pdf:  'fa-file-pdf',
        doc:  'fa-file-word',
        docx: 'fa-file-word',
        xls:  'fa-file-excel',
        xlsx: 'fa-file-excel',
        ppt:  'fa-file-powerpoint',
        pptx: 'fa-file-powerpoint'
      };
      thumb.className = `file-icon fas ${iconMap[ext] || 'fa-file'}`;
    }
    li.appendChild(thumb);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.innerHTML = `<a href="${url}" target="_blank">${filename}</a>`;
    li.appendChild(nameSpan);

    if (userRole === 'admin') {
      const delBtn = document.createElement('button');
      delBtn.className = 'file-delete';
      delBtn.textContent = '×';
      delBtn.onclick = async () => {
        if (!confirm(`Delete ${filename}?`)) return;
        await fetch(`/api/upload?key=${encodeURIComponent(key)}`, {
          method:     'DELETE',
          credentials: 'include'
        });
        loadFiles();
      };
      li.appendChild(delBtn);
    }

    filesList.appendChild(li);
  });
}

// Upload to R2 and post as a message
async function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return alert('No file selected');
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/upload', {
    method:     'POST',
    credentials: 'include',
    body:        form
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return alert('Upload failed: ' + (err.error || res.status));
  }
  const { filename, url } = await res.json();

  // Post link in chat
  await fetch('/api/messages', {
    method:     'POST',
    credentials: 'include',
    headers:    { 'Content-Type': 'application/json' },
    body:       JSON.stringify({
      content: `<a href="${url}" target="_blank">${filename}</a>`,
      channel: currentChannel
    })
  });

  fileInput.value = '';
  loadFiles();
  loadMessages();
}

// Kick off authentication on page load
checkAuth();
