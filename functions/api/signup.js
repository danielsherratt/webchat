import bcrypt from 'bcryptjs';

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  if (!username || !password) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const hash = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();
  await env.DB.prepare(\`
    INSERT INTO users (id, username, password_hash)
    VALUES (?, ?, ?)
  \`).bind(id, username, hash).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
