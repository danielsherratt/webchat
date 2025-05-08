import bcrypt from 'bcryptjs';

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  // 1. look up user
  const { results } = await env.DB.prepare(
    `SELECT id, password_hash FROM users WHERE username = ?`
  ).bind(username).all();
  if (!results.length) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 401, headers:{ 'Content-Type':'application/json' }
    });
  }
  const user = results[0];
  // 2. verify password
  if (!(await bcrypt.compare(password, user.password_hash))) {
    return new Response(JSON.stringify({ error: 'Bad credentials' }), {
      status: 401, headers:{ 'Content-Type':'application/json' }
    });
  }
  // 3. create session token
  const token = crypto.randomUUID();
  // expire in 24h
  await env.DB.prepare(`
    INSERT INTO sessions (token, user_id, expire_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).bind(token, user.id).run();
  // 4. return as HttpOnly cookie
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
    }
  });
}
