// File: cesw_hub/main.js

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

// Authenticate and initialize chat
async function checkAuth() {
  const res = await fetch('/api/auth', { credentials: 'include' });
  if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
    const { role } = await res.json();
    userRole = role;
    loginContainer.style.display = 'none';
    chatContainer.style.display  = 'block';
    if (role === 'admin') uploadBtn.style.display = 'inline-block';

    loadMessages();
    loadFiles();
    setInterval(loadMessages, 1000);
  } else {
    loginContainer.style.display = 'block';
    chatContainer.style.display  = 'none';
  }
}

// Run auth check on load
checkAuth();

// Sign-in form
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
  if (res.ok) return checkAuth();
  alert('Login failed');
};

// Logout
logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  window.location.reload();
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

// Enter=send, Ctrl+Enter=new line
messageText.onkeydown = e => {
  if (e.key === 'Enter' && !e.ctrlKey) {
    e.preventDefault();
    sendMessage();
  } else if (e.key === 'Enter' && e.ctrlKey) {
    messageText.value += '\n';
  }
};

sendBtn.onclick  = sendMessage;
uploadBtn.onclick = () => fileInput.click();
fileInput.onchange  = uploadFile;

// Load messages and separate pinned
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
        .toLocaleString('en-NZ', {timeZone:'Pacific/Auckland'})}] 
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
}

// Send a message
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

// Pin/unpin a message
async function togglePin(id, pinned) {
  const res = await fetch('/api/messages/pin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pinned })
  });
  if (!res.ok) alert('Pin failed');
  loadMessages();
}

// Delete a message
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  loadMessages();
}

// Load files from R2 bucket
async function loadFiles() {
  const res = await fetch('/api/upload', { credentials: 'include' });
  if (!res.ok) return;
  const files = await res.json();
  filesList.innerHTML = '';
  files.forEach(f => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${f.url}" target="_blank">${f.filename}</a>`;
    filesList.appendChild(li);
  });
}

// Upload a file to R2 and send chat link
async function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',
    body: form
  });
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
