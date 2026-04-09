// currency.js — Fedix Coins ARS/USD toggle & exchange rate
// Uses dolarapi.com/v1/dolares/blue, which mirrors the Dólar Blue Venta
// rate published by dolarhoy.com and supports browser fetch (CORS-open).
(function () {
  const RATE_KEY     = 'fedix_ars_rate';
  const RATE_TS_KEY  = 'fedix_ars_rate_ts';
  const CURRENCY_KEY = 'fedix_currency';
  const API_URL      = 'https://dolarapi.com/v1/dolares/blue';

  // Returns true when the cached timestamp predates today's 04:00 AM cutoff.
  function needsRefresh(ts) {
    if (!ts) return true;
    const now    = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(4, 0, 0, 0);
    // Before 4 AM today → compare against yesterday's 4 AM
    if (now < cutoff) cutoff.setDate(cutoff.getDate() - 1);
    return ts < cutoff.getTime();
  }

  async function fetchBlueRate() {
    try {
      const res  = await fetch(API_URL);
      const data = await res.json();
      const rate = parseFloat(data.venta);
      if (!isNaN(rate) && rate > 0) {
        localStorage.setItem(RATE_KEY,    String(rate));
        localStorage.setItem(RATE_TS_KEY, String(Date.now()));
        return rate;
      }
    } catch (_) {
      // Network error — fall through to cached value
    }
    const cached = parseFloat(localStorage.getItem(RATE_KEY));
    return isNaN(cached) ? null : cached;
  }

  // ── Public API ───────────────────────────────────────────

  window.getCurrency = () => localStorage.getItem(CURRENCY_KEY) || 'USD';

  window.setCurrency = (c) => {
    localStorage.setItem(CURRENCY_KEY, c);
    document.dispatchEvent(new Event('currencychange'));
  };

  window.getRate = () => {
    const r = parseFloat(localStorage.getItem(RATE_KEY));
    return isNaN(r) ? null : r;
  };

  const arsFormatter = new Intl.NumberFormat('es-AR', {
    style:                'currency',
    currency:             'ARS',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  // Converts "USD 150" → the active-currency display string.
  // Falls back to the original USD string when the rate is unavailable.
  window.formatPrice = (usdStr) => {
    if (getCurrency() !== 'ARS') return usdStr;
    const rate = getRate();
    if (!rate) return usdStr;
    const usd = parseFloat((usdStr || '0').replace(/[^0-9.]/g, ''));
    if (isNaN(usd)) return usdStr;
    return arsFormatter.format(Math.round(usd * rate));
  };

  // Wires up the USD / ARS toggle buttons and keeps their active state in sync.
  window.setupCurrencyToggle = function () {
    const syncBtns = () => {
      document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.currency === getCurrency());
      });
    };
    document.querySelectorAll('.currency-btn').forEach(btn => {
      btn.addEventListener('click', () => setCurrency(btn.dataset.currency));
    });
    document.addEventListener('currencychange', syncBtns);
    syncBtns();
  };

  // On load: refresh rate if stale; if ARS is already selected, trigger a
  // re-render so pages display the freshly fetched rate immediately.
  (async function init() {
    const ts = parseInt(localStorage.getItem(RATE_TS_KEY), 10);
    if (needsRefresh(ts)) {
      await fetchBlueRate();
      if (getCurrency() === 'ARS') {
        document.dispatchEvent(new Event('currencychange'));
      }
    }
  })();
})();
