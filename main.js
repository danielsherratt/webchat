// cesw_hub/main.js

const NZ_TZ = 'Pacific/Auckland';
const PAGE_SIZE = 20;

// Element refs
const loginContainer  = document.getElementById('login-container');
const chatContainer   = document.getElementById('chat-container');
const loginForm       = document.getElementById('login-form');
const logoutBtn       = document.getElementById('logout-btn');
const adminBtn        = document.getElementById('admin-btn');
const userInfoDiv     = document.getElementById('user-info');
const channelList     = document.getElementById('channel-list');
const chatTitle       = document.getElementById('chat-title');
const pinnedContainer = document.getElementById('pinned-messages');
const messagesSection = document.getElementById('messages-section');
const messagesDiv     = document.getElementById('messages');
const filesList       = document.getElementById('files-list');
const messageText     = document.getElementById('message-text');
const sendBtn         = document.getElementById('send-btn');
const fileInput       = document.getElementById('file-input');
const uploadBtn       = document.getElementById('upload-btn');

let userRole, userId, currentChannel = 'everyone';
let pollInterval = null;

// State for messages
let allMessages = [];
let loadedCount = PAGE_SIZE;
let autoScroll  = true;
let lastSignature = '';

/** Helpers **/
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
    timeZone: NZ_TZ, year:'numeric', month:'short', day:'numeric'
  });
}

/** 1) Auth & init **/
async function checkAuth() {
  try {
    const res = await fetch('/api/auth', { credentials:'include' });
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
    console.error(e);
  }
  showLogin();
}

/** 2) Build sidebar **/
async function loadChannels() {
  const channels = [];
  let msgs, last;

  // Everyone
  msgs = await fetch(`/api/messages?channel=everyone`,{credentials:'include'}).then(r=>r.json());
  last = msgs[msgs.length-1];
  channels.push({ key:'everyone', label:'Everyone', ts:last?.timestamp||0, author:last?.authorRole||null });

  // Private chat(s)
  if (userRole === 'member') {
    const key = `private-${userId}`;
    msgs = await fetch(`/api/messages?channel=${key}`,{credentials:'include'}).then(r=>r.json());
    last = msgs[msgs.length-1];
    channels.push({ key, label:'Admin', ts:last?.timestamp||0, author:last?.authorRole||null });
  } else {
    const users = await fetch('/api/users',{credentials:'include'}).then(r=>r.json());
    for (const u of users.filter(u=>u.role==='member')) {
      const key = `private-${u.id}`;
      msgs = await fetch(`/api/messages?channel=${key}`,{credentials:'include'}).then(r=>r.json());
      last = msgs[msgs.length-1];
      channels.push({ key, label:u.username, ts:last?.timestamp||0, author:last?.authorRole||null });
    }
  }

  const [ev, ...rest] = channels;
  rest.sort((a,b)=>b.ts - a.ts);
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

/** Switch channel **/
function selectChannel(key, label) {
  currentChannel = key;
  chatTitle.textContent = label;
  document.querySelectorAll('#channel-list li').forEach(li=>
    li.classList.toggle('active', li.dataset.channel===key)
  );
  // reset message state
  loadedCount = PAGE_SIZE;
  autoScroll  = true;
  lastSignature = '';
  allMessages = [];
  renderMessages(); // clear
  loadMessages();
  loadFiles();
}

/** 3) Polling **/
function startPolling() {
  loadMessages(); loadFiles(); loadChannels();
  pollInterval = setInterval(()=>{
    loadMessages(); loadFiles(); loadChannels();
  },1000);
}

/** 4) Login **/
loginForm.onsubmit = async e => {
  e.preventDefault();
  const res = await fetch('/api/login',{
    method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      username:document.getElementById('username').value,
      password:document.getElementById('password').value
    })
  });
  if (res.ok) await checkAuth();
  else alert('Login failed');
};
logoutBtn.onclick = async ()=>{
  await fetch('/api/logout',{method:'POST',credentials:'include'});
  clearInterval(pollInterval);
  window.location = '/';
};
if (adminBtn) adminBtn.onclick = ()=>window.location = '/admin.html';

/** Input shortcuts **/
messageText.addEventListener('keydown', e=>{
  if (e.key==='Enter' && !e.ctrlKey) { e.preventDefault(); sendMessage(); }
  else if (e.key==='Enter' && e.ctrlKey) { messageText.value += '\n'; }
});
sendBtn.onclick   = sendMessage;
uploadBtn.onclick = ()=>fileInput.click();
fileInput.onchange = uploadFile;


/** 5) Load & render messages **/
async function loadMessages() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`,{credentials:'include'});
  if (!res.ok) return;
  const data = await res.json();
  data.sort((a,b)=>a.timestamp - b.timestamp);
  allMessages = data;

  // compute signature: newestTS-countPinned-loadedCount
  const newestTS   = data.length ? data[data.length-1].timestamp : 0;
  const pinnedNum  = data.filter(m=>m.pinned).length;
  const signature  = `${newestTS}-${pinnedNum}-${loadedCount}`;

  if (signature === lastSignature) return;
  lastSignature = signature;

  renderMessages();
}

function renderMessages() {
  // Pinned panel
  pinnedContainer.innerHTML = '';
  allMessages.filter(m=>m.pinned).forEach(msg=>{
    const div = makeMessageDiv(msg);
    pinnedContainer.appendChild(div.cloneNode(true));
  });

  // Feed panel
  messagesDiv.innerHTML = '';
  // take last loadedCount messages
  const slice = allMessages.slice(-loadedCount);
  let lastDate = null;
  slice.forEach(msg=>{
    const dStr = toDateStr(msg.timestamp);
    if (dStr !== lastDate) {
      lastDate = dStr;
      const hd = document.createElement('div');
      hd.className   = 'date-heading';
      hd.textContent = headingText(dStr);
      messagesDiv.appendChild(hd);
    }
    const div = makeMessageDiv(msg);
    messagesDiv.appendChild(div);
  });

  // Auto-scroll if allowed
  if (autoScroll) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

/** helper to build message element **/
function makeMessageDiv(msg) {
  const timeStr = new Date(msg.timestamp).toLocaleTimeString('en-NZ',{
    timeZone:NZ_TZ,hour:'numeric',minute:'2-digit',hour12:true
  });
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `<span class="meta">[${timeStr}] ${msg.username}:</span> ${msg.content}`;
  if (userRole==='admin'){
    const pinBtn = document.createElement('button');
    pinBtn.className   = 'pin-btn';
    pinBtn.textContent = msg.pinned ? 'Unpin' : 'Pin';
    pinBtn.onclick     = ()=>togglePin(msg.id, !msg.pinned);
    div.appendChild(pinBtn);

    const delBtn = document.createElement('button');
    delBtn.className   = 'delete-btn';
    delBtn.textContent = 'Delete';
    delBtn.onclick     = ()=>deleteMessage(msg.id);
    div.appendChild(delBtn);
  }
  return div;
}

/** Infinite scroll **/
messagesDiv.addEventListener('scroll', () => {
  // disable auto-scroll if user scrolls up even slightly
  if (messagesDiv.scrollTop + 1 < messagesDiv.scrollHeight - messagesDiv.clientHeight) {
    autoScroll = false;
  }
  // if scrolled to top, load more
  if (messagesDiv.scrollTop === 0 && allMessages.length > loadedCount) {
    const prevHeight = messagesDiv.scrollHeight;
    loadedCount += PAGE_SIZE;
    renderMessages();
    // keep viewport at same message
    const newHeight = messagesDiv.scrollHeight;
    messagesDiv.scrollTop = newHeight - prevHeight;
  }
});


/** send, pin, delete **/
async function sendMessage(){
  const c = messageText.value.trim(); if(!c)return;
  await fetch('/api/messages',{method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content:c,channel:currentChannel})
  });
  messageText.value = '';
  autoScroll = true;
  loadedCount = PAGE_SIZE;
  lastSignature = '';
  loadMessages();
}
async function togglePin(id,pinned){
  await fetch('/api/messages/pin',{method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id,pinned})
  });
  lastSignature = '';
  loadMessages();
}
async function deleteMessage(id){
  await fetch(`/api/messages?id=${id}`,{method:'DELETE',credentials:'include'});
  lastSignature = '';
  loadMessages();
}


/** 6) Shared files as cards **/
async function loadFiles(){
  const res = await fetch(`/api/messages?channel=${currentChannel}`,{credentials:'include'});
  if (!res.ok) return;
  const data = await res.json();
  filesList.innerHTML = '';

  data.forEach(msg=>{
    const m = msg.content.match(/<a href="([^"]+)" target="_blank">([^<]+)<\/a>/);
    if (!m) return;
    const [, url, fn] = m;
    const ext = fn.split('.').pop().toLowerCase();

    const a = document.createElement('a');
    a.href      = url;
    a.target    = '_blank';
    a.className = 'file-card';

    let thumb;
    if (['png','jpg','jpeg','gif','webp'].includes(ext)){
      thumb = document.createElement('img');
      thumb.src = url;
      thumb.alt = fn;
    } else {
      thumb = document.createElement('i');
      const icons = { pdf:'fa-file-pdf',doc:'fa-file-word',docx:'fa-file-word',
                      xls:'fa-file-excel',xlsx:'fa-file-excel',
                      ppt:'fa-file-powerpoint',pptx:'fa-file-powerpoint' };
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

/** upload **/
async function uploadFile(){
  const f = fileInput.files[0];
  if (!f) return alert('No file selected');
  const fm = new FormData(); fm.append('file', f);
  const r  = await fetch('/api/upload',{method:'POST',credentials:'include',body:fm});
  if (!r.ok){
    const e = await r.json().catch(()=>({}));
    return alert('Upload failed: ' + (e.error||r.status));
  }
  const { filename, url } = await r.json();
  await fetch('/api/messages',{method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content:`<a href="${url}" target="_blank">${filename}</a>`,channel:currentChannel})
  });
  fileInput.value = '';
  autoScroll = true;
  loadedCount = PAGE_SIZE;
  lastSignature = '';
  loadFiles();
  loadMessages();
}

// Kick things off
checkAuth();
