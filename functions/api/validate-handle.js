const DEFAULT_OF_RULES = {
    static_param: '278ensloiFsow2rJMopwDWaMUiysP5fU',
    format: '65232:{}:{:x}:6aa95d0a',
    checksum_indexes: [
        20, 23, 30, 32, 27, 19, 39, 4, 29,
        34, 0, 18, 3, 15, 26, 8, 9, 32,
        13, 5, 34, 29, 18, 35, 6, 37, 18,
        19, 32, 4, 27, 28
    ],
    checksum_constant: -1085,
    app_token: '33d57ade8c02dbc5a333db99ff9ae26a'
};

async function sha1Hex(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(byteLength = 20) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchOnlyFansRules() {
    try {
        const res = await fetch('https://raw.githubusercontent.com/DATAHOARDERS/dynamic-rules/main/onlyfans.json', {
            signal: AbortSignal.timeout(2500)
        });
        if (res.ok) {
            const json = await res.json();
            if (json && json.static_param && json.format && Array.isArray(json.checksum_indexes)) {
                return json;
            }
        }
    } catch (_) {
        // Fall back to cached rules
    }
    return DEFAULT_OF_RULES;
}

async function checkOnlyFansApi(cleanHandle) {
    try {
        const rules = await fetchOnlyFansRules();
        const path = `/api2/v2/users/${encodeURIComponent(cleanHandle)}`;
        const time = Date.now().toString();
        const msg = [rules.static_param, time, path, '0'].join('\n');
        const sha = await sha1Hex(msg);
        const checksum =
            rules.checksum_indexes.reduce((acc, idx) => acc + sha.charCodeAt(idx), 0) +
            Number(rules.checksum_constant || 0);
        const sign = String(rules.format)
            .replace('{}', sha)
            .replace('{:x}', Math.abs(checksum).toString(16));

        const res = await fetch(`https://onlyfans.com${path}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'app-token': rules.app_token || '33d57ade8c02dbc5a333db99ff9ae26a',
                'x-bc': randomHex(20),
                'sign': sign,
                'time': time,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(4500)
        });

        if (res.status === 200) {
            const data = await res.json().catch(() => null);
            return Boolean(data && (data.id || data.username));
        }
        if (res.status === 404) {
            return false;
        }
    } catch (_) {
        // Fall through to OnlyFans index checks
    }
    return null;
}

async function checkOnlyFansSources(handle) {
    const clean = handle.replace(/^@+/, '').trim().toLowerCase();
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(clean)) return false;

    const reserved = new Set([
        'posts', 'chats', 'notifications', 'my', 'bookmarks',
        'lists', 'settings', 'terms', 'privacy', 'help', 'login', 'signup'
    ]);
    if (reserved.has(clean)) return false;

    // 1. Check OnlyFans official APIv2 with dynamic signature + OnlyFans-specific web indices (WITHOUT @)
    const [ofApiResult, urlscanRes, ppSubRes, ppComRes, ccRes] = await Promise.allSettled([
        checkOnlyFansApi(clean),
        fetch(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`"onlyfans.com/${clean}"`)}&size=5`, {
            signal: AbortSignal.timeout(4000)
        }).then((r) => r.json()),
        fetch(`https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(`"onlyfans.com/${clean}"`)}&size=5`, {
            signal: AbortSignal.timeout(4000)
        }).then((r) => r.json()),
        fetch(`https://api.pullpush.io/reddit/search/comment/?q=${encodeURIComponent(`"onlyfans.com/${clean}"`)}&size=5`, {
            signal: AbortSignal.timeout(4000)
        }).then((r) => r.json()),
        fetch(`https://index.commoncrawl.org/CC-MAIN-2024-38-index?url=${encodeURIComponent(`onlyfans.com/${clean}*`)}&output=json&limit=5`, {
            signal: AbortSignal.timeout(3500)
        }).then((r) => r.text())
    ]);

    if (ofApiResult.status === 'fulfilled' && ofApiResult.value === true) {
        return true;
    }

    const hasUrlscan = urlscanRes.status === 'fulfilled' && Number(urlscanRes.value?.total) > 0;
    const hasPpSub = ppSubRes.status === 'fulfilled' && Array.isArray(ppSubRes.value?.data) && ppSubRes.value.data.length > 0;
    const hasPpCom = ppComRes.status === 'fulfilled' && Array.isArray(ppComRes.value?.data) && ppComRes.value.data.length > 0;
    const hasCc =
        ccRes.status === 'fulfilled' &&
        typeof ccRes.value === 'string' &&
        !ccRes.value.includes('No Captures found') &&
        ccRes.value.includes('onlyfans.com');

    if (hasUrlscan || hasPpSub || hasPpCom || hasCc) {
        return true;
    }

    // If OnlyFans API explicitly returned 404 User not found and no OnlyFans index had it, return false
    return false;
}

