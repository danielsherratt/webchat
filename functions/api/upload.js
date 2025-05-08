export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
  const session = await env.D1_CESW.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  const user = session && await env.D1_CESW.prepare('SELECT role FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user || user.role !== 'admin') return new Response(null, { status: 403 });

  const form = await request.formData();
  const file = form.get('file');
  const data = await file.arrayBuffer();
  await env.D1_CESW.prepare('INSERT INTO files (filename, mime, data) VALUES (?, ?, ?)').bind(file.name, file.type, new Uint8Array(data)).run();
  return new Response(null, { status: 201 });
}
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (id) {
    const res = await env.D1_CESW.prepare('SELECT filename, mime, data FROM files WHERE id = ?').bind(id).first();
    if (!res) return new Response(null, { status: 404 });
    return new Response(res.data, {
      status: 200,
      headers: { 'Content-Type': res.mime, 'Content-Disposition': `attachment; filename="\${res.filename}"` }
    });
  }
  const all = await env.D1_CESW.prepare('SELECT id, filename, timestamp FROM files ORDER BY timestamp DESC').all();
  return new Response(JSON.stringify(all.results), { status: 200 });
}