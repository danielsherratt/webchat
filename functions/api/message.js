// Authenticate via session cookie and insert message
export async function onRequestPost({ request, env }) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|; )session=([^;]+)/);
  if (!match) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const token = match[1];

  const { results } = await env.DB.prepare(
    `SELECT user_id FROM sessions WHERE token = ? AND expire_at > datetime('now')`
  ).bind(token).all();
  if (!results.length) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const userId = results[0].user_id;

  // Handle message content and optional file
  const form = await request.formData();
  const content = form.get('content') || '';
  let fileKey = null;
  const file = form.get('file');
  if (file && file.name) {
    fileKey = `${userId}/${crypto.randomUUID()}-${file.name}`;
    await env.FILES.put(fileKey, file.stream());
  }

  await env.DB.prepare(
    `INSERT INTO messages (id, user_id, content, file_key)
     VALUES (?, ?, ?, ?)`
  )
  .bind(crypto.randomUUID(), userId, content, fileKey)
  .run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}