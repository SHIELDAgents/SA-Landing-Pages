// /api/vault
//   GET  -> list the caller's vault media (metadata only)
//   POST multipart (fields: video|pic|voice files, links = comma separated) -> store in R2, record in media
import { json, db, authUser, clean } from '../_lib/util.js';

const LIMITS = { video: 60 * 1024 * 1024, pic: 10 * 1024 * 1024, voice: 15 * 1024 * 1024 };
const PREFIX = { video: 'video/', pic: 'image/', voice: 'audio/' };

export async function onRequestGet({ request, env }) {
  const user = await authUser(env, request);
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401);
  const { results } = await db(env).prepare(
    'SELECT id, kind, url, content_type, bytes, created_at FROM media WHERE user_id = ?1 AND retention = ?2 ORDER BY id DESC'
  ).bind(user.id, 'vault').all();
  return json({ ok: true, vault_status: user.vault_status, items: results });
}

export async function onRequestPost({ request, env }) {
  const user = await authUser(env, request);
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!env.VAULT) return json({ ok: false, error: 'Vault storage is not configured' }, 503);

  let form;
  try { form = await request.formData(); } catch (_) { return json({ ok: false, error: 'Expected multipart form' }, 400); }

  const saved = [];
  for (const kind of Object.keys(LIMITS)) {
    const file = form.get(kind);
    if (!file || typeof file === 'string' || !file.size) continue;
    if (file.size > LIMITS[kind]) return json({ ok: false, error: kind + ' too large' }, 413);
    if (!String(file.type).startsWith(PREFIX[kind])) return json({ ok: false, error: kind + ' has wrong type' }, 415);
    const key = `vault/${user.id}/${kind}-${Date.now()}`;
    await env.VAULT.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await db(env).prepare(
      "INSERT INTO media (user_id, kind, r2_key, content_type, bytes, retention) VALUES (?1, ?2, ?3, ?4, ?5, 'vault')"
    ).bind(user.id, kind, key, file.type, file.size).run();
    saved.push(kind);
  }

  const links = clean(form.get('links'), 1000).split(',').map((l) => l.trim()).filter(Boolean).slice(0, 10);
  for (const l of links) {
    if (!/^https:\/\/[^\s]+\.[^\s]+$/.test(l)) continue;
    await db(env).prepare("INSERT INTO media (user_id, kind, url, retention) VALUES (?1, 'link', ?2, 'vault')").bind(user.id, l).run();
    saved.push('link');
  }

  if (!saved.length) return json({ ok: false, error: 'Nothing to save' }, 400);
  await db(env).prepare("UPDATE users SET vault_status = 'active', updated_at = datetime('now') WHERE id = ?1").bind(user.id).run();
  return json({ ok: true, saved });
}
