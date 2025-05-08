import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  const { results } = await env.DB.prepare(
    `SELECT id, password_hash FROM users WHERE username = ?`
  ).bind(username).all();
  if (!results.length) {
    return new Response(JSON.stringify({ error: 'No such user' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const user = results[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const token = jwt.sign({ id: user.id, username }, env.JWT_SECRET, { expiresIn: '24h' });
  return new Response(JSON.stringify({ token }), { headers: { 'Content-Type': 'application/json' } });
}