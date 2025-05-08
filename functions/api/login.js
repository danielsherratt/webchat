// Use Web Crypto API to verify SHA-256 hashed password
export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  const { results } = await env.DB.prepare(
    `SELECT id, password_hash FROM users WHERE username = ?`
  ).bind(username).all();

  if (!results.length) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const user = results[0];
  // Hash provided password
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  if (hashHex !== user.password_hash) {
    return new Response(JSON.stringify({ error: 'Bad credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Create session token
  const token = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expire_at)
     VALUES (?, ?, datetime('now', '+1 day'))`
  )
  .bind(token, user.id)
  .run();

  // Set HttpOnly cookie
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
    }
  });
}