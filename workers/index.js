import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const app = new Hono()
app.use('*', async (c, next) => {
  c.set('DB', c.env.DB)
  c.set('FILES', c.env.FILES)
  await next()
})

// Helper to get user from JWT
async function authenticate(c) {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    return jwt.verify(auth.slice(7), c.env.JWT_SECRET)
  } catch {
    return null
  }
}

// --- Signup ---
app.post('/api/signup', async c => {
  const { username, password } = await c.req.json()
  if (!username || !password) {
    return c.json({ error: 'Missing fields' }, 400)
  }
  const hash = await bcrypt.hash(password, 10)
  const id = crypto.randomUUID()
  await c.env.DB.prepare(`
    INSERT INTO users (id, username, password_hash)
    VALUES (?, ?, ?)
  `).bind(id, username, hash).run()
  return c.json({ success: true })
})

// --- Login ---
app.post('/api/login', async c => {
  const { username, password } = await c.req.json()
  const { results } = await c.env.DB
    .prepare(`SELECT id, password_hash FROM users WHERE username = ?`)
    .bind(username)
    .all()
  if (!results.length) return c.json({ error: 'No such user' }, 401)
  const user = results[0]
  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) return c.json({ error: 'Invalid password' }, 401)
  const token = jwt.sign({ id: user.id, username }, c.env.JWT_SECRET, { expiresIn: '24h' })
  return c.json({ token })
})

// --- Post a message ---
app.post('/api/message', async c => {
  const user = await authenticate(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const form = await c.req.clone().formData()
  const content = form.get('content') || ''
  let file_key = null

  const file = form.get('file')
  if (file && file.name) {
    file_key = `${user.id}/${crypto.randomUUID()}-${file.name}`
    await c.env.FILES.put(file_key, file.stream())
  }

  const msgId = crypto.randomUUID()
  await c.env.DB.prepare(`
    INSERT INTO messages (id, user_id, content, file_key)
    VALUES (?, ?, ?, ?)
  `).bind(msgId, user.id, content, file_key).run()

  return c.json({ success: true })
})

// --- Fetch messages ---
app.get('/api/messages', async c => {
  const { results } = await c.env.DB
    .prepare(`
      SELECT m.id, u.username, m.content, m.file_key, m.created_at
      FROM messages m
      JOIN users u ON u.id = m.user_id
      ORDER BY m.created_at DESC
      LIMIT 100
    `)
    .all()

  const msgs = await Promise.all(results.map(async m => ({
    id: m.id,
    username: m.username,
    content: m.content,
    fileUrl: m.file_key
      ? await c.env.FILES.get(m.file_key, { type: 'url' })
      : null,
    created_at: m.created_at
  })))

  return c.json(msgs)
})

export default app
