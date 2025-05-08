export async function onRequest({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  const session = await env.D1_CESW.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  if (!session) return new Response(null, { status: 401 });
  const user = await env.D1_CESW.prepare('SELECT role FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user || user.role !== 'admin') return new Response(null, { status: 403 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  
  if (request.method === 'GET') {
    const res = await env.D1_CESW.prepare('SELECT id, username, role FROM users').all();
    return new Response(JSON.stringify(res.results), { status: 200 });
  } else if (request.method === 'POST') {
    const { username, password, role } = await request.json();
    await env.D1_CESW.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').bind(username, password, role).run();
    return new Response(null, { status: 201 });
  } else if (request.method === 'PUT') {
    const { username, password, role } = await request.json();
    await env.D1_CESW.prepare(\`UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?\`).bind(username, password, role, id).run();
    return new Response(null, { status: 204 });
  } else if (request.method === 'DELETE') {
    await env.D1_CESW.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204 });
  }
}