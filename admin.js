const userForm = document.getElementById('user-form');
const usersList = document.getElementById('users-list');
const deleteAllBtn = document.getElementById('delete-all');
const logoutBtn = document.getElementById('logout-btn');

logoutBtn.onclick = async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/';
};

userForm.onsubmit = async e => {
  e.preventDefault();
  const id = document.getElementById('user-id').value;
  const username = document.getElementById('new-username').value;
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;
  const method = id ? 'PUT' : 'POST';
  const url = '/api/users' + (id ? `?id=${id}` : '');
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role })
  });
  if (res.ok) {
    loadUsers();
    userForm.reset();
  }
};

deleteAllBtn.onclick = async () => {
  await fetch('/api/messages?all=true', { method: 'DELETE' });
  alert('All messages deleted.');
};

async function loadUsers() {
  const res = await fetch('/api/users');
  const data = await res.json();
  usersList.innerHTML = '';
  data.forEach(u => {
    const li = document.createElement('li');
    li.textContent = `${u.username} (${u.role})`;
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => {
      document.getElementById('user-id').value = u.id;
      document.getElementById('new-username').value = u.username;
      document.getElementById('new-role').value = u.role;
    };
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.onclick = async () => {
      await fetch(`/api/users?id=${u.id}`, { method: 'DELETE' });
      loadUsers();
    };
    li.appendChild(editBtn);
    li.appendChild(delBtn);
    usersList.appendChild(li);
  });
}

loadUsers();