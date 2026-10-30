// Scheduled Worker (Pages Functions cannot run cron). Every 3 days:
//  1. Shield Bolt: re-snapshot every user website_link into R2.
//  2. Purge ephemeral media past delete_after (AI images are deleted after delivery).
// Deploy separately: cd cron && npx wrangler deploy   (not run; needs your approval)
import { snapshot } from '../functions/api/shield-bolt.js';
import { safePublicUrl } from '../functions/_lib/util.js';

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  // Manual check is disabled on purpose; no public HTTP surface.
  async fetch() { return new Response('Not found', { status: 404 }); }
};

async function run(env) {
  const { results: sites } = await env.DB.prepare(
    "SELECT id, website_link FROM users WHERE website_link IS NOT NULL AND website_link != ''"
  ).all();
  for (const s of sites) {
    const url = safePublicUrl(s.website_link);
    if (!url) continue;
    try { await snapshot(env, s.id, url); } catch (e) { console.log('bolt fail', s.id, e.message); }
  }

  const { results: expired } = await env.DB.prepare(
    "SELECT id, r2_key FROM media WHERE retention = 'ephemeral' AND delete_after IS NOT NULL AND delete_after < datetime('now')"
  ).all();
  for (const m of expired) {
    if (m.r2_key) await env.VAULT.delete(m.r2_key);
    await env.DB.prepare('DELETE FROM media WHERE id = ?1').bind(m.id).run();
  }
}
