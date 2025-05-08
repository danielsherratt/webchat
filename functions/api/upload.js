// cesw_hub/functions/api/upload.js

export async function onRequestPost({ request, env }) {
  // Ensure R2 binding
  if (!env.CESW_Hub_Bucket) {
    return new Response(
      JSON.stringify({ error: 'R2 bucket binding not found' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Auth & admin check
  const cookie = request.headers.get('Cookie') || '';
  const token  = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  const session = token && await env.D1_CESW
    .prepare('SELECT user_id FROM sessions WHERE token = ?')
    .bind(token)
    .first();
  const user = session && await env.D1_CESW
    .prepare('SELECT role FROM users WHERE id = ?')
    .bind(session.user_id)
    .first();
  if (!user || user.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Receive file
  const form = await request.formData();
  const file = form.get('file');
  if (!file) {
    return new Response(
      JSON.stringify({ error: 'No file provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Generate random key + original name
  const uuid = crypto.randomUUID();
  const key  = `${uuid}_${file.name}`;
  const buffer = await file.arrayBuffer();

  // Upload
  try {
    await env.CESW_Hub_Bucket.put(key, buffer, {
      httpMetadata: { contentType: file.type }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = `https://webchat.danieltesting.space/${encodeURIComponent(key)}`;
  return new Response(
    JSON.stringify({ key, filename: file.name, url }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function onRequestGet({ request, env }) {
  if (!env.CESW_Hub_Bucket) {
    return new Response(
      JSON.stringify({ error: 'R2 bucket binding not found' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
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
  return new Response(
    JSON.stringify(files),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return new Response(
      JSON.stringify({ error: 'Missing key' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Auth & admin check
  const cookie = request.headers.get('Cookie') || '';
  const token  = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  const session = token && await env.D1_CESW.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  const user = session && await env.D1_CESW.prepare('SELECT role FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user || user.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  await env.CESW_Hub_Bucket.delete(key);
  return new Response(
    JSON.stringify({ message: 'Deleted', key }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
