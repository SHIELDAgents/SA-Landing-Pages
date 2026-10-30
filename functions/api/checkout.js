// Server-side checkout: creates a BTCPay (Greenfield) invoice or a Wompi payment link
// and returns the processor's hosted checkout URL. Secrets never reach the browser.
//
// Required Cloudflare Pages secrets:
//   BTCPAY_URL          e.g. https://btcpay.example.com   (no trailing slash)
//   BTCPAY_API_KEY      Greenfield API key (needs btcpay.store.cancreateinvoice)
//   BTCPAY_STORE_ID     Store ID from BTCPay > Store Settings > General
//   WOMPI_PRIVATE_KEY   prv_prod_...
// Optional:
//   WOMPI_USD_TO_COP    default 4200

// Prices are authoritative server-side — never trust the amount sent by the client.
const PLANS = {
    monthly:        { title: 'Monthly Shield // IP & Leak Deletion', usd: 49.99 },
    yearly:         { title: 'Annual Shield // Full Year Protection', usd: 399.00 },
    status_shield:  { title: 'PEACE Protocol // Status Shield', usd: 139.00 },
    irl_ghost:      { title: 'PEACE Protocol // IRL Ghost (1hr Deposit)', usd: 1400.00 },
    ghost_protocol: { title: 'PEACE Protocol // Ghost Protocol', usd: 3500.00 },
    status_tag:     { title: 'AURA Protocol // Status Tag', usd: 169.00 },
    irl_status:     { title: 'AURA Protocol // IRL Status (1hr Deposit)', usd: 1700.00 },
    aura_protocol:  { title: 'AURA Protocol // Aura Protocol', usd: 3700.00 }
};

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

function clean(value, max = 200) {
    return String(value || '').trim().slice(0, max);
}

async function createBtcpayInvoice(env, order, redirectUrl) {
    if (!env.BTCPAY_URL || !env.BTCPAY_API_KEY || !env.BTCPAY_STORE_ID) {
        throw new Error('BTCPay is not configured');
    }
    const base = env.BTCPAY_URL.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/v1/stores/${encodeURIComponent(env.BTCPAY_STORE_ID)}/invoices`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${env.BTCPAY_API_KEY}`
        },
        body: JSON.stringify({
            amount: order.usd.toFixed(2),
            currency: 'USD',
            metadata: {
                orderId: order.reference,
                itemDesc: order.title,
                plan: order.plan,
                handle: order.handle,
                buyerEmail: order.email || undefined,
                alias: order.alias
            },
            checkout: {
                redirectURL: redirectUrl,
                redirectAutomatically: true
            },
            receipt: { enabled: true }
        })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.checkoutLink) {
        const msg = (data && (data.message || data.error || JSON.stringify(data))) || '';
        if (msg.toLowerCase().includes('full node not available') || msg.toLowerCase().includes('node')) {
            throw new Error('BTCPay Bitcoin node is currently syncing blocks with the blockchain. Please allow time for synchronization to finish, or pay with Card.');
        }
        throw new Error('BTCPay invoice creation failed: ' + (msg || res.status));
    }
    return data.checkoutLink;
}

async function createWompiLink(env, order, redirectUrl) {
    if (!env.WOMPI_PRIVATE_KEY) throw new Error('Wompi is not configured');
    const rate = Number(env.WOMPI_USD_TO_COP) || 4200;
    const res = await fetch('https://production.wompi.co/v1/payment_links', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.WOMPI_PRIVATE_KEY}`
        },
        body: JSON.stringify({
            name: order.title,
            description: `SHIELD AP — ${order.reference} (${order.handle || 'Operative'})`.slice(0, 255),
            single_use: true,
            collect_shipping: false,
            currency: 'COP',
            amount_in_cents: Math.round(order.usd * rate * 100),
            redirect_url: redirectUrl,
            sku: order.reference.slice(0, 36)
        })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.data || !data.data.id) {
        throw new Error('Wompi link failed: ' + res.status + ' ' + JSON.stringify(data || {}));
    }
    return `https://checkout.wompi.co/l/${data.data.id}`;
}

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch (_) {
        return json({ error: 'Invalid JSON' }, 400);
    }

    const rail = clean(body.rail, 20);
    const planKey = clean(body.plan, 40);
    const plan = PLANS[planKey];
    if (!plan) return json({ error: 'Unknown plan' }, 400);
    if (rail !== 'btcpay' && rail !== 'wompi') return json({ error: 'Unknown payment rail' }, 400);

    const order = {
        plan: planKey,
        title: plan.title,
        usd: plan.usd,
        handle: clean(body.handle, 120),
        email: clean(body.email, 160),
        alias: clean(body.alias, 300),
        reference: `SHLD-${planKey.toUpperCase()}-${Date.now()}`
    };

    const origin = new URL(request.url).origin;
    const redirectUrl = `${origin}/index.html?status=purchased&ref=${encodeURIComponent(order.reference)}`;

    try {
        const url = rail === 'btcpay'
            ? await createBtcpayInvoice(env, order, redirectUrl)
            : await createWompiLink(env, order, redirectUrl);
        return json({ url, reference: order.reference });
    } catch (err) {
        console.error('[checkout]', rail, err && err.message);
        return json({ error: (err && err.message) || 'Checkout unavailable. Please try again or use the other payment rail.' }, 502);
    }
}

export async function onRequest() {
    return json({ error: 'Method not allowed' }, 405);
}
