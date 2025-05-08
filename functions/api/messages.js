export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT m.id, u.username, m.content, m.file_key, m.created_at
    FROM messages m
    JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at DESC
    LIMIT 100
  `).all();

  const msgs = await Promise.all(results.map(async m => ({
    id: m.id,
    username: m.username,
    content: m.content,
    fileUrl: m.file_key
      ? await env.FILES.get(m.file_key, { type: 'url' })
      : null,
    created_at: m.created_at
  })));

  return new Response(JSON.stringify(msgs), { headers: { 'Content-Type': 'application/json' } });
}