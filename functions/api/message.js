import jwt from 'jsonwebtoken';

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  let user;
  try {
    user = jwt.verify(auth.slice(7), env.JWT_SECRET);
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();
  const content = form.get('content') || '';
  let fileKey = null;

  const file = form.get('file');
  if (file && file.name) {
    fileKey = `${user.id}/${crypto.randomUUID()}-${file.name}`;
    await env.FILES.put(fileKey, file.stream());
  }

  const msgId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO messages (id, user_id, content, file_key)
    VALUES (?, ?, ?, ?)
  `).bind(msgId, user.id, content, fileKey).run();

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}