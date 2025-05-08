// File: cesw_hub/functions/api/upload.js

export async function onRequestPost({ request, env }) {
  // — Authenticate & authorize —
  const cookie = request.headers.get('Cookie') || '';
  const token  = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  const session = await env.D1_CESW
    .prepare('SELECT user_id FROM sessions WHERE token = ?')
    .bind(token)
    .first();
  if (!session) return new Response(null, { status: 401 });

  const user = await env.D1_CESW
    .prepare('SELECT role FROM users WHERE id = ?')
    .bind(session.user_id)
    .first();
  if (!user || user.role !== 'admin') return new Response(null, { status: 403 });

  // — Handle file upload to R2 —
  const form = await request.formData();
  const file = form.get('file');
  if (!file) return new Response(JSON.stringify({ error: 'No file provided' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });

  const arrayBuffer = await file.arrayBuffer();
  await env.CESW_Hub_Bucket.put(file.name, arrayBuffer, {
    httpMetadata: { contentType: file.type }
  });

  // Construct the public URL
  const url = `https://webchat.danieltesting.space/${encodeURIComponent(file.name)}`;

  // Return the filename + URL
  return new Response(JSON.stringify({ filename: file.name, url }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestGet({ request, env }) {
  // List all objects in the bucket
  const { objects } = await env.CESW_Hub_Bucket.list();
  const files = objects.map(o => ({
    filename: o.key,
    url: `https://webchat.danieltesting.space/${encodeURIComponent(o.key)}`
  }));
  return new Response(JSON.stringify(files), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
