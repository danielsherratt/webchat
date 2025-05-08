// File: cesw_hub/functions/api/upload.js

export async function onRequestPost({ request, env }) {
  // Debugging
  console.log('upload POST invoked');

  // Ensure binding exists
  if (!env.CESW_Hub_Bucket) {
    console.error('R2 binding missing: CESW_Hub_Bucket');
    return new Response(
      JSON.stringify({ error: 'R2 bucket binding not found' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Authenticate
    const cookie = request.headers.get('Cookie') || '';
    const token = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
    if (!token) throw new Error('No session token');

    const session = await env.D1_CESW
      .prepare('SELECT user_id FROM sessions WHERE token = ?')
      .bind(token)
      .first();
    if (!session) throw new Error('Invalid session');

    const user = await env.D1_CESW
      .prepare('SELECT role FROM users WHERE id = ?')
      .bind(session.user_id)
      .first();
    if (!user || user.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle file upload
    const form = await request.formData();
    const file = form.get('file');
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const arrayBuffer = await file.arrayBuffer();

    // Upload to R2
    await env.CESW_Hub_Bucket.put(file.name, arrayBuffer, {
      httpMetadata: { contentType: file.type }
    });

    // Construct public URL
    const url = `https://webchat.danieltesting.space/${encodeURIComponent(
      file.name
    )}`;

    return new Response(
      JSON.stringify({ filename: file.name, url }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Upload POST error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestGet({ request, env }) {
  console.log('upload GET invoked');

  // Ensure binding exists
  if (!env.CESW_Hub_Bucket) {
    console.error('R2 binding missing: CESW_Hub_Bucket');
    return new Response(
      JSON.stringify({ error: 'R2 bucket binding not found' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // List all objects in R2
    const { objects } = await env.CESW_Hub_Bucket.list();
    const files = objects.map(o => ({
      filename: o.key,
      url: `https://webchat.danieltesting.space/${encodeURIComponent(
        o.key
      )}`
    }));

    return new Response(
      JSON.stringify(files),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Upload GET error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
