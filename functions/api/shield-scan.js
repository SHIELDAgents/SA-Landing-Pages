const SOURCES = [
    'Cloudforce One Botnet Feed',
    'AI Training Crawl Telemetry',
    'Fake Googlebot ASN Inspector',
    'Telegram & Mirror Leak Index',
    'Deepfake Face-Vector Registry'
];

function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
}

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

async function handleShieldScan(request) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }

    const url = new URL(request.url);
    let handle = (url.searchParams.get('handle') || '').trim();
    let platform = (url.searchParams.get('platform') || 'instagram').trim().toLowerCase();

    if (request.method === 'POST') {
        try {
            const body = await request.json();
            if (body && body.handle) handle = String(body.handle).trim();
            if (body && body.platform) platform = String(body.platform).trim().toLowerCase();
        } catch (_) {
            // Fall back to query parameters
        }
    }

    handle = handle.replace(/^@+/, '').trim();
    const lowerHandle = handle.toLowerCase();

    // 2.5-second scan delay checking 5 sources
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // For demo: if handle = test or clean, return found: false
    if (!handle || lowerHandle === 'test' || lowerHandle === 'clean') {
        return jsonResponse({
            found: false,
            handle,
            platform,
            scrapes_today: 0,
            estimated_owed: '0.00',
            badge_status: 'Not Protected',
            sources_checked: SOURCES.length,
            sources: SOURCES
        });
    }

    const dayKey = new Date().toISOString().slice(0, 10);
    const seed = hashSeed(`${platform}:${lowerHandle}:${dayKey}`);

    // scrapes_today between 12 and 89
    const scrapesToday = 12 + (seed % 78);

    // estimated_owed = scrapes * 0.08
    const estimatedOwed = (scrapesToday * 0.08).toFixed(2);

    return jsonResponse({
        found: true,
        handle,
        platform,
        scrapes_today: scrapesToday,
        estimated_owed: estimatedOwed,
        badge_status: 'Not Protected',
        sources_checked: SOURCES.length,
        sources: SOURCES
    });
}

export async function onRequest(context) {
    return handleShieldScan(context.request);
}

export default {
    async fetch(request) {
        return handleShieldScan(request);
    }
};
