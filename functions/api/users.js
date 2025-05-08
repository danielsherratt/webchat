export async function onRequest({ request, env }) {
  // Authenticate session
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  const session = await env.D1_CESW.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  if (!session) return new Response(null, { status: 401 });

  // Only admins allowed
  const user = await env.D1_CESW.prepare('SELECT role FROM users WHERE id = ?')
    .bind(session.user_id)
    .first();
  if (!user || user.role !== 'admin') return new Response(null, { status: 403 });

  const url = new URL(request.url);
  const idParam = parseInt(url.searchParams.get('id'), 10);

  if (request.method === 'GET') {
    const res = await env.D1_CESW.prepare('SELECT id, username, role FROM users').all();
    return new Response(JSON.stringify(res.results), { status: 200 });

  } else if (request.method === 'POST') {
    const { username, password, role } = await request.json();
    await env.D1_CESW
      .prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
      .bind(username, password, role)
      .run();
    return new Response(null, { status: 201 });

  } else if (request.method === 'PUT') {
    if (!idParam) {
      return new Response(JSON.stringify({ error: 'Missing or invalid id' }), { status: 400 });
    }
    const { username, password, role } = await request.json();
    const sql = 'UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?';
    try {
      await env.D1_CESW.prepare(sql).bind(username, password, role, idParam).run();
      return new Response(null, { status: 204 });
    } catch (err) {
      console.error('D1 update error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }

  } else if (request.method === 'DELETE') {
    if (!idParam) {
      return new Response(JSON.stringify({ error: 'Missing or invalid id' }), { status: 400 });
    }
    await env.D1_CESW.prepare('DELETE FROM users WHERE id = ?').bind(idParam).run();
    return new Response(null, { status: 204 });

  } else {
    return new Response(null, { status: 405 });
  }
}
