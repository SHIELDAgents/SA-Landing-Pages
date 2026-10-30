// /api/leaks
//   GET                         -> the caller's leak registry
//   POST {action:'record', summary, domains[]} -> store last scan + detected leak domains
//   POST {action:'claim', id}   -> detected -> claimed (paid tiers only). Filing is done by the Worker, not here.
import { json, db, authUser, clean, PAID_TIERS } from '../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const user = await authUser(env, request);
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401);
  const { results } = await db(env).prepare(
    "SELECT id, subject, source, status, created_at FROM registry WHERE user_id = ?1 AND kind = 'leak' ORDER BY id DESC LIMIT 100"
  ).bind(user.id).all();
  // Free tier sees domains blurred client-side; the API still withholds them.
  const paid = PAID_TIERS.includes(user.tier);
  return json({ ok: true, paid, leaks: results.map((r) => ({ ...r, subject: paid ? r.subject : null })) });
}

export async function onRequestPost({ request, env }) {
  const user = await authUser(env, request);
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  if (body.action === 'record') {
    const s = body.summary || {};
    const summary = {
      scrapes: Math.max(0, Number(s.scrapes) | 0), domains: Math.max(0, Number(s.domains) | 0),
      leaks: Math.max(0, Number(s.leaks) | 0), owed: clean(s.owed, 12)
    };
    await db(env).prepare("UPDATE users SET last_scan_at = datetime('now'), scan_summary = ?1, updated_at = datetime('now') WHERE id = ?2")
      .bind(JSON.stringify(summary), user.id).run();
    const domains = (Array.isArray(body.domains) ? body.domains : []).slice(0, 50);
    for (const d of domains) {
      const subject = clean(d, 253).toLowerCase();
      if (!subject) continue;
      await db(env).prepare(
        "INSERT INTO registry (user_id, kind, subject, source) VALUES (?1, 'leak', ?2, 'scan') ON CONFLICT(user_id, kind, subject) DO NOTHING"
      ).bind(user.id, subject).run();
    }
    return json({ ok: true, summary });
  }

  if (body.action === 'claim') {
    if (!PAID_TIERS.includes(user.tier)) return json({ ok: false, paywalled: true, error: 'Claim requires a paid tier' }, 402);
    const r = await db(env).prepare(
      "UPDATE registry SET status = 'claimed', updated_at = datetime('now') WHERE id = ?1 AND user_id = ?2 AND kind = 'leak' AND status = 'detected'"
    ).bind(Number(body.id) | 0, user.id).run();
    if (!r.meta.changes) return json({ ok: false, error: 'Not claimable' }, 409);
    return json({ ok: true, status: 'claimed' });
  }

  return json({ ok: false, error: 'Unknown action' }, 400);
}
