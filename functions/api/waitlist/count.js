function getDatabase(env) {
    if (!env) return null;
    return env.shield_waitlist || env.DB || null;
}

async function handleWaitlistCount(request, env) {
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    const providedSecret =
        request.headers.get('X-Admin-Secret') ||
        (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const expectedSecret = (env && env.ADMIN_SECRET) || '';

    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    const db = getDatabase(env);
    if (!db) {
        return new Response(JSON.stringify({ count: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    }

    try {
        const row = await db.prepare('SELECT COUNT(*) AS count FROM waitlist').first();
        return new Response(JSON.stringify({ count: row && typeof row.count === 'number' ? row.count : 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    } catch (_) {
        return new Response(JSON.stringify({ count: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    }
}

export async function onRequest(context) {
    return handleWaitlistCount(context.request, context.env);
}

export default {
    async fetch(request, env) {
        return handleWaitlistCount(request, env);
    }
};
