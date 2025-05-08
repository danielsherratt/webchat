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

// Toggle UI
function showLogin() {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
}
function showChat() {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'block';
}

// Build channel selector
async function renderChannelSelector() {
  channelSelector.innerHTML = '';

  // Everyone
  const btnEveryone = document.createElement('button');
  btnEveryone.textContent = 'Everyone';
  btnEveryone.dataset.channel = 'everyone';
  btnEveryone.classList.add('active');
  channelSelector.appendChild(btnEveryone);

  if (userRole === 'member') {
    const btnPrivate = document.createElement('button');
    btnPrivate.textContent = 'Admin Chat';
    btnPrivate.dataset.channel = `private-${userId}`;
    channelSelector.appendChild(btnPrivate);
  } else if (userRole === 'admin') {
    const select = document.createElement('select');
    select.id = 'admin-selector';
    const placeholder = document.createElement('option');
    placeholder.textContent = 'Choose member…';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

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

    select.onchange = () => setChannel(select.value);
    channelSelector.appendChild(select);
  }

  // wire up buttons
  channelSelector.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => setChannel(btn.dataset.channel);
  });
}

// Switch channel
function setChannel(channel) {
  currentChannel = channel;
  channelSelector.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.channel === channel);
  });
  chatTitle.textContent =
    channel === 'everyone'
      ? 'Everyone Chat'
      : `Private Chat (${channel.split('-')[1]})`;
  loadMessages();
  loadFiles();
}

// 1) Auth check
async function checkAuth() {
  try {
    const res = await fetch('/api/auth', { credentials: 'include' });
    if (res.status === 200) {
      const data = await res.json();
      userRole = data.role;
      userId   = data.id;
      document.getElementById('current-user').textContent = data.username;
      showChat();
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
  messageInterval = setInterval(() => {
    loadMessages();
    loadFiles();
  }, 1000);
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
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  showLogin();
  if (messageInterval) clearInterval(messageInterval);
};

// Enter & Ctrl+Enter behavior
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

// Load messages
async function loadMessages() {
  try {
    const res = await fetch(`/api/messages?channel=${currentChannel}`, {
      credentials: 'include'
    });
    if (!res.ok) return;
    let data = await res.json();
    data = data.reverse(); // newest first

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

// Send a message
async function sendMessage() {
  const content = messageText.value.trim();
  if (!content) return;
  await fetch('/api/messages', {
    method:     'POST',
    credentials:'include',
    headers:    { 'Content-Type':'application/json' },
    body:       JSON.stringify({ content, channel: currentChannel })
  });
  messageText.value = '';
  loadMessages();
}

// Toggle pin
async function togglePin(id, pinned) {
  await fetch('/api/messages/pin', {
    method:     'POST',
    credentials:'include',
    headers:    { 'Content-Type':'application/json' },
    body:       JSON.stringify({ id, pinned })
  });
  loadMessages();
}

// Delete a message
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`, {
    method:     'DELETE',
    credentials:'include'
  });
  loadMessages();
}

// Load files **only from this channel** by parsing messages
async function loadFiles() {
  try {
    // pull messages for current channel
    const res = await fetch(`/api/messages?channel=${currentChannel}`, {
      credentials: 'include'
    });
    if (!res.ok) return;
    const data = await res.json();
    filesList.innerHTML = '';

    // find file links in each message
    data.forEach(msg => {
      const match = msg.content.match(
        /<a href="([^"]+)" target="_blank">([^<]+)<\/a>/
      );
      if (!match) return;

      const [, url, filename] = match;
      const key = decodeURIComponent(url.split('/').pop());
      const ext = filename.split('.').pop().toLowerCase();

      // build list item
      const li = document.createElement('li');
      li.className = 'file-item';

      // thumbnail or icon
      let thumb;
      if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
        thumb = document.createElement('img');
        thumb.src       = url;
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

      // filename link
      const nameSpan = document.createElement('span');
      nameSpan.className = 'file-name';
      nameSpan.innerHTML = `<a href="${url}" target="_blank">${filename}</a>`;
      li.appendChild(nameSpan);

      // delete only for admins
      if (userRole === 'admin') {
        const delBtn = document.createElement('button');
        delBtn.className = 'file-delete';
        delBtn.textContent = '×';
        delBtn.onclick = async () => {
          if (!confirm(`Delete ${filename}?`)) return;
          await fetch(`/api/upload?key=${encodeURIComponent(key)}`, {
            method:     'DELETE',
            credentials:'include'
          });
          loadFiles();
        };
        li.appendChild(delBtn);
      }

      filesList.appendChild(li);
    });
  } catch (e) {
    console.error('loadFiles error', e);
  }
}

// Upload & post link
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
    return alert('Upload failed: ' + (err.error || res.status));
  }
  const { filename, url } = await res.json();

  // then post a chat message linking to it
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
}

// initialize
checkAuth();
