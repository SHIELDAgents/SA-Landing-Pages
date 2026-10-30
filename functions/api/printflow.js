// /api/printflow  POST -> save services/prices, availability and payout destinations on the caller's user row.
import { json, db, authUser, clean } from '../_lib/util.js';

const BTC_RE = /^(bc1[a-z0-9]{20,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;

export async function onRequestPost({ request, env }) {
  const user = await authUser(env, request);
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401);
  let b;
  try { b = await request.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const btc = clean(b.btc, 100);
  if (btc && !BTC_RE.test(btc)) return json({ ok: false, error: 'Invalid BTC address' }, 400);

  const price = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 100) / 100 : null; };
  const services = {
    status_tag:     { on: !!b.c_status, price: price(b.p_status) },
    ai_picture_fan: { on: !!b.c_ai,     price: price(b.p_ai) },
    peace:          { on: !!b.c_peace,  price: price(b.p_peace) },
    pay_per_crawl:  { on: !!b.c_ppc },
    only_status_and_peace: !!b.onlyTwo
  };
  const availability = {
    irl: b.irl === '1' || b.irl === 1 || b.irl === true,
    dates: clean(b.dates, 200), price_irl: price(b.p_irl)
  };

  await db(env).prepare(
    `UPDATE users SET services = ?1, availability = ?2, location_city = ?3, payout_btc = ?4, payout_fiat = ?5,
       updated_at = datetime('now') WHERE id = ?6`
  ).bind(JSON.stringify(services), JSON.stringify(availability), clean(b.city, 100), btc, clean(b.fiat, 120), user.id).run();
  return json({ ok: true });
}
