// /api/shield-bolt  POST {url}
// Saves the website link and takes the first snapshot into R2. The scheduled Worker in /cron repeats it every 3 days.
import { json, db, authUser, safePublicUrl } from '../_lib/util.js';

export async function snapshot(env, userId, url) {
  const res = await fetch(url.href, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'ShieldBolt/1.0' } });
  if (!res.ok) throw new Error('Site returned ' + res.status);
  const final = new URL(res.url);
  if (final.protocol !== 'https:') throw new Error('Redirected to non-https');
  const body = await res.arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) throw new Error('Page too large');
  const key = `snapshots/${userId}/${Date.now()}.html`;
  await env.VAULT.put(key, body, { httpMetadata: { contentType: res.headers.get('content-type') || 'text/html' } });
  const media = await db(env).prepare(
    "INSERT INTO media (user_id, kind, r2_key, content_type, bytes, retention) VALUES (?1, 'snapshot', ?2, ?3, ?4, 'vault')"
  ).bind(userId, key, res.headers.get('content-type') || 'text/html', body.byteLength).run();
  await db(env).prepare(
    `INSERT INTO registry (user_id, kind, subject, status, media_id) VALUES (?1, 'snapshot', ?2, 'archived', ?3)
     ON CONFLICT(user_id, kind, subject) DO UPDATE SET media_id = excluded.media_id, updated_at = datetime('now')`
  ).bind(userId, url.href, media.meta.last_row_id).run();
  return { key, bytes: body.byteLength };
}

export async function onRequestPost({ request, env }) {
  const user = await authUser(env, request);
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!env.VAULT) return json({ ok: false, error: 'Vault storage is not configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const url = safePublicUrl(String(body.url || ''));
  if (!url) return json({ ok: false, error: 'Enter a public https website URL' }, 400);

  try {
    const snap = await snapshot(env, user.id, url);
    await db(env).prepare("UPDATE users SET website_link = ?1, updated_at = datetime('now') WHERE id = ?2").bind(url.href, user.id).run();
    return json({ ok: true, url: url.href, bytes: snap.bytes, next_snapshot: 'within 3 days' });
  } catch (e) {
    return json({ ok: false, error: 'Snapshot failed: ' + e.message }, 502);
  }
}
