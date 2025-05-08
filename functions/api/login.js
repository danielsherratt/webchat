// File: cesw_hub/functions/api/login.js

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  const res = await env.D1_CESW
    .prepare('SELECT id, password, role FROM users WHERE username = ?')
    .bind(username)
    .all();
  const user = res.results[0];
  if (!user || user.password !== password) {
    return new Response(
      JSON.stringify({ error: 'Invalid credentials' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = crypto.randomUUID();
  await env.D1_CESW
    .prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)')
    .bind(token, user.id)
    .run();

  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    [
      `token=${token}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=None'
    ].join('; ')
  );

  return new Response(
    JSON.stringify({ message: 'Logged in', role: user.role }),
    { status: 200, headers }
  );
}
