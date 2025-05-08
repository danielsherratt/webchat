export async function onRequestPost({ request, env }) {
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
  
    // Get pin data
    const { id, pinned } = await request.json();
    if (!id || typeof pinned !== 'boolean') {
      return new Response(JSON.stringify({ error: 'Missing or invalid id or pinned flag' }), { status: 400 });
    }
  
    // Update pinned state
    await env.D1_CESW
      .prepare('UPDATE messages SET pinned = ? WHERE id = ?')
      .bind(pinned ? 1 : 0, id)
      .run();
  
    return new Response(null, { status: 204 });
  }
  