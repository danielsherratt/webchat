// functions/api/auth.js

export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const match  = cookie.match(/session=([^;]+)/);

  if (!match) {
    return new Response('Unauthorized', { status: 401 });
  }
  const token = match[1];
  const data  = await env.SESSIONS.get(token);
  if (!data) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id, username, role } = JSON.parse(data);
  return new Response(JSON.stringify({ id, username, role }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
