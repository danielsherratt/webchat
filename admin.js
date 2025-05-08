// cesw_hub/admin.js

const userInfoDiv = document.getElementById('user-info');
const logoutBtn   = document.getElementById('logout-btn');
const tbody       = document.querySelector('#users-table tbody');

async function init() {
  // Check auth & role
  const auth = await fetch('/api/auth', { credentials: 'include' });
  if (auth.status !== 200) return window.location = '/';
  const { username, role } = await auth.json();
  if (role !== 'admin') return window.location = '/';
  userInfoDiv.textContent = `Hello, ${username}`;
  loadUsers();
}

async function loadUsers() {
  const res = await fetch('/api/users', { credentials: 'include' });
  if (!res.ok) return alert('Failed to load users');
  const users = await res.json();
  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:0.5rem; border-bottom:1px solid #eee;">${u.username}</td>
      <td style="padding:0.5rem; border-bottom:1px solid #eee;">${u.role}</td>
      <td style="padding:0.5rem; border-bottom:1px solid #eee;">
        <button class="edit-btn" data-id="${u.id}" style="margin-right:0.5rem;">Edit</button>
        <button class="delete-btn" data-id="${u.id}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
  attachUserActions();
}

function attachUserActions() {
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const pw = prompt('Enter new password for user ID ' + id + ':');
      if (!pw) return;
      const r = await fetch('/api/users', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: pw })
      });
      if (r.ok) loadUsers();
      else alert('Failed to update password');
    };
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      if (!confirm('Delete user ID ' + id + '?')) return;
      const r = await fetch(`/api/users?id=${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (r.ok) loadUsers();
      else alert('Failed to delete user');
    };
  });
}

logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  window.location = '/';
};

document.addEventListener('DOMContentLoaded', init);
