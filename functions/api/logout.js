export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  if (token) {
    await env.D1_CESW.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  const headers = new Headers();
  headers.append('Set-Cookie', 'token=; Path=/; HttpOnly; Max-Age=0');
  return new Response(null, { status: 204, headers });
}