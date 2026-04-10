/**
 * Fedix Coins — Cloudflare Worker
 *
 * Intercepts requests to item.html?index=N, fetches items.json from origin,
 * and injects per-item Open Graph / Twitter tags into the HTML before serving it.
 * All other requests pass through to GitHub Pages unchanged.
 *
 * Deploy:
 *   1. Cloudflare Dashboard → Workers & Pages → Create Worker
 *   2. Use the inline editor (not the uploader) → paste this file → Deploy
 *   3. Worker Settings → Triggers → Add route: fedixcoins.com.ar/item.html*
 *
 * Also required (one-time):
 *   • Enable Cloudflare proxy (orange cloud) on DNS A records and CNAME
 *   • SSL/TLS → Overview → set mode to "Full"
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const url   = new URL(request.url);
    const index = parseInt(url.searchParams.get('index') ?? '');

    // Pass through anything that isn't a valid item.html?index=N request
    if (url.pathname !== '/item.html' || isNaN(index)) {
      return fetch(request);
    }

    // Fetch items.json and the page HTML from origin in parallel.
    // items.json is cached at the edge for 5 minutes.
    const [itemsRes, pageRes] = await Promise.all([
      fetch(new URL('/items.json', url.origin), {
        cf: { cacheTtl: 300, cacheEverything: true },
      }),
      fetch(request),
    ]);

    if (!pageRes.ok) return pageRes;

    const items = await itemsRes.json();
    const item  = items[index];

    // Unknown index — serve page as-is; item.js will redirect to index.html
    if (!item) return pageRes;

    const title    = getItemTitle(item);
    const imageUrl = item.images?.[0] ? `${url.origin}/${item.images[0]}` : '';

    let html = await pageRes.text();

    // Update <title> for search engines
    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${esc(title)} \u2014 Fedix Coins</title>`,
    );

    // Replace content of the existing OG / Twitter tags in item.html
    html = setMeta(html, 'property', 'og:title',     title);
    html = setMeta(html, 'property', 'og:url',        url.href);
    html = setMeta(html, 'property', 'og:image',      imageUrl);
    html = setMeta(html, 'name',     'twitter:title', title);
    html = setMeta(html, 'name',     'twitter:image', imageUrl);

    const headers = new Headers(pageRes.headers);
    headers.set('content-type', 'text/html;charset=UTF-8');

    return new Response(html, { status: pageRes.status, headers });
}

// ── Helpers ───────────────────────────────────────────────

// Mirrors getItemTitle() in i18n.js
function getItemTitle(item) {
  return item.title
    || (item.denomination ? `${item.denomination} ${item.year}` : String(item.year));
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setMeta(html, attr, key, value) {
  // Matches <meta property/name="KEY" ... content="OLD"> (attribute order as in item.html)
  const re = new RegExp(
    `(<meta\\s+${escRe(attr)}="${escRe(key)}"[^>]*\\scontent=")[^"]*(")`
  );
  return html.replace(re, `$1${esc(value)}$2`);
}

function escRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
