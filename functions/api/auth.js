export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  if (!token) return new Response(null, { status: 401 });
  const res = await env.D1_CESW.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  if (!res) return new Response(null, { status: 401 });
  const userRes = await env.D1_CESW.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(res.user_id).first();
  if (!userRes) return new Response(null, { status: 401 });
  return new Response(JSON.stringify({ id: userRes.id, username: userRes.username, role: userRes.role }), { status: 200 });
}