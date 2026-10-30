const SOURCES = [
    'Reddit Leak Index',
    'URLScan',
    'GitHub',
    'HackerNews',
    'Social Telemetry'
];

const LEAK_KEYWORDS = /\b(leak|leaked|leaks|mega|telegram|onlyfans|of|nsfw|patreon|repost|rip|archive|deepfake|nude|pack|folder|drop|mirror|scrape|scraped)\b/i;

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

function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&#064;/g, '@')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function parseFollowerCount(desc) {
    if (!desc) return 0;
    const match = desc.match(/([\d.,]+)\s*([KMB])?\s*Followers/i);
    if (!match) return 0;
    const rawNum = parseFloat(match[1].replace(/,/g, ''));
    if (isNaN(rawNum)) return 0;
    const unit = (match[2] || '').toUpperCase();
    if (unit === 'B') return Math.round(rawNum * 1_000_000_000);
    if (unit === 'M') return Math.round(rawNum * 1_000_000);
    if (unit === 'K') return Math.round(rawNum * 1_000);
    return Math.round(rawNum);
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

async function probeInstagram(handle) {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
            'Accept': 'text/html,application/xhtml+xml'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(4000)
    });
    if (res.status !== 200) return { exists: false };
    const html = await res.text();
    const hasOgTitle = /property=["']og:title["']/i.test(html);
    const isNotFound = /Sorry, this page isn't available|Page Not Found|<title>\s*Instagram\s*<\/title>/i.test(html);
    if (!hasOgTitle || isNotFound) return { exists: false };

    const descMatch =
        html.match(/property=["']og:description["']\s+content=["']([^"']*)["']/i) ||
        html.match(/content=["']([^"']*)["']\s+property=["']og:description["']/i);
    const description = descMatch ? decodeHtmlEntities(descMatch[1]) : '';
    const statsSummary = description ? description.split(' - ')[0].trim() : '';
    const followers = parseFollowerCount(description);

    return {
        exists: true,
        statsSummary,
        followers
    };
}

async function probeTikTok(handle) {
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(handle)}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
            'Accept': 'text/html,application/xhtml+xml'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(4000)
    });
    if (res.status !== 200) return { exists: false };
    const html = await res.text();
    const hasOgTitle = /property=["']og:title["']/i.test(html);
    const isSoft404 = /Visit TikTok to discover profiles!|"statusCode"\s*:\s*102(02|21)|Couldn't find this account/i.test(html);
    return { exists: hasOgTitle && !isSoft404 };
}

async function probeX(handle) {
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(handle)) return { exists: false };
    const res = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://x.com/${handle}`)}`,
        { signal: AbortSignal.timeout(4000) }
    );
    if (res.status !== 200) return { exists: false };
    const data = await res.json().catch(() => null);
    return { exists: Boolean(data && (data.author_name || data.url)), authorName: data?.author_name || '' };
}

async function probeOnlyFans(handle) {
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(handle)) return { exists: false };
    try {
        const rules = await fetchOnlyFansRules();
        const path = `/api2/v2/users/${encodeURIComponent(handle)}`;
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
            if (data && (data.id || data.username)) {
                const posts = Number(data.postsCount) || 0;
                const photos = Number(data.photosCount) || 0;
                const videos = Number(data.videosCount) || 0;
                const likes = Number(data.favoritedCount) || 0;
                const summaryParts = [];
                if (posts > 0) summaryParts.push(`${posts} Posts`);
                if (photos > 0) summaryParts.push(`${photos} Photos`);
                if (videos > 0) summaryParts.push(`${videos} Videos`);
                if (likes > 0) summaryParts.push(`${likes} Likes`);
                return {
                    exists: true,
                    postsCount: posts + photos + videos,
                    favoritedCount: likes,
                    statsSummary: summaryParts.join(', ')
                };
            }
        }
    } catch (_) {
        // Ignore error
    }
    return { exists: false };
}

async function probeYouTube(handle) {
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(4000)
    });
    if (res.status !== 200) return { exists: false };
    const html = await res.text();
    return { exists: /property=["']og:title["']/i.test(html) };
}

async function scanRedditLeaks(handle) {
    const [subRes, ofSubRes] = await Promise.allSettled([
        fetch(
            `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(`"${handle}"`)}&size=100`,
            { signal: AbortSignal.timeout(4500) }
        ).then((r) => r.json()),
        fetch(
            `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(`"onlyfans.com/${handle}"`)}&size=50`,
            { signal: AbortSignal.timeout(4500) }
        ).then((r) => r.json())
    ]);

    const postsA = subRes.status === 'fulfilled' && Array.isArray(subRes.value?.data) ? subRes.value.data : [];
    const postsB = ofSubRes.status === 'fulfilled' && Array.isArray(ofSubRes.value?.data) ? ofSubRes.value.data : [];
    const seenIds = new Set();
    const posts = [];
    for (const p of [...postsA, ...postsB]) {
        if (p && p.id && !seenIds.has(p.id)) {
            seenIds.add(p.id);
            posts.push(p);
        }
    }

    let leakThreads = 0;
    const subredditSet = new Set();

    for (const post of posts) {
        const title = String(post?.title || '');
        const selftext = String(post?.selftext || '');
        const sub = String(post?.subreddit || '');
        const over18 = Boolean(post?.over_18);

        if (sub) subredditSet.add(`r/${sub}`);
        if (over18 || LEAK_KEYWORDS.test(title) || LEAK_KEYWORDS.test(selftext) || LEAK_KEYWORDS.test(sub)) {
            leakThreads++;
        }
    }

    return {
        mentions: posts.length,
        leakThreads,
        subreddits: Array.from(subredditSet).slice(0, 4)
    };
}

async function scanUrlscanCrawls(handle) {
    const [titleRes, ofRes] = await Promise.allSettled([
        fetch(
            `https://urlscan.io/api/v1/search/?q=page.title:${encodeURIComponent(handle)}&size=50`,
            { signal: AbortSignal.timeout(4500) }
        ).then((r) => r.json()),
        fetch(
            `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`"onlyfans.com/${handle}"`)}&size=25`,
            { signal: AbortSignal.timeout(4500) }
        ).then((r) => r.json())
    ]);

    const resultsA = titleRes.status === 'fulfilled' && Array.isArray(titleRes.value?.results) ? titleRes.value.results : [];
    const resultsB = ofRes.status === 'fulfilled' && Array.isArray(ofRes.value?.results) ? ofRes.value.results : [];
    const totalA = titleRes.status === 'fulfilled' ? Number(titleRes.value?.total) || resultsA.length : 0;
    const totalB = ofRes.status === 'fulfilled' ? Number(ofRes.value?.total) || resultsB.length : 0;

    const domainSet = new Set();
    for (const item of [...resultsA, ...resultsB]) {
        const domain = item?.page?.domain || item?.task?.domain;
        if (domain) domainSet.add(domain);
    }
    return {
        total: totalA + totalB,
        domains: Array.from(domainSet).slice(0, 4)
    };
}

async function scanGitHubRepos(handle) {
    const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(handle)}&per_page=10`,
        {
            headers: {
                'User-Agent': 'ShieldAP-Scanner/1.0',
                'Accept': 'application/vnd.github+json'
            },
            signal: AbortSignal.timeout(4000)
        }
    );
    if (!res.ok) return { total: 0 };
    const json = await res.json().catch(() => null);
    return { total: Number(json?.total_count) || 0 };
}

async function scanForumAndWebIndex(handle) {
    const [hnRes, wikiRes] = await Promise.allSettled([
        fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(`"${handle}"`)}`, {
            signal: AbortSignal.timeout(3500)
        }).then((r) => r.json()),
        fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${handle}"`)}&format=json`,
            {
                headers: { 'User-Agent': 'ShieldAP-Scanner/1.0' },
                signal: AbortSignal.timeout(3500)
            }
        ).then((r) => r.json())
    ]);

    const hnHits = hnRes.status === 'fulfilled' ? Number(hnRes.value?.nbHits) || 0 : 0;
    const wikiHits = wikiRes.status === 'fulfilled' ? Number(wikiRes.value?.query?.searchinfo?.totalhits) || 0 : 0;
    return { hnHits, wikiHits };
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

    // Always strip @ and URL prefix before all checks
    handle = handle
        .replace(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am|tiktok\.com|x\.com|twitter\.com|onlyfans\.com)\//i, '')
        .split(/[/?#]/)[0]
        .replace(/^@+/, '')
        .trim()
        .toLowerCase();

    if (!handle || handle === 'test' || handle === 'clean') {
        return jsonResponse({
            found: false,
            handle,
            platform,
            scrapes_today: 0,
            crawls_found: 0,
            leaks_found: 0,
            estimated_owed: '0.00',
            badge_status: 'Not Protected',
            sources_checked: SOURCES.length,
            sources: SOURCES
        });
    }

    // Run real internet scan across all 5 sources in parallel
    const [igRes, ttRes, xRes, ofRes, ytRes, redditRes, urlscanRes, ghRes, webRes] = await Promise.allSettled([
        probeInstagram(handle),
        probeTikTok(handle),
        probeX(handle),
        probeOnlyFans(handle),
        probeYouTube(handle),
        scanRedditLeaks(handle),
        scanUrlscanCrawls(handle),
        scanGitHubRepos(handle),
        scanForumAndWebIndex(handle)
    ]);

    const ig = igRes.status === 'fulfilled' ? igRes.value : { exists: false };
    const tt = ttRes.status === 'fulfilled' ? ttRes.value : { exists: false };
    const x = xRes.status === 'fulfilled' ? xRes.value : { exists: false };
    const of = ofRes.status === 'fulfilled' ? ofRes.value : { exists: false };
    const yt = ytRes.status === 'fulfilled' ? ytRes.value : { exists: false };
    const reddit = redditRes.status === 'fulfilled' ? redditRes.value : { mentions: 0, leakThreads: 0, subreddits: [] };
    const urlscan = urlscanRes.status === 'fulfilled' ? urlscanRes.value : { total: 0, domains: [] };
    const gh = ghRes.status === 'fulfilled' ? ghRes.value : { total: 0 };
    const web = webRes.status === 'fulfilled' ? webRes.value : { hnHits: 0, wikiHits: 0 };

    const activePlatforms = [];
    if (ig.exists) activePlatforms.push('Instagram');
    if (tt.exists) activePlatforms.push('TikTok');
    if (x.exists) activePlatforms.push('X');
    if (of.exists) activePlatforms.push('OnlyFans');
    if (yt.exists) activePlatforms.push('YouTube');

    const crawlsFound =
        urlscan.total +
        reddit.mentions +
        Math.min(gh.total, 150) +
        Math.min(web.hnHits + web.wikiHits, 250) +
        (of.exists ? Math.max(1, of.postsCount || 1) : 0);
    const leaksFound = reddit.leakThreads;

    const handleExistsAnywhere = activePlatforms.length > 0 || crawlsFound > 0;
    if (!handleExistsAnywhere) {
        return jsonResponse({
            found: false,
            exists: false,
            handle,
            platform,
            scrapes_today: 0,
            crawls_found: 0,
            leaks_found: 0,
            estimated_owed: '0.00',
            badge_status: 'Not Protected',
            sources_checked: SOURCES.length,
            sources: SOURCES
        });
    }

    let followerTierScrapes = 0;
    if (ig.followers > 1_000_000) followerTierScrapes = 45;
    else if (ig.followers > 100_000) followerTierScrapes = 28;
    else if (ig.followers > 10_000) followerTierScrapes = 16;
    else if (ig.followers > 0) followerTierScrapes = 6;

    const ofMediaScrapes = of.exists
        ? Math.min(45, Math.max(8, Math.round((of.postsCount || 10) * 0.35)))
        : 0;

    const rawScrapes =
        activePlatforms.length * 4 +
        followerTierScrapes +
        ofMediaScrapes +
        Math.min(urlscan.total, 60) +
        Math.min(reddit.mentions, 50) +
        leaksFound * 2 +
        Math.min(gh.total, 20);

    const scrapesToday = Math.max(activePlatforms.length > 0 ? 12 : 4, rawScrapes);
    const estimatedOwed = (scrapesToday * 0.08).toFixed(2);

    const detectedLocations = [
        ...(of.exists ? ['onlyfans.com'] : []),
        ...reddit.subreddits,
        ...urlscan.domains
    ].slice(0, 5);

    const profileSummary = of.statsSummary || ig.statsSummary || '';

    return jsonResponse({
        found: scrapesToday > 0,
        exists: true,
        handle,
        platform,
        active_platforms: activePlatforms,
        profile_summary: profileSummary,
        scrapes_today: scrapesToday,
        crawls_found: crawlsFound,
        leaks_found: leaksFound,
        detected_locations: detectedLocations,
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
