// Shared helpers for PrintFlow endpoints. No onRequest exports, so this is not a route.

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// The token is the credential, so use 8 random chars (~40 bits), not 4.
export function newToken() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'SHIELD-' + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const TOKEN_RE = /^SHIELD-[A-Z0-9]{4,12}$/;
export const PAID_TIERS = ['monthly_49', 'annual_399', 'sovereign'];

export function db(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  return env.DB;
}

// Resolve the caller from the X-Shield-Token header. Returns the users row or null.
export async function authUser(env, request) {
  const token = (request.headers.get('X-Shield-Token') || '').trim().toUpperCase();
  if (!TOKEN_RE.test(token)) return null;
  return db(env).prepare('SELECT * FROM users WHERE token = ?1').bind(token).first();
}

export function publicUser(u) {
  const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch (_) { return null; } };
  return {
    name: u.name, user_type: u.user_type, email: u.email, handle: u.handle, token: u.token, tier: u.tier,
    vault_status: u.vault_status, website_link: u.website_link, location_city: u.location_city,
    availability: parse(u.availability), payout_btc: u.payout_btc, payout_fiat: u.payout_fiat,
    services: parse(u.services), last_scan_at: u.last_scan_at, scan_summary: parse(u.scan_summary)
  };
}

export const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// Reject non-https and private/loopback hosts before the server fetches a user-supplied URL.
export function safePublicUrl(raw) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (_) { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(':')) return null; // no raw IPs
  return u;
}
