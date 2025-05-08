// cesw_hub/admin.js

// Element refs
const userInfoDiv       = document.getElementById('user-info');
const logoutBtn         = document.getElementById('logout-btn');
const clearMessagesBtn  = document.getElementById('clear-messages-btn');
const newUsernameInput  = document.getElementById('new-username');
const newPasswordInput  = document.getElementById('new-password');
const newRoleSelect     = document.getElementById('new-role');
const createUserBtn     = document.getElementById('create-user-btn');
const tbody             = document.querySelector('#users-table tbody');

// Initialization: only admins allowed
async function init() {
  const auth = await fetch('/api/auth', { credentials:'include' });
  if (auth.status !== 200) return window.location = '/';
  const { username, role } = await auth.json();
  if (role !== 'admin') return window.location = '/';
  userInfoDiv.textContent = `Hello, ${username}`;
  bindControls();
  loadUsers();
}

function bindControls() {
  // Logout
  logoutBtn.onclick = async () => {
    await fetch('/api/logout',{method:'POST',credentials:'include'});
    window.location = '/';
  };
  // Clear all messages
  clearMessagesBtn.onclick = async () => {
    if (!confirm('Delete ALL messages?')) return;
    await fetch('/api/messages',{ method:'DELETE', credentials:'include' });
    alert('All messages deleted.');
  };
  // Create user
  createUserBtn.onclick = async () => {
    const username = newUsernameInput.value.trim();
    const password = newPasswordInput.value;
    const role     = newRoleSelect.value;
    if (!username || !password) {
      return alert('Username and password are required.');
    }
    const res = await fetch('/api/users', {
      method:     'POST',
      credentials:'include',
      headers:    {'Content-Type':'application/json'},
      body:       JSON.stringify({ username, password, role })
    });
    if (res.ok) {
      newUsernameInput.value = '';
      newPasswordInput.value = '';
      newRoleSelect.value    = 'member';
      loadUsers();
    } else {
      alert('Failed to create user.');
    }
  };
}

async function loadUsers() {
  const res = await fetch('/api/users', { credentials:'include' });
  if (!res.ok) return alert('Couldn’t load users');
  const users = await res.json();
  tbody.innerHTML = '';

  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:0.5rem; border-bottom:1px solid #eee;">${u.id}</td>
      <td style="padding:0.5rem; border-bottom:1px solid #eee;">${u.username}</td>
      ${roleCell(u)}
      <td style="padding:0.5rem; border-bottom:1px solid #eee;">
        <button class="edit-btn" data-username="${u.username}" data-id="${u.id}" style="background:none;border:none;cursor:pointer;">
          <i class="fas fa-edit"></i>
        </button>
        <button class="delete-btn" data-id="${u.id}" style="background:none;border:none;cursor:pointer;color:#c00;">
          <i class="fas fa-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Attach handlers
  tbody.querySelectorAll('.role-select').forEach(sel => {
    sel.onchange = async () => {
      const id = Number(sel.dataset.id);
      const role = sel.value;
      const r = await fetch('/api/users', {
        method:'PUT',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ id, role })
      });
      if (!r.ok) alert('Failed to update role');
      else loadUsers();
    };
  });
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = async () => {
      const id   = Number(btn.dataset.id);
      const name = btn.dataset.username;
      const pw   = prompt(`Enter new password for ${name}:`);
      if (!pw) return;
      const r = await fetch('/api/users', {
        method:'PUT',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ id, password: pw })
      });
      if (!r.ok) alert('Failed to update password');
      else loadUsers();
    };
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.id);
      if (!confirm(`Delete user ID ${id}?`)) return;
      const r = await fetch(`/api/users?id=${id}`, {
        method:'DELETE',credentials:'include'
      });
      if (!r.ok) alert('Failed to delete user');
      else loadUsers();
    };
  });
}

function roleCell(u) {
  if (u.role === 'admin') {
    return `<td style="padding:0.5rem; border-bottom:1px solid #eee;">Admin</td>`;
  } else {
    return `<td style="padding:0.5rem; border-bottom:1px solid #eee;">
      <select class="role-select" data-id="${u.id}" style="padding:0.25rem; border:1px solid #ccc; border-radius:4px;">
        <option value="member"${u.role==='member'?' selected':''}>Member</option>
        <option value="admin"${u.role==='admin'?' selected':''}>Admin</option>
      </select>
    </td>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
