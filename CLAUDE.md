# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static numismatic (coin-selling) storefront. No build tools, frameworks, or package manager — open `index.html` directly in a browser or serve with any static file server (e.g. `python -m http.server`).

## Architecture

- **`items.json`** — single source of truth for all listings. Each item has: `id`, `title`, `price`, `condition`, `country`, `year`, `images` (array of paths relative to root), and optionally `description` (shown on the detail page).
- **`index.html` + `script.js`** — catalog page. Fetches `items.json`, renders a responsive card grid with per-card image carousels. Clicking an image navigates to `item.html?id=<id>`.
- **`item.html` + `item.js`** — detail page. Reads `?id` from the URL, finds the matching item in `items.json`, and renders a gallery + info panel with a WhatsApp contact button.
- **`styles.css`** — shared stylesheet for both pages. Dark theme (`#0f1115` background).
- **`images/`** — coin photos referenced by relative path in `items.json`.

## Key Details

- The seller's WhatsApp number is hardcoded as `PHONE = "5492235831244"` at the top of both `script.js` and `item.js`. Update both if it changes.
- Adding a new item: append an entry to `items.json` and place its images under `images/`. No other files need to change.
- `fetch("items.json")` requires an HTTP server — the page won't work when opened as a local `file://` URL due to CORS restrictions on fetch.
