// File: cesw_hub/functions/api/upload.js

export async function onRequestPost({ request, env }) {
  // 1) Auth & admin check
  const cookie = request.headers.get('Cookie') || '';
  const token  = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers:{'Content-Type':'application/json'} });

  const session = await env.D1_CESW
    .prepare('SELECT user_id FROM sessions WHERE token = ?')
    .bind(token)
    .first();
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers:{'Content-Type':'application/json'} });

  const user = await env.D1_CESW
    .prepare('SELECT role FROM users WHERE id = ?')
    .bind(session.user_id)
    .first();
  if (!user || user.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers:{'Content-Type':'application/json'} });

  // 2) Receive file
  const form = await request.formData();
  const file = form.get('file');
  if (!file) return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers:{'Content-Type':'application/json'} });

  // 3) Generate random key + original name
  const uuid = crypto.randomUUID();
  const key  = `${uuid}_${file.name}`;

  // 4) Upload to R2
  const arrayBuffer = await file.arrayBuffer();
  try {
    await env.CESW_Hub_Bucket.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers:{'Content-Type':'application/json'} });
  }

  // 5) Return key + original filename + public URL
  const url = `https://webchat.danieltesting.space/${encodeURIComponent(key)}`;
  return new Response(JSON.stringify({ key, filename: file.name, url }), {
    status: 201,
    headers: { 'Content-Type':'application/json' }
  });
}

export async function onRequestGet({ request, env }) {
  // List & return key + filename + URL
  const { objects } = await env.CESW_Hub_Bucket.list();
  const files = objects.map(o => {
    const [, ...parts] = o.key.split('_');
    const filename = parts.join('_');
    return {
      key: o.key,
      filename,
      url: `https://webchat.danieltesting.space/${encodeURIComponent(o.key)}`
    };
  });
  return new Response(JSON.stringify(files), {
    status: 200,
    headers: { 'Content-Type':'application/json' }
  });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return new Response(JSON.stringify({ error: 'Missing key' }), { status: 400, headers:{'Content-Type':'application/json'} });

  // Auth & admin check (repeat from above)...
  const cookie = request.headers.get('Cookie') || '';
  const token  = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers:{'Content-Type':'application/json'} });

  const session = await env.D1_CESW.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  const user = session && await env.D1_CESW.prepare('SELECT role FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user || user.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers:{'Content-Type':'application/json'} });

  // Delete from R2
  await env.CESW_Hub_Bucket.delete(key);
  return new Response(JSON.stringify({ message: 'Deleted', key }), {
    status: 200,
    headers: { 'Content-Type':'application/json' }
  });
}
