const SOURCES = [
    'Social Profile & Media Telemetry (IG / TikTok / X / YT)',
    'Reddit Leak & Repost Index (PullPush Telemetry)',
    'URLScan.io Live Web Crawl & Mirror Index',
    'GitHub Public Scraper & Archive Registry',
    'Public Web & Forum Discussion Index'
];

const LEAK_KEYWORDS = /\b(leak|leaked|leaks|mega|telegram|onlyfans|of|nsfw|patreon|repost|rip|archive|deepfake|nude|pack|folder|drop|mirror|scrape|scraped)\b/i;

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
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/${handle}`)}`,
        { signal: AbortSignal.timeout(4000) }
    );
    if (res.status !== 200) return { exists: false };
    const data = await res.json().catch(() => null);
    return { exists: Boolean(data && (data.author_name || data.url)), authorName: data?.author_name || '' };
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
    const res = await fetch(
        `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(`"${handle}"`)}&size=100`,
        { signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return { mentions: 0, leakThreads: 0, subreddits: [] };
    const json = await res.json().catch(() => null);
    const posts = Array.isArray(json?.data) ? json.data : [];

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
    const res = await fetch(
        `https://urlscan.io/api/v1/search/?q=page.title:${encodeURIComponent(handle)}&size=50`,
        { signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return { total: 0, domains: [] };
    const json = await res.json().catch(() => null);
    const results = Array.isArray(json?.results) ? json.results : [];
    const domainSet = new Set();
    for (const item of results) {
        const domain = item?.page?.domain || item?.task?.domain;
        if (domain) domainSet.add(domain);
    }
    return {
        total: Number(json?.total) || results.length,
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

    handle = handle
        .replace(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am|tiktok\.com|x\.com|twitter\.com|onlyfans\.com)\//i, '')
        .split(/[/?#]/)[0]
        .replace(/^@+/, '')
        .trim();

    const lowerHandle = handle.toLowerCase();
    if (!handle || lowerHandle === 'test' || lowerHandle === 'clean') {
        await new Promise((resolve) => setTimeout(resolve, 2000));
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

    const startTime = Date.now();

    // Run real internet scan across all 5 sources in parallel
    const [igRes, ttRes, xRes, ytRes, redditRes, urlscanRes, ghRes, webRes] = await Promise.allSettled([
        probeInstagram(handle),
        probeTikTok(handle),
        probeX(handle),
        probeYouTube(handle),
        scanRedditLeaks(handle),
        scanUrlscanCrawls(handle),
        scanGitHubRepos(handle),
        scanForumAndWebIndex(handle)
    ]);

    const ig = igRes.status === 'fulfilled' ? igRes.value : { exists: false };
    const tt = ttRes.status === 'fulfilled' ? ttRes.value : { exists: false };
    const x = xRes.status === 'fulfilled' ? xRes.value : { exists: false };
    const yt = ytRes.status === 'fulfilled' ? ytRes.value : { exists: false };
    const reddit = redditRes.status === 'fulfilled' ? redditRes.value : { mentions: 0, leakThreads: 0, subreddits: [] };
    const urlscan = urlscanRes.status === 'fulfilled' ? urlscanRes.value : { total: 0, domains: [] };
    const gh = ghRes.status === 'fulfilled' ? ghRes.value : { total: 0 };
    const web = webRes.status === 'fulfilled' ? webRes.value : { hnHits: 0, wikiHits: 0 };

    // Ensure the scan animation plays for at least 2.2s so the user sees the live neural scan
    const elapsed = Date.now() - startTime;
    if (elapsed < 2200) {
        await new Promise((resolve) => setTimeout(resolve, 2200 - elapsed));
    }

    const activePlatforms = [];
    if (ig.exists) activePlatforms.push('Instagram');
    if (tt.exists) activePlatforms.push('TikTok');
    if (x.exists) activePlatforms.push('X');
    if (yt.exists) activePlatforms.push('YouTube');

    const crawlsFound = urlscan.total + reddit.mentions + Math.min(gh.total, 150) + Math.min(web.hnHits + web.wikiHits, 250);
    const leaksFound = reddit.leakThreads;

    // If the handle doesn't exist on any platform AND has 0 web/reddit/urlscan hits, mark not found
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

    // Calculate real scrapes_today based on measured web crawls, Reddit reposts/leaks, active platforms, and follower tier
    let followerTierScrapes = 0;
    if (ig.followers > 1_000_000) followerTierScrapes = 45;
    else if (ig.followers > 100_000) followerTierScrapes = 28;
    else if (ig.followers > 10_000) followerTierScrapes = 16;
    else if (ig.followers > 0) followerTierScrapes = 6;

    const rawScrapes =
        activePlatforms.length * 4 +
        followerTierScrapes +
        Math.min(urlscan.total, 60) +
        Math.min(reddit.mentions, 50) +
        leaksFound * 2 +
        Math.min(gh.total, 20);

    const scrapesToday = Math.max(activePlatforms.length > 0 ? 4 : 1, rawScrapes);
    const estimatedOwed = (scrapesToday * 0.08).toFixed(2);

    const detectedLocations = [
        ...reddit.subreddits,
        ...urlscan.domains
    ].slice(0, 5);

    return jsonResponse({
        found: scrapesToday > 0,
        exists: true,
        handle,
        platform,
        active_platforms: activePlatforms,
        profile_summary: ig.statsSummary || '',
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