async function checkInstagramSource(handle) {
    const clean = handle.replace(/^@+/, '').trim().toLowerCase();
    if (!/^(?!.*\.\.)(?!\.)[a-zA-Z0-9._]{1,30}(?<!\.)$/.test(clean)) return false;

    const reserved = new Set([
        'explore', 'accounts', 'p', 'reel', 'reels', 'stories',
        'direct', 'about', 'legal', 'developer', 'tv', 'session'
    ]);
    if (reserved.has(clean)) return false;

    try {
        const [igRes, threadsRes] = await Promise.allSettled([
            fetch(`https://www.instagram.com/${encodeURIComponent(clean)}/`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                redirect: 'follow',
                signal: AbortSignal.timeout(4500)
            }),
            fetch(`https://www.threads.net/@${encodeURIComponent(clean)}`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
                    'Accept': 'text/html,application/xhtml+xml'
                },
                redirect: 'follow',
                signal: AbortSignal.timeout(4500)
            })
        ]);

        if (igRes.status === 'fulfilled' && igRes.value.status === 200) {
            const html = await igRes.value.text();
            const hasOgTitle = /property=["']og:title["']/i.test(html);
            const isNotFound = /Sorry, this page isn't available|Page Not Found|<title>\s*Instagram\s*<\/title>/i.test(html);
            if (hasOgTitle && !isNotFound) return true;
        }

        if (threadsRes.status === 'fulfilled' && threadsRes.value.status === 200) {
            const html = await threadsRes.value.text();
            const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
            if (title && !/Threads\s*•\s*Log in/i.test(title) && /@|&#064;|Threads/i.test(title)) {
                return true;
            }
        }
    } catch (_) {
        // Ignore network errors
    }
    return false;
}

async function checkTikTokSource(handle) {
    const clean = handle.replace(/^@+/, '').trim().toLowerCase();
    if (!/^[a-zA-Z0-9._]{2,24}(?<!\.)$/.test(clean)) return false;

    const reserved = new Set([
        'explore', 'following', 'foryou', 'live', 'messages',
        'upload', 'about', 'legal', 'login', 'signup', 'search'
    ]);
    if (reserved.has(clean)) return false;

    try {
        const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(clean)}`, {
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
    } catch (_) {
        return false;
    }
}

async function checkXSource(handle) {
    // Always strip @ before building URL for X (x.com/handle, NOT x.com/@handle)
    const clean = handle.replace(/^@+/, '').trim().toLowerCase();
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(clean)) return false;

    const reserved = new Set([
        'home', 'explore', 'notifications', 'messages', 'settings',
        'i', 'search', 'login', 'signup', 'tos', 'privacy', 'compose'
    ]);
    if (reserved.has(clean)) return false;

    try {
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://x.com/${clean}`)}`;
        const res = await fetch(oembedUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            redirect: 'follow',
            signal: AbortSignal.timeout(4500)
        });
        if (res.status !== 200) return false;
        const data = await res.json().catch(() => null);
        return Boolean(data && (data.author_name || data.url || data.html));
    } catch (_) {
        return false;
    }
}

function normalizePlatform(raw) {
    const p = (raw || 'instagram').trim().toLowerCase();
    if (p === 'ig' || p === 'instagram') return 'instagram';
    if (p === 'tt' || p === 'tiktok') return 'tiktok';
    if (p === 'x' || p === 'twitter') return 'x';
    if (p === 'of' || p === 'onlyfans') return 'onlyfans';
    return 'instagram';
}

function cleanHandle(raw) {
    if (!raw) return '';
    let value = raw.trim();
    value = value.replace(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am|tiktok\.com|x\.com|twitter\.com|onlyfans\.com)\//i, '');
    value = value.split(/[/?#]/)[0].trim();
    value = value.replace(/^@+/, '').trim().toLowerCase();
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

    if (!handle) {
        return jsonResponse({
            exists: false,
            handle: '',
            platform,
            instagram: false,
            tiktok: false,
            x: false,
            onlyfans: false
        });
    }

    const [ig, tt, x, of] = await Promise.all([
        checkInstagramSource(handle),
        checkTikTokSource(handle),
        checkXSource(handle),
        checkOnlyFansSources(handle)
    ]);

    const results = {
        instagram: Boolean(ig),
        tiktok: Boolean(tt),
        x: Boolean(x),
        onlyfans: Boolean(of)
    };

    return jsonResponse({
        exists: results[platform],
        platform,
        handle,
        ...results
    });
}

export async function onRequest(context) {
    return handleValidateRequest(context.request);
}

export default {
    async fetch(request) {
        return handleValidateRequest(request);
    }
};
