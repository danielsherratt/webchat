// functions/api/login.js

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();

  // 1) Verify credentials against your users table
  const userRow = await env.D1_CESW
    .prepare(`SELECT id, password, role FROM users WHERE username = ?`)
    .bind(username)
    .first();
  if (!userRow || userRow.password !== password) {
    return new Response('Invalid credentials', { status: 401 });
  }

  // 2) Create a session token
  const token = crypto.randomUUID();
  // Store username->token mapping in KV or Durable Object; here using R2 as example
  await env.SESSIONS.put(token, JSON.stringify({
    id: userRow.id,
    username,
    role: userRow.role
  }), { expirationTtl: 60 * 60 * 24 }); // 1 day

  // 3) Set a secure, httpOnly cookie
  const headers = new Headers({
    'Set-Cookie': [
      `session=${token}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=None',
      'Max-Age=86400'
    ].join('; '),
    'Content-Type': 'application/json'
  });

  return new Response(JSON.stringify({ id: userRow.id, username, role: userRow.role }), {
    status: 200,
    headers
  });
}
