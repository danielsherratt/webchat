// cesw_hub/functions/api/messages.js

export async function onRequest({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const token  = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  const session = await env.D1_CESW
    .prepare('SELECT user_id FROM sessions WHERE token = ?')
    .bind(token)
    .first();
  if (!session) return new Response(null, { status: 401 });

  const user = await env.D1_CESW
    .prepare('SELECT username, role FROM users WHERE id = ?')
    .bind(session.user_id)
    .first();
  if (!user) return new Response(null, { status: 401 });

  const url     = new URL(request.url);
  const channel = url.searchParams.get('channel');
  const all     = url.searchParams.get('all');

  if (request.method === 'GET') {
    const res = await env.D1_CESW.prepare(`
      SELECT
        messages.id,
        users.username,
        users.role   AS authorRole,
        channel,
        content,
        timestamp,
        pinned
      FROM messages
      JOIN users ON messages.user_id = users.id
      WHERE channel = ?
      ORDER BY timestamp ASC
    `).bind(channel).all();

    return new Response(JSON.stringify(res.results), {
      status: 200,
      headers: { 'Content-Type':'application/json' }
    });
  } else if (request.method === 'POST') {
    // pin endpoint
    if (url.pathname.endsWith('/pin')) {
      const { id, pinned } = await request.json();
      await env.D1_CESW
        .prepare('UPDATE messages SET pinned = ? WHERE id = ?')
        .bind(pinned ? 1 : 0, id)
        .run();
      return new Response(null, { status: 204 });
    }
    // new message
    const { content, channel } = await request.json();
    await env.D1_CESW
      .prepare('INSERT INTO messages (user_id, channel, content) VALUES (?, ?, ?)')
      .bind(session.user_id, channel, content)
      .run();
    return new Response(null, { status: 201 });

  } else if (request.method === 'DELETE') {
    if (all) {
      await env.D1_CESW.prepare('DELETE FROM messages').run();
    } else {
      const id = url.searchParams.get('id');
      await env.D1_CESW
        .prepare('DELETE FROM messages WHERE id = ?')
        .bind(id)
        .run();
    }
    return new Response(null, { status: 204 });

  } else {
    return new Response(null, { status: 405 });
  }
}
