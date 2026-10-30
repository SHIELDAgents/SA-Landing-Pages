// /api/verify-token
//   GET  (X-Shield-Token)            -> verify token, return profile
//   POST {action:'issue'}            -> create a free creator license, return a new token
//   POST {name, handle, email?}      -> (with X-Shield-Token) save identity on the license
import { json, db, newToken, authUser, publicUser, clean } from '../_lib/util.js';

const HANDLE_RE = /^[a-zA-Z0-9_.]{1,40}$/;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;

export async function onRequestGet({ request, env }) {
  const user = await authUser(env, request);
  if (!user) return json({ ok: false, valid: false }, 401);
  return json({ ok: true, valid: true, user: publicUser(user) });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  if (body.action === 'issue') {
    for (let i = 0; i < 5; i++) {
      const token = newToken();
      try {
        await db(env).prepare("INSERT INTO users (token, user_type, tier) VALUES (?1, 'creator', 'free')").bind(token).run();
        return json({ ok: true, token }, 201);
      } catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; }
    }
    return json({ ok: false, error: 'Could not issue token' }, 500);
  }

  const user = await authUser(env, request);
  if (!user) return json({ ok: false, error: 'Unknown token' }, 401);

  const name = clean(body.name, 100);
  const handle = clean(body.handle, 40).replace(/^@+/, '');
  const email = clean(body.email, 254).toLowerCase();
  if (handle && !HANDLE_RE.test(handle)) return json({ ok: false, error: 'Invalid handle' }, 400);
  if (email && !EMAIL_RE.test(email)) return json({ ok: false, error: 'Invalid email' }, 400);

  await db(env).prepare(
    `UPDATE users SET name = COALESCE(NULLIF(?1,''), name), handle = COALESCE(NULLIF(?2,''), handle),
       email = COALESCE(NULLIF(?3,''), email), updated_at = datetime('now') WHERE id = ?4`
  ).bind(name, handle, email, user.id).run();
  const fresh = await db(env).prepare('SELECT * FROM users WHERE id = ?1').bind(user.id).first();
  return json({ ok: true, user: publicUser(fresh) });
}
