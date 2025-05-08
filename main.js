// cesw_hub/main.js

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

// show/hide
const showLogin = () => {
  loginContainer.style.display = 'block';
  chatContainer.style.display  = 'none';
};
const showChat = () => {
  loginContainer.style.display = 'none';
  chatContainer.style.display  = 'flex';
};

// 1) Auth & initial setup
async function checkAuth() {
  const res = await fetch('/api/auth', { credentials:'include' });
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
  showLogin();
}

// 2) Build & sort channel list
async function loadChannels() {
  const channels = [];
  // Everyone
  let msgs = await fetch(`/api/messages?channel=everyone`, { credentials:'include' }).then(r => r.json());
  let last = msgs[msgs.length - 1];
  channels.push({
    key:     'everyone',
    label:   'Everyone',
    ts:      last?.timestamp || 0,
    author:  last?.authorRole || null
  });

  if (userRole === 'member') {
    // one private chat: with admins
    const key = `private-${userId}`;
    msgs = await fetch(`/api/messages?channel=${key}`, { credentials:'include' }).then(r => r.json());
    last = msgs[msgs.length -1];
    channels.push({
      key,
      label: 'Admin',
      ts:    last?.timestamp || 0,
      author:last?.authorRole || null
    });
  } else {
    // admin: one per member
    const users = await fetch('/api/users', { credentials:'include' }).then(r => r.json());
    for (const u of users.filter(u=>u.role==='member')) {
      const key = `private-${u.id}`;
      msgs = await fetch(`/api/messages?channel=${key}`, { credentials:'include' }).then(r => r.json());
      last = msgs[msgs.length -1];
      channels.push({
        key,
        label: u.username,
        ts:    last?.timestamp || 0,
        author:last?.authorRole || null
      });
    }
  }

  // sort except keep Everyone at front
  const [everyone, ...rest] = channels;
  rest.sort((a,b)=> b.ts - a.ts);
  const sorted = [everyone, ...rest];

  // render
  channelList.innerHTML = '';
  for (const ch of sorted) {
    const li = document.createElement('li');
    // append '*' if last author was a member
    li.textContent = ch.label + (ch.author === 'member' ? ' *' : '');
    li.dataset.channel = ch.key;
    if (ch.key === currentChannel) li.classList.add('active');
    if (ch.author === 'member') li.classList.add('bold');
    li.onclick = () => selectChannel(ch.key, ch.label);
    channelList.appendChild(li);
  }
}

// channel switch
function selectChannel(key, label) {
  currentChannel = key;
  chatTitle.textContent = label;
  document.querySelectorAll('#channel-list li').forEach(li=>{
    li.classList.toggle('active', li.dataset.channel === key);
  });
  loadMessages();
  loadFiles();
}

// 3) Polling
function startPolling() {
  loadMessages();
  loadFiles();
  messageInterval = setInterval(()=>{
    loadMessages();
    loadFiles();
    loadChannels();
  }, 1000);
}

// 4) Login
loginForm.onsubmit = async e => {
  e.preventDefault();
  const res = await fetch('/api/login', {
    method:     'POST',
    credentials:'include',
    headers:    {'Content-Type':'application/json'},
    body:       JSON.stringify({
      username:document.getElementById('username').value,
      password:document.getElementById('password').value
    })
  });
  if (res.ok) await checkAuth();
  else alert('Login failed');
};

// Logout
logoutBtn.onclick = async () => {
  await fetch('/api/logout',{method:'POST',credentials:'include'});
  clearInterval(messageInterval);
  showLogin();
};

// message input
messageText.onkeydown = e => {
  if (e.key==='Enter' && !e.ctrlKey) {
    e.preventDefault(); sendMessage();
  } else if (e.key==='Enter'&&e.ctrlKey) {
    messageText.value+='\n';
  }
};
sendBtn.onclick = sendMessage;
uploadBtn.onclick = ()=>fileInput.click();
fileInput.onchange = uploadFile;

