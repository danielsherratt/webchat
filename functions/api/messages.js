// functions/api/messages.js

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1) Authenticate via /api/auth
  const authRes = await fetch(`${url.origin}/api/auth`, {
    credentials: 'include',
    headers: { 'Cookie': request.headers.get('Cookie') }
  });
  if (authRes.status !== 200) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { username, role } = await authRes.json();

  // 2) Handle PIN/UNPIN
  if (url.pathname.endsWith('/api/messages/pin') && request.method === 'POST') {
    if (role !== 'admin') {
      return new Response('Forbidden', { status: 403 });
    }
    const { id, pinned } = await request.json();
    await env.D1_CESW
      .prepare(`UPDATE messages SET pinned = ? WHERE id = ?`)
      .bind(pinned ? 1 : 0, id)
      .run();
    return new Response(JSON.stringify({ id, pinned }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3) Handle /api/messages
  if (url.pathname.endsWith('/api/messages')) {
    // 3a) GET: list messages for a channel
    if (request.method === 'GET') {
      const channel = url.searchParams.get('channel');
      // Restrict private channel access
      if (channel.startsWith('private-')) {
        const [, targetId] = channel.split('-');
        if (role === 'member' && String(targetId) !== String(username) && role !== 'admin') {
          return new Response('Forbidden', { status: 403 });
        }
      }

      const { results } = await env.D1_CESW
        .prepare(`
          SELECT
            m.id,
            m.username,
            m.content,
            m.channel,
            m.pinned,
            m.timestamp,
            u.role AS authorRole
          FROM messages m
          LEFT JOIN users u ON m.username = u.username
          WHERE m.channel = ?
          ORDER BY m.timestamp ASC
        `)
        .bind(channel)
        .all();

      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3b) POST: create a new message
    if (request.method === 'POST') {
      const { content, channel } = await request.json();
      // Store UTC timestamp
      const timestamp = new Date().toISOString();
      await env.D1_CESW
        .prepare(`
          INSERT INTO messages (username, content, channel, pinned, timestamp)
          VALUES (?, ?, ?, 0, ?)
        `)
        .bind(username, content, channel, timestamp)
        .run();

      return new Response(null, { status: 201 });
    }

    // 3c) DELETE: delete a message by ID (admins only)
    if (request.method === 'DELETE') {
      if (role !== 'admin') {
        return new Response('Forbidden', { status: 403 });
      }
      const id = url.searchParams.get('id');
      await env.D1_CESW
        .prepare(`DELETE FROM messages WHERE id = ?`)
        .bind(id)
        .run();
      return new Response(null, { status: 204 });
    }
  }

  return new Response('Not Found', { status: 404 });
}
