/**
 * Fedix Coins — Cloudflare Worker
 *
 * Handles three routes; everything else passes through to GitHub Pages:
 *
 *   /item.html?index=N  → injects per-item SEO into the page: <title>, meta
 *                         description, canonical, Open Graph / Twitter tags and
 *                         a schema.org Product (JSON-LD) with the price in ARS.
 *   /feed.xml           → Google Merchant Center product feed (RSS 2.0 + g:),
 *                         built on the fly from items.json: available coins
 *                         only, priced in ARS at the Dólar Blue sell rate.
 *   /sitemap.xml        → home page + every available item.
 *
 * Prices in the feed and in the item page JSON-LD use the same rate (cached at
 * the edge for 1 hour), so Merchant Center sees matching prices.
 *
 * Deploy:
 *   1. Cloudflare Dashboard → Workers & Pages → (this worker) → Edit code →
 *      paste this file → Deploy
 *   2. Worker Settings → Domains & Routes → routes:
 *        fedixcoins.com.ar/item.html*
 *        fedixcoins.com.ar/feed.xml
 *        fedixcoins.com.ar/sitemap.xml
 *
 * Also required (one-time):
 *   • Enable Cloudflare proxy (orange cloud) on DNS A records and CNAME
 *   • SSL/TLS → Overview → set mode to "Full"; Edge Certificates → Always Use HTTPS
 */

const SITE     = 'https://fedixcoins.com.ar';
const RATE_API = 'https://dolarapi.com/v1/dolares/blue';

// items.json uses Spanish country names except for the United States.
const COUNTRY_ES = { USA: 'Estados Unidos' };

const CAT_COINS = 'Arts & Entertainment > Hobbies & Creative Arts > Collectibles > Collectible Coins & Currency';
const CAT_BOOKS = 'Media > Books';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  try {
    if (url.pathname === '/feed.xml')    return await handleFeed(url);
    if (url.pathname === '/sitemap.xml') return await handleSitemap(url);
    if (url.pathname === '/item.html')   return await handleItem(request, url);
  } catch (err) {
    // Never break the site because of the SEO layer: fall back to origin.
    if (url.pathname === '/item.html') return fetch(request);
    return new Response(`Error: ${err.message}`, { status: 503 });
  }
  return fetch(request);
}

// ── Data ──────────────────────────────────────────────────

async function getItems(origin) {
  const res = await fetch(new URL('/items.json', origin), {
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`items.json ${res.status}`);
  return res.json();
}

// Dólar Blue sell rate, same source as currency.js. null if unavailable.
async function getRate() {
  try {
    const res  = await fetch(RATE_API, { cf: { cacheTtl: 3600, cacheEverything: true } });
    const rate = parseFloat((await res.json()).venta);
    return rate > 0 ? rate : null;
  } catch (_) {
    return null;
  }
}

// Mirrors formatPrice() in currency.js: whole pesos.
function toArs(usd, rate) {
  return Math.round(usd * rate);
}

function isAvailable(item) {
  return !item.sold && typeof item.price === 'number' && item.images?.length > 0;
}

// Mirrors isItemExpired() in item.js: sold more than a month ago.
function isExpired(item) {
  if (!item.soldon) return false;
  const [d, m, y] = item.soldon.split('-').map(Number);
  if ([d, m, y].some(isNaN)) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1);
  return new Date(y, m - 1, d) < cutoff;
}

// ── Item helpers ──────────────────────────────────────────

// Mirrors getItemTitle() in i18n.js
function getItemTitle(item) {
  return item.title
    || (item.denomination ? `${item.denomination} ${item.year}` : String(item.year));
}

function countryEs(item) {
  return COUNTRY_ES[item.country] || item.country || '';
}

function itemUrl(index) {
  return `${SITE}/item.html?index=${index}`;
}

function imageUrls(item) {
  return (item.images || []).map(p => `${SITE}/${p.split('/').map(encodeURIComponent).join('/')}`);
}

function isNewCondition(item) {
  return item.book && item.ml_condition !== 'used';
}

// Plain-text description: the item's own text plus its technical data.
function itemDescription(item) {
  const parts = [];
  if (item.description) parts.push(item.description.trim());
  else parts.push(`${getItemTitle(item)}${item.country ? ` — ${countryEs(item)}` : ''}.`);

  const facts = [];
  if (!item.book && item.condition) facts.push(`Estado: ${item.condition}`);
  if (item.year)        facts.push(`Año: ${item.year}`);
  if (item.mint)        facts.push(`${item.book ? 'Editorial' : 'Ceca'}: ${item.mint}`);
  if (item.composition) facts.push(`Composición: ${item.composition}`);
  if (item.weight)      facts.push(`Peso: ${item.weight}`);
  if (item.diameter)    facts.push(`Diámetro: ${item.diameter}`);
  if (item.mintage)     facts.push(`Tirada: ${item.mintage.toLocaleString('es-AR')}`);
  if (item.variety)     facts.push(`Variante: ${item.variety}`);
  if (item.reference)   facts.push(`Referencia: ${item.reference}`);
  if (facts.length) parts.push(facts.join('. ') + '.');

  return parts.join(' ');
}

// Short version for <meta name="description"> (Google shows ~155 chars).
function metaDescription(item) {
  const base = item.description
    ? item.description.trim()
    : `${getItemTitle(item)}${item.country ? `, ${countryEs(item)}` : ''}.`;
  const grade = !item.book && item.condition ? ` Estado ${item.condition}.` : '';
  return truncate(`${base}${grade} Fedix Coins, numismática en Mar del Plata.`, 300);
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, str.lastIndexOf(' ', max - 1)) + '…';
}

// ── /item.html ────────────────────────────────────────────

async function handleItem(request, url) {
  const index = parseInt(url.searchParams.get('index') ?? '');
  if (isNaN(index)) return fetch(request);

  const [items, rate, pageRes] = await Promise.all([
    getItems(url.origin),
    getRate(),
    fetch(request),
  ]);
  if (!pageRes.ok) return pageRes;

  const item = items[index];
  // Unknown / expired index — serve page as-is; item.js redirects to index.html
  if (!item || isExpired(item)) return pageRes;

  const title     = getItemTitle(item);
  const pageTitle = item.book || !item.country
    ? `${title} | Fedix Coins`
    : `${title} · ${countryEs(item)} | Fedix Coins`;
  const canonical = itemUrl(index);
  const images    = imageUrls(item);
  const desc      = metaDescription(item);

  let html = await pageRes.text();

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(pageTitle)}</title>`);

  html = setMeta(html, 'name',     'description',         desc);
  html = setMeta(html, 'property', 'og:type',             'product');
  html = setMeta(html, 'property', 'og:title',            title);
  html = setMeta(html, 'property', 'og:description',      desc);
  html = setMeta(html, 'property', 'og:url',              canonical);
  html = setMeta(html, 'property', 'og:image',            images[0] || '');
  html = setMeta(html, 'name',     'twitter:title',       title);
  html = setMeta(html, 'name',     'twitter:description', desc);
  html = setMeta(html, 'name',     'twitter:image',       images[0] || '');

  const head = [
    `<link rel="canonical" href="${esc(canonical)}">`,
    jsonLd(productSchema(item, index, rate)),
    jsonLd(breadcrumbSchema(item, index)),
  ].join('\n  ');
  html = html.replace('</head>', `  ${head}\n</head>`);

  const headers = new Headers(pageRes.headers);
  headers.set('content-type', 'text/html;charset=UTF-8');
  return new Response(html, { status: pageRes.status, headers });
}

function productSchema(item, index, rate) {
  const price = typeof item.price === 'number' ? item.price : null;
  const offer = {
    '@type':         'Offer',
    url:             itemUrl(index),
    availability:    isAvailable(item) ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    itemCondition:   isNewCondition(item) ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
    seller:          { '@type': 'Organization', name: 'Fedix Coins', url: `${SITE}/` },
  };
  // ARS when the rate is available (matches feed.xml); USD otherwise.
  if (price !== null) {
    offer.price         = rate ? toArs(price, rate) : price;
    offer.priceCurrency = rate ? 'ARS' : 'USD';
  }

  return {
    '@context':  'https://schema.org',
    '@type':     'Product',
    name:        getItemTitle(item),
    description: itemDescription(item),
    image:       imageUrls(item),
    sku:         String(index),
    category:    item.book ? 'Álbumes y catálogos numismáticos' : 'Monedas de colección',
    ...(item.country && { countryOfOrigin: countryEs(item) }),
    offers:      offer,
  };
}

function breadcrumbSchema(item, index) {
  return {
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Fedix Coins', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: getItemTitle(item), item: itemUrl(index) },
    ],
  };
}

function jsonLd(obj) {
  // Escape "<" so item text can never close the <script> tag.
  const json = JSON.stringify(obj).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

// ── /feed.xml (Google Merchant Center) ────────────────────

async function handleFeed(url) {
  const [items, rate] = await Promise.all([getItems(url.origin), getRate()]);
  // Without a rate we can't price in ARS: fail so Merchant Center keeps the
  // previous fetch instead of ingesting wrong prices.
  if (!rate) return new Response('Exchange rate unavailable', { status: 503 });

  const entries = [];
  items.forEach((item, index) => {
    if (!isAvailable(item)) return;
    const imgs = imageUrls(item);
    const country = countryEs(item);
    const title = item.book || !country ? getItemTitle(item) : `${getItemTitle(item)} - ${country}`;

    const fields = [
      ['g:id',                    String(index)],
      ['g:title',                 truncate(title, 150)],
      ['g:description',           truncate(itemDescription(item), 5000)],
      ['g:link',                  itemUrl(index)],
      ['g:image_link',            imgs[0]],
      ...imgs.slice(1, 11).map(u => ['g:additional_image_link', u]),
      ['g:availability',          'in_stock'],
      ['g:price',                 `${toArs(item.price, rate)} ARS`],
      ['g:condition',             isNewCondition(item) ? 'new' : 'used'],
      ['g:identifier_exists',     'no'],
      ['g:google_product_category', item.book ? CAT_BOOKS : CAT_COINS],
      ['g:product_type',          item.book ? 'Álbumes y catálogos' : `Monedas > ${country || 'Otros'}`],
    ];
    if (item.year) fields.push(['g:custom_label_0', String(item.year)]);
    if (!item.book && item.condition) fields.push(['g:custom_label_1', item.condition]);

    entries.push(
      '    <item>\n' +
      fields.map(([k, v]) => `      <${k}>${escXml(v)}</${k}>`).join('\n') +
      '\n    </item>'
    );
  });

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n' +
    '  <channel>\n' +
    '    <title>Fedix Coins</title>\n' +
    `    <link>${SITE}/</link>\n` +
    '    <description>Monedas de colección de Estados Unidos, Argentina y Uruguay — Mar del Plata, Argentina.</description>\n' +
    entries.join('\n') + '\n' +
    '  </channel>\n' +
    '</rss>\n';

  return xmlResponse(xml);
}

// ── /sitemap.xml ──────────────────────────────────────────

async function handleSitemap(url) {
  const items = await getItems(url.origin);
  const urls  = [`${SITE}/`];
  items.forEach((item, index) => {
    if (isAvailable(item)) urls.push(itemUrl(index));
  });

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url><loc>${escXml(u)}</loc></url>`).join('\n') + '\n' +
    '</urlset>\n';

  return xmlResponse(xml);
}

function xmlResponse(xml) {
  return new Response(xml, {
    headers: {
      'content-type':  'application/xml;charset=UTF-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

// ── String helpers ────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escXml(str) {
  return esc(str).replace(/'/g, '&apos;');
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
