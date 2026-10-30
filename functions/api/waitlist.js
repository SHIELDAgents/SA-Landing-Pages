const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
const HANDLE_REGEX = /^[a-zA-Z0-9_.]{1,40}$/;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Fallback in-memory stores when D1 binding is not yet attached in preview
const memoryRateLimits = new Map();
const memoryWaitlist = new Map();

function getCorsHeaders(request) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = new Set([
        'https://shieldagents.store',
        'https://www.shieldagents.store',
        'https://shield-agents.store',
        'https://www.shield-agents.store'
    ]);
    const allowOrigin = allowedOrigins.has(origin) ? origin : 'https://shieldagents.store';
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}

function jsonResponse(body, status, request) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...getCorsHeaders(request)
        }
    });
}

async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function getDatabase(env) {
    if (!env) return null;
    return env.shield_waitlist || env.DB || null;
}

async function ensureWaitlistTable(db) {
    await db.prepare(
        `CREATE TABLE IF NOT EXISTS waitlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            handle TEXT NOT NULL,
            created_at TEXT NOT NULL,
            ip_hash TEXT NOT NULL,
            source TEXT NOT NULL
        )`
    ).run();
}

async function handleWaitlistPost(request, env) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, request);
    }

    let payload;
    try {
        payload = await request.json();
    } catch (_) {
        return jsonResponse({ ok: false, error: 'Invalid JSON payload' }, 400, request);
    }

    const email = String((payload && payload.email) || '').trim().toLowerCase();
    const rawHandle = String((payload && payload.handle) || '').trim();
    const handle = rawHandle.replace(/^@+/, '').trim();
    const source = String((payload && payload.source) || 'main_page').trim().slice(0, 64) || 'main_page';
    const createdAt = new Date().toISOString();

    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
        return jsonResponse({ ok: false, error: 'Please enter a valid email address.' }, 400, request);
    }

    if (!handle || !HANDLE_REGEX.test(handle)) {
        return jsonResponse({ ok: false, error: 'Invalid handle (use letters, numbers, _ or .).' }, 400, request);
    }

    const rawIp =
        request.headers.get('CF-Connecting-IP') ||
        (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
        '0.0.0.0';
    const ipHash = await sha256Hex(`shield_waitlist_salt:${rawIp}`);

    const db = getDatabase(env);
    const oneHourAgoIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    if (db) {
        try {
            await ensureWaitlistTable(db);

            const rateRow = await db
                .prepare('SELECT COUNT(*) AS cnt FROM waitlist WHERE ip_hash = ?1 AND created_at >= ?2')
                .bind(ipHash, oneHourAgoIso)
                .first();

            const recentCount = rateRow && typeof rateRow.cnt === 'number' ? rateRow.cnt : 0;
            if (recentCount >= RATE_LIMIT_MAX) {
                return jsonResponse({ ok: false, error: 'Rate limit exceeded (max 5/hr). Try again later.' }, 429, request);
            }

            await db
                .prepare(
                    'INSERT INTO waitlist (email, handle, created_at, ip_hash, source) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(email) DO UPDATE SET handle = excluded.handle, source = excluded.source'
                )
                .bind(email, handle, createdAt, ipHash, source)
                .run();

            return jsonResponse(
                {
                    ok: true,
                    message: "You're in. Early Nov via ITOPS 650k. Check shieldagents.store"
                },
                200,
                request
            );
        } catch (err) {
            return jsonResponse({ ok: false, error: 'Unable to save waitlist entry.' }, 500, request);
        }
    }

    // Fallback rate limit & storage if D1 is not bound yet
    const now = Date.now();
    const timestamps = (memoryRateLimits.get(ipHash) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (timestamps.length >= RATE_LIMIT_MAX) {
        return jsonResponse({ ok: false, error: 'Rate limit exceeded (max 5/hr). Try again later.' }, 429, request);
    }
    timestamps.push(now);
    memoryRateLimits.set(ipHash, timestamps);
    memoryWaitlist.set(email, { email, handle, created_at: createdAt, ip_hash: ipHash, source });

    return jsonResponse(
        {
            ok: true,
            message: "You're in. Early Nov via ITOPS 650k. Check shieldagents.store"
        },
        200,
        request
    );
}

export async function onRequest(context) {
    return handleWaitlistPost(context.request, context.env);
}

export default {
    async fetch(request, env) {
        return handleWaitlistPost(request, env);
    }
};
