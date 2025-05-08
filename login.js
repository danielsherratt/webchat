document.getElementById('loginForm').onsubmit = async e => {
  e.preventDefault();
  const form = e.target;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: form.username.value,
      password: form.password.value
    })
  });
  const j = await res.json();
  if (j.token) {
    localStorage.setItem('token', j.token);
    location.href = 'index.html';
  } else {
    alert(j.error);
  }
};