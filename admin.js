// cesw_hub/admin.js

const userForm = document.getElementById('user-form');
const usersTableBody = document.querySelector('#users-table tbody');
const deleteAllBtn = document.getElementById('delete-all');
const logoutBtn = document.getElementById('logout-btn');

logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '/';
};

userForm.onsubmit = async e => {
  e.preventDefault();
  const id = document.getElementById('user-id').value;
  const username = document.getElementById('new-username').value;
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;
  const method = id ? 'PUT' : 'POST';
  const url = '/api/users' + (id ? `?id=${id}` : '');
  await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role })
  });
  loadUsers();
  userForm.reset();
};

deleteAllBtn.onclick = async () => {
  if (!confirm('Are you sure you want to delete ALL messages?')) return;
  await fetch('/api/messages?all=true', {
    method: 'DELETE',
    credentials: 'include'
  });
  alert('All messages deleted.');
};

async function loadUsers() {
  const res = await fetch('/api/users', { credentials: 'include' });
  if (!res.ok) return window.location.href = '/';
  const data = await res.json();
  usersTableBody.innerHTML = '';
  data.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td class="action-btns">
        <button class="edit-btn">Edit</button>
        <button class="del-btn">Delete</button>
      </td>
    `;
    tr.querySelector('.edit-btn').onclick = () => {
      document.getElementById('user-id').value = u.id;
      document.getElementById('new-username').value = u.username;
      document.getElementById('new-role').value = u.role;
    };
    tr.querySelector('.del-btn').onclick = async () => {
      if (!confirm(`Delete user ${u.username}?`)) return;
      await fetch(`/api/users?id=${u.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      loadUsers();
    };
    usersTableBody.appendChild(tr);
  });
}

loadUsers();
