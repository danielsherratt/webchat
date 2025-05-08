import bcrypt from 'bcryptjs';

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  const { results } = await env.DB.prepare(`
    SELECT id, password_hash FROM users WHERE username = ?
  `)
  .bind(username)
  .all();

  if (!results.length) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const user = results[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Bad credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // create session token
  const token = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO sessions (token, user_id, expire_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `)
  .bind(token, user.id)
  .run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
    }
  });
}