# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

A static numismatic (coin-selling) storefront. No build tools, frameworks, or package manager — open `index.html` directly in a browser or serve with any static file server (e.g. `python -m http.server`).

## Architecture

- **`items.json`** — single source of truth for all listings. Fields: `id`, `title`, `price`, `condition`, `country`, `year`, `quantity` (optional, internal stock — default 1, **never shown on the site**), `description` (optional), `images` (array of paths relative to root).
- **`i18n.js`** — loaded first on both pages. Exposes `t(key)`, `getLang()`, `setLang(lang)`, `nItems(n)`, `waMessage(title, year)`. Language preference is stored in `localStorage` under `fedix_lang`. Default is `"es"`.
- **`index.html` + `script.js`** — catalog page. Two sections (`#section-coins`, `#section-about`) toggled via nav tabs and footer links. Section state is reflected in the URL hash (`#about`). Filters (country, condition) are populated dynamically from `items.json`.
- **`item.html` + `item.js`** — detail page. Reads `?id` from the URL. Re-renders on language change (`langchange` event). Includes gallery with thumbnails, lightbox (click image or Esc to close), and WhatsApp button.
- **`styles.css`** — shared stylesheet. Dark antiquarian theme. CSS variables in `:root`.
- **`images/`** — coin photos referenced by relative path in `items.json`.

## Key Details

- Brand name **"Fedix Coins"** is hardcoded in both HTML files — it intentionally does not change with the selected language.
- The seller's WhatsApp number is `PHONE = "5492235831244"` at the top of `script.js` and `item.js`. Update both if it changes.
- Adding a new item: append an entry to `items.json` and place its images under `images/`. No other files need to change on the site; publish it to MercadoLibre with the `mercadolibre-sync` skill.
- **`items.json` is append-only**: the array index is the coin's identity (used by `item.html?index=N`, `worker.js`, and as `SELLER_SKU` on MercadoLibre). Never reorder or delete entries — sold coins stay with `sold: true` + `soldon` (`DD-MM-YYYY`).
- `fetch("items.json")` requires an HTTP server — the page won't work when opened as a `file://` URL.

## MercadoLibre sync

`tools/mercadolibre/ml_sync.py` keeps `items.json` and MercadoLibre in sync through the ML API (see `.agents/skills/mercadolibre-sync/SKILL.md`). Sale on the site → `sold-web` (qty −1; at 0 marks sold and closes the ML listing). Sale on ML → `sync-orders` (qty −1; relists on ML if stock remains, otherwise marks sold). Coins are listed used, stock 1; catalogs/albums (`book: true`) new with their whole stock, in their own ML category and package size. Mapping index → ML id lives in `tools/mercadolibre/ml_state.json`; policy in `ml_config.json`; tokens in the gitignored `_credentials.json`.
