// File: cesw_hub/functions/api/messages/pin.js

export async function onRequestPost({ request, env }) {
  // Authenticate
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  const session = await env.D1_CESW
    .prepare('SELECT user_id FROM sessions WHERE token = ?')
    .bind(token)
    .first();
  if (!session) return new Response(null, { status: 401 });

  // Authorize admin
  const user = await env.D1_CESW
    .prepare('SELECT role FROM users WHERE id = ?')
    .bind(session.user_id)
    .first();
  if (!user || user.role !== 'admin') return new Response(null, { status: 403 });

  // Validate and update
  const { id, pinned } = await request.json();
  if (typeof id === 'undefined' || typeof pinned !== 'boolean') {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid id or pinned flag' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  await env.D1_CESW
    .prepare('UPDATE messages SET pinned = ? WHERE id = ?')
    .bind(pinned ? 1 : 0, id)
    .run();

  return new Response(JSON.stringify({ message: 'Pin updated' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
