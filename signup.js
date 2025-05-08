document.getElementById('signupForm').onsubmit = async e => {
  e.preventDefault();
  const form = e.target;
  if (form.password.value !== form.confirmPassword.value) {
    alert('Passwords do not match');
    return;
  }
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: form.username.value,
      password: form.password.value
    })
  });
  const j = await res.json();
  if (j.success) {
    alert('Sign‑up successful! Please log in.');
    location.href = 'login.html';
  } else {
    alert(j.error || 'Sign‑up failed');
  }
};
