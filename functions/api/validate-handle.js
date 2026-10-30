const PLATFORM_CONFIG = {
    instagram: {
        buildUrl: (handle) => `https://www.instagram.com/${encodeURIComponent(handle)}/`,
        validPattern: /^(?!.*\.\.)(?!\.)[a-zA-Z0-9._]{1,30}(?<!\.)$/,
        reserved: new Set([
            'explore', 'accounts', 'p', 'reel', 'reels', 'stories',
            'direct', 'about', 'legal', 'developer', ' tv', 'session'
        ]),
        isSoft404: (html) => {
            const hasOgTitle = /property=["']og:title["']/i.test(html);
            return (/Page Not Found|<title>\s*Instagram\s*<\/title>/i.test(html) && !hasOgTitle);
        }
    },
    tiktok: {
        buildUrl: (handle) => `https://www.tiktok.com/@${encodeURIComponent(handle)}`,
        validPattern: /^[a-zA-Z0-9._]{2,24}(?<!\.)$/,
        reserved: new Set([
            'explore', 'following', 'foryou', 'live', 'messages',
            'upload', 'about', 'legal', 'login', 'signup', 'search'
        ]),
        isSoft404: (html) => {
            return /Visit TikTok to discover profiles!|"statusCode"\s*:\s*102(02|21)|Couldn't find this account/i.test(html);
        }
    },
    x: {
        buildUrl: (handle) => `https://x.com/${encodeURIComponent(handle)}`,
        validPattern: /^[a-zA-Z0-9_]{1,15}$/,
        reserved: new Set([
            'home', 'explore', 'notifications', 'messages', 'settings',
            'i', 'search', 'login', 'signup', 'tos', 'privacy', ' compose'
        ]),
        isSoft404: (html) => {
            return /User Profile Not Found|404 Error|This account doesn't exist/i.test(html);
        }
    },
    onlyfans: {
        buildUrl: (handle) => `https://onlyfans.com/${encodeURIComponent(handle)}`,
        validPattern: /^[a-zA-Z0-9._-]{3,40}$/,
        reserved: new Set([
            'posts', 'chats', 'notifications', 'my', 'bookmarks',
            'lists', 'settings', 'terms', 'privacy', 'help', 'login', 'signup'
        ]),
        isSoft404: (html) => {
            return /Page Not Found|Sorry, this page is not available/i.test(html);
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
    // Strip URL prefix if a full or partial URL was passed in the handle parameter
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
    if (!config.validPattern.test(handle) || config.reserved.has(handle.toLowerCase())) {
        return jsonResponse({ exists: false });
    }

    const targetUrl = config.buildUrl(handle);

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            redirect: 'follow'
        });

        if (response.status === 404) {
            return jsonResponse({ exists: false });
        }

        if (response.status === 200) {
            const html = await response.text();
            if (config.isSoft404 && config.isSoft404(html)) {
                return jsonResponse({ exists: false });
            }
            return jsonResponse({ exists: true });
        }

        return jsonResponse({ exists: false });
    } catch (err) {
        return jsonResponse({ exists: false });
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