// loadMessages (oldest→newest, scroll bottom)
async function loadMessages() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`, {credentials:'include'});
  if (!res.ok) return;
  const data = await res.json();

  pinnedContainer.innerHTML = '';
  messagesDiv.innerHTML     = '';

  data.forEach(msg=>{
    const div = document.createElement('div');
    div.className='message';
    div.innerHTML=`
      <span class="meta">[${new Date(msg.timestamp)
        .toLocaleString('en-NZ',{timeZone:'Pacific/Auckland'})}] 
        ${msg.username}:</span> ${msg.content}`;
    if (userRole==='admin') {
      const p=document.createElement('button');p.textContent=msg.pinned?'Unpin':'Pin';
      p.className='pin-btn';p.onclick=()=>togglePin(msg.id,!msg.pinned);
      div.appendChild(p);
      const d=document.createElement('button');d.textContent='Delete';
      d.className='delete-btn';d.onclick=()=>deleteMessage(msg.id);
      div.appendChild(d);
    }
    msg.pinned? pinnedContainer.appendChild(div): messagesDiv.appendChild(div);
  });

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// send
async function sendMessage() {
  const c=messageText.value.trim(); if(!c)return;
  await fetch('/api/messages',{
    method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content:c,channel:currentChannel})
  });
  messageText.value=''; loadMessages();
}

// pin/unpin
async function togglePin(id,p) {
  await fetch('/api/messages/pin',{method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id,pinned:p})
  });
  loadMessages();
}

// delete
async function deleteMessage(id) {
  await fetch(`/api/messages?id=${id}`,{method:'DELETE',credentials:'include'});
  loadMessages();
}

// load files per channel
async function loadFiles() {
  const res = await fetch(`/api/messages?channel=${currentChannel}`,{credentials:'include'});
  if(!res.ok)return;
  const data = await res.json();
  filesList.innerHTML='';
  data.forEach(msg=>{
    const m = msg.content.match(/<a href="([^"]+)" target="_blank">([^<]+)<\/a>/);
    if (!m) return;
    const [_,url,fn]=m;
    const key = decodeURIComponent(url.split('/').pop());
    const ext = fn.split('.').pop().toLowerCase();

    const li=document.createElement('li');li.className='file-item';
    let thumb;
    if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
      thumb=document.createElement('img');
      thumb.src=url;thumb.className='file-thumb';
    } else {
      thumb=document.createElement('i');
      const map={pdf:'fa-file-pdf',doc:'fa-file-word',docx:'fa-file-word',
                 xls:'fa-file-excel',xlsx:'fa-file-excel',
                 ppt:'fa-file-powerpoint',pptx:'fa-file-powerpoint'};
      thumb.className=`file-icon fas ${map[ext]||'fa-file'}`;
    }
    li.appendChild(thumb);

    const ns=document.createElement('span');ns.className='file-name';
    ns.innerHTML=`<a href="${url}" target="_blank">${fn}</a>`;
    li.appendChild(ns);

    if(userRole==='admin'){
      const db=document.createElement('button');db.className='file-delete';
      db.textContent='×';db.onclick=async()=>{
        if(!confirm(`Delete ${fn}?`))return;
        await fetch(`/api/upload?key=${encodeURIComponent(key)}`,{
          method:'DELETE',credentials:'include'
        });
        loadFiles();
      };
      li.appendChild(db);
    }

    filesList.appendChild(li);
  });
}

// upload
async function uploadFile() {
  const f=fileInput.files[0];if(!f)return alert('No file');
  const fm=new FormData();fm.append('file',f);
  const r=await fetch('/api/upload',{method:'POST',credentials:'include',body:fm});
  if(!r.ok){const e=await r.json().catch(()=>({})); return alert('Upload failed: '+(e.error||r.status));}
  const { filename, url } = await r.json();
  await fetch('/api/messages',{method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content:`<a href="${url}" target="_blank">${filename}</a>`,channel:currentChannel})
  });
  fileInput.value=''; loadFiles(); loadMessages();
}

// kick off
checkAuth();
