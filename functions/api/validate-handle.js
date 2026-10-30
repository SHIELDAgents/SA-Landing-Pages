const PLATFORM_CONFIG = {
    instagram: {
        validPattern: /^(?!.*\.\.)(?!\.)[a-zA-Z0-9._]{1,30}(?<!\.)$/,
        reserved: new Set([
            'explore', 'accounts', 'p', 'reel', 'reels', 'stories',
            'direct', 'about', 'legal', 'developer', 'tv', 'session'
        ]),
        checkExists: async (handle) => {
            const res = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                redirect: 'follow',
                signal: AbortSignal.timeout(4500)
            });
            if (res.status !== 200) return false;
            const html = await res.text();
            const hasOgTitle = /property=["']og:title["']/i.test(html);
            const isNotFound = /Sorry, this page isn't available|Page Not Found|<title>\s*Instagram\s*<\/title>/i.test(html);
            return hasOgTitle && !isNotFound;
        }
    },
    tiktok: {
        validPattern: /^[a-zA-Z0-9._]{2,24}(?<!\.)$/,
        reserved: new Set([
            'explore', 'following', 'foryou', 'live', 'messages',
            'upload', 'about', 'legal', 'login', 'signup', 'search'
        ]),
        checkExists: async (handle) => {
            const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(handle)}`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                redirect: 'follow',
                signal: AbortSignal.timeout(4500)
            });
            if (res.status !== 200) return false;
            const html = await res.text();
            const hasOgTitle = /property=["']og:title["']/i.test(html);
            const isSoft404 = /Visit TikTok to discover profiles!|"statusCode"\s*:\s*102(02|21)|Couldn't find this account/i.test(html);
            return hasOgTitle && !isSoft404;
        }
    },
    x: {
        validPattern: /^[a-zA-Z0-9_]{1,15}$/,
        reserved: new Set([
            'home', 'explore', 'notifications', 'messages', 'settings',
            'i', 'search', 'login', 'signup', 'tos', 'privacy', 'compose'
        ]),
        checkExists: async (handle) => {
            const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/${handle}`)}`;
            const res = await fetch(oembedUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                redirect: 'follow',
                signal: AbortSignal.timeout(4500)
            });
            if (res.status !== 200) return false;
            const data = await res.json().catch(() => null);
            return Boolean(data && (data.author_name || data.url || data.html));
        }
    },
    onlyfans: {
        validPattern: /^[a-zA-Z0-9._-]{3,40}$/,
        reserved: new Set([
            'posts', 'chats', 'notifications', 'my', 'bookmarks',
            'lists', 'settings', 'terms', 'privacy', 'help', 'login', 'signup'
        ]),
        checkExists: async (handle) => {
            // OnlyFans serves an identical SPA shell for all paths, so verify creator footprint
            // across Reddit leak/mention index, URLScan crawl index, or cross-platform handle presence
            const [redditRes, urlscanRes, igExists, xExists] = await Promise.allSettled([
                fetch(`https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(`"${handle}"`)}&size=5`, {
                    signal: AbortSignal.timeout(4000)
                }).then((r) => r.json()),
                fetch(`https://urlscan.io/api/v1/search/?q=page.title:${encodeURIComponent(handle)}&size=5`, {
                    signal: AbortSignal.timeout(4000)
                }).then((r) => r.json()),
                PLATFORM_CONFIG.instagram.validPattern.test(handle)
                    ? PLATFORM_CONFIG.instagram.checkExists(handle)
                    : Promise.resolve(false),
                PLATFORM_CONFIG.x.validPattern.test(handle)
                    ? PLATFORM_CONFIG.x.checkExists(handle)
                    : Promise.resolve(false)
            ]);

            const hasReddit = redditRes.status === 'fulfilled' && Array.isArray(redditRes.value?.data) && redditRes.value.data.length > 0;
            const hasUrlscan = urlscanRes.status === 'fulfilled' && Number(urlscanRes.value?.total) > 0;
            const hasIg = igExists.status === 'fulfilled' && igExists.value === true;
            const hasX = xExists.status === 'fulfilled' && xExists.value === true;

            return hasReddit || hasUrlscan || hasIg || hasX;
        }
    }
};

function normalizePlatform(raw) {
    const p = (raw || 'instagram').trim().toLowerCase();
    if (p === 'ig' || p === 'instagram') return 'instagram';
    if (p === 'tt' || p === 'tiktok') return 'tiktok';
    if (p === 'x' || p === 'twitter') return 'x';
    if (p === 'of' || p === 'onlyfans') return 'onlyfans';
    return null;
}

function cleanHandle(raw) {
    if (!raw) return '';
    let value = raw.trim();
    value = value.replace(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am|tiktok\.com|x\.com|twitter\.com|onlyfans\.com)\//i, '');
    value = value.split(/[/?#]/)[0].trim();
    value = value.replace(/^@+/, '').trim();
    return value;
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

async function handleValidateRequest(request) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }

    const url = new URL(request.url);
    const platform = normalizePlatform(url.searchParams.get('platform'));
    const handle = cleanHandle(url.searchParams.get('handle'));

    if (!platform || !handle) {
        return jsonResponse({ exists: false });
    }

    const config = PLATFORM_CONFIG[platform];
    const lowerHandle = handle.toLowerCase();
    if (!config.validPattern.test(handle) || config.reserved.has(lowerHandle)) {
        return jsonResponse({ exists: false });
    }

    try {
        const exists = await config.checkExists(handle);
        return jsonResponse({ exists: Boolean(exists), platform, handle });
    } catch (err) {
        return jsonResponse({ exists: false, platform, handle });
    }
}

export async function onRequest(context) {
    return handleValidateRequest(context.request);
}

export default {
    async fetch(request) {
        return handleValidateRequest(request);
    }
};
