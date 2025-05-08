// cesw_hub/main.js

const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const messagesDiv = document.getElementById('messages');
const messageText = document.getElementById('message-text');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const filesList = document.getElementById('files-list');
const channelButtons = document.querySelectorAll('#channel-selector button');

let currentChannel = 'everyone';
let userRole = null;

loginForm.onsubmit = async e => {
  e.preventDefault();
  const res = await fetch('/api/login', {
    method: 'POST',
    credentials: 'include',            // ← include cookies
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    })
  });
  if (res.ok) {
    loginContainer.style.display = 'none';
    chatContainer.style.display = 'block';
    initChat();
  } else {
    alert('Login failed');
  }
};

logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  location.reload();
};

channelButtons.forEach(btn => {
  btn.onclick = () => {
    channelButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentChannel = btn.dataset.channel;
    loadMessages();
  };
});

messageText.onkeydown = e => {
  if (e.key === 'Enter' && !e.ctrlKey) {
    e.preventDefault();
    sendMessage();
  } else if (e.key === 'Enter' && e.ctrlKey) {
    messageText.value += '\n';
  }
};

sendBtn.onclick = sendMessage;
uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = uploadFile;

async function initChat() {
  const userRes = await fetch('/api/auth', { credentials: 'include' });
  if (!userRes.ok) return location.reload();
  const userData = await userRes.json();
  userRole = userData.role;
  if (userRole === 'admin') {
    uploadBtn.style.display = 'inline-block';
  }
  loadMessages();
  loadFiles();
  setInterval(loadMessages, 1000);
}

async function loadMessages() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, {
    credentials: 'include'
  });
  if (!res.ok) return;
  const data = await res.json();
  messagesDiv.innerHTML = '';
  data.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
      <span class="meta">[${new Date(msg.timestamp)
        .toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}] 
      ${msg.username}:</span> <span>${msg.content}</span>`;
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
    messagesDiv.appendChild(div);
  });
}

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

async function togglePin(id, pinned) {
  await fetch('/api/messages/pin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pinned })
  });
  loadMessages();
}

async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  loadMessages();
}

async function loadFiles() {
  const res = await fetch('/api/files', { credentials: 'include' });
  if (!res.ok) return;
  const data = await res.json();
  filesList.innerHTML = '';
  data.forEach(f => {
    const li = document.createElement('li');
    li.innerHTML = `
      <a href="/api/files?id=${f.id}">${f.filename}</a> 
      [${new Date(f.timestamp)
        .toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}]`;
    filesList.appendChild(li);
  });
}

async function uploadFile() {
  const form = new FormData();
  form.append('file', fileInput.files[0]);
  await fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',            // ← include cookies so auth works
    body: form
  });
  loadFiles();
}
