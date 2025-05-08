const token = localStorage.getItem('token')
if (!token) location.href = '/login.html'

const feed = document.getElementById('feed')
const form = document.getElementById('postForm')

async function loadMessages() {
  const res = await fetch('/api/messages', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  const msgs = await res.json()
  feed.innerHTML = msgs.map(m => `
    <div class="msg">
      <strong>${m.username}</strong> <em>${new Date(m.created_at).toLocaleString()}</em>
      <p>${m.content}</p>
      ${m.fileUrl ? `<a href="${m.fileUrl}" target="_blank">📎 download</a>` : ''}
    </div>
  `).join('')
  // newest is at top; scroll to bottom so you see the earliest of the batch
  window.scrollTo(0, document.body.scrollHeight)
}

form.onsubmit = async e => {
  e.preventDefault()
  const data = new FormData(form)
  await fetch('/api/message', {
    method:'POST',
    headers:{ 'Authorization': 'Bearer ' + token },
    body: data
  })
  form.reset()
  loadMessages()
}

loadMessages()
setInterval(loadMessages, 30_000) // refresh every 30s
