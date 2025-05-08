// cesw_hub/main.js

// Elements
const loginContainer  = document.getElementById('login-container');
const chatContainer   = document.getElementById('chat-container');
const loginForm       = document.getElementById('login-form');
const logoutBtn       = document.getElementById('logout-btn');
const chatTitle       = document.getElementById('chat-title');
const channelSelector = document.getElementById('channel-selector');
const pinnedContainer = document.getElementById('pinned-messages');
const messagesDiv     = document.getElementById('messages');
const messageText     = document.getElementById('message-text');
const sendBtn         = document.getElementById('send-btn');
const fileInput       = document.getElementById('file-input');
const uploadBtn       = document.getElementById('upload-btn');
const filesList       = document.getElementById('files-list');

let currentChannel = 'everyone';
let userRole       = null;
let userId         = null;
let messageInterval;

// Helpers
function showLogin() {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
}
function showChat() {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'block';
}

// Render channel selector based on role
async function renderChannelSelector() {
  channelSelector.innerHTML = ''; 
  // Everyone button
  const btnEveryone = document.createElement('button');
  btnEveryone.textContent = 'Everyone';
  btnEveryone.dataset.channel = 'everyone';
  btnEveryone.classList.add('active');
  channelSelector.appendChild(btnEveryone);

  // Role‐specific
  if (userRole === 'member') {
    const btnAdminChat = document.createElement('button');
    btnAdminChat.textContent = 'Admin Chat';
    btnAdminChat.dataset.channel = `private-${userId}`;
    channelSelector.appendChild(btnAdminChat);
  } else if (userRole === 'admin') {
    const select = document.createElement('select');
    select.id = 'admin-selector';
    const placeholder = document.createElement('option');
    placeholder.textContent = 'Choose member...';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    // Fetch all members
    const res = await fetch('/api/users', { credentials: 'include' });
    const users = await res.json();
    users
      .filter(u => u.role === 'member')
      .forEach(u => {
        const opt = document.createElement('option');
        opt.value = `private-${u.id}`;
        opt.textContent = `Chat with ${u.username}`;
        select.appendChild(opt);
      });
    channelSelector.appendChild(select);

    // change handler
    select.onchange = () => {
      setChannel(select.value);
    };
  }

  // attach click handlers to buttons
  channelSelector.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => setChannel(btn.dataset.channel);
  });
}

// switch channel
function setChannel(channel) {
  currentChannel = channel;
  // update UI highlight
  channelSelector.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.channel === channel);
  });
  // update title
  if (channel === 'everyone') {
    chatTitle.textContent = 'Everyone Chat';
  } else {
    const parts = channel.split('-');
    chatTitle.textContent = parts[0] === 'private'
      ? `Private chat (${channel.replace('private-','')})`
      : channel;
  }
  loadMessages();
}

// 1) Auth check
async function checkAuth() {
  try {
    const res = await fetch('/api/auth', { credentials: 'include' });
    if (res.status === 200) {
      const data = await res.json();
      userRole = data.role;
      userId   = data.id;
      showChat();
      // show upload only for admins
      if (userRole === 'admin') uploadBtn.style.display = 'inline-block';
      await renderChannelSelector();
      startChat();
      return;
    }
  } catch (e) {
    console.error('checkAuth error', e);
  }
  showLogin();
}

// 2) Start polling
function startChat() {
  loadMessages();
  loadFiles();
  if (messageInterval) clearInterval(messageInterval);
  messageInterval = setInterval(loadMessages, 1000);
}

// 3) Login form
loginForm.onsubmit = async e => {
  e.preventDefault();
  const res = await fetch('/api/login', {
    method:    'POST',
    credentials:'include',
    headers:   { 'Content-Type': 'application/json' },
    body:      JSON.stringify({
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    })
  });
  if (res.ok) return checkAuth();
  alert('Login failed');
};

// Logout
logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method:'POST', credentials:'include' });
  showLogin();
  if (messageInterval) clearInterval(messageInterval);
};

// Message input behavior
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

// Load & render messages
async function loadMessages() {
  try {
    const res = await fetch(`/api/messages?channel=${currentChannel}`, {
      credentials:'include'
    });
    if (!res.ok) return;
    let data = await res.json();
    data = data.reverse();  // newest first

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
  } catch (e) {
    console.error('loadMessages error', e);
  }
}

// Send message
async function sendMessage() {
  const content = messageText.value.trim();
  if (!content) return;
  await fetch('/api/messages', {
    method:    'POST',
    credentials:'include',
    headers:   { 'Content-Type':'application/json' },
    body:      JSON.stringify({ content, channel:currentChannel })
  });
  messageText.value = '';
  loadMessages();
}

// Pin toggle
async function togglePin(id, pinned) {
  await fetch('/api/messages/pin', {
    method:     'POST',
    credentials:'include',
    headers:    { 'Content-Type':'application/json' },
    body:       JSON.stringify({ id, pinned })
  });
  loadMessages();
}

// Delete
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, {
    method:     'DELETE',
    credentials:'include'
  });
  loadMessages();
}

// Load shared files
async function loadFiles() {
  try {
    const res = await fetch('/api/upload', { credentials:'include' });
    if (!res.ok) return;
    const files = await res.json();
    filesList.innerHTML = '';

    files.forEach(f => {
      const li = document.createElement('li');
      li.className = 'file-item';

      // Thumbnail or icon
      const ext = f.filename.split('.').pop().toLowerCase();
      let thumb;
      if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
        thumb = document.createElement('img');
        thumb.src       = f.url;
        thumb.className = 'file-thumb';
      } else {
        thumb = document.createElement('i');
        const iconMap = {
          pdf:'fa-file-pdf',
          doc:'fa-file-word',
          docx:'fa-file-word',
          xls:'fa-file-excel',
          xlsx:'fa-file-excel',
          ppt:'fa-file-powerpoint',
          pptx:'fa-file-powerpoint'
        };
        thumb.className = `file-icon fas ${iconMap[ext]||'fa-file'}`;
      }
      li.appendChild(thumb);

      // Filename link
      const nameSpan = document.createElement('span');
      nameSpan.className = 'file-name';
      nameSpan.innerHTML = `<a href="${f.url}" target="_blank">${f.filename}</a>`;
      li.appendChild(nameSpan);

      // Delete only for admin
      if (userRole === 'admin') {
        const delBtn = document.createElement('button');
        delBtn.className = 'file-delete';
        delBtn.textContent = '×';
        delBtn.onclick = async () => {
          if (!confirm(`Delete ${f.filename}?`)) return;
          const dres = await fetch(
            `/api/upload?key=${encodeURIComponent(f.key)}`,
            { method:'DELETE', credentials:'include' }
          );
          if (dres.ok) loadFiles();
          else         alert('Delete failed');
        };
        li.appendChild(delBtn);
      }

      filesList.appendChild(li);
    });
  } catch (e) {
    console.error('loadFiles error', e);
  }
}

// Upload to R2 & post link
async function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return alert('No file selected');
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/upload', {
    method:     'POST',
    credentials:'include',
    body:       form
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return alert('Upload failed: ' + (err.error||res.status));
  }
  const { filename, url } = await res.json();

  // auto‐post chat link
  await fetch('/api/messages', {
    method:     'POST',
    credentials:'include',
    headers:    { 'Content-Type':'application/json' },
    body:       JSON.stringify({
      content: `<a href="${url}" target="_blank">${filename}</a>`,
      channel: currentChannel
    })
  });

  fileInput.value = '';
  loadFiles();
  loadMessages();
}

// Kick off auth
checkAuth();
