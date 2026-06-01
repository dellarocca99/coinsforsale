const PHONE = "5492235831244";

// Chevron glyphs for the carousel nav — SVG for crisp, optically centered arrows.
const CHEV_LEFT  = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 2 4 6 8 10"/></svg>`;
const CHEV_RIGHT = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 2 8 6 4 10"/></svg>`;

let allItems    = [];
let currentPage = 1;
let itemsPerPage = parseInt(localStorage.getItem("fedix_per_page"), 10) || 24;

// ── Boot ─────────────────────────────────────────────────

fetch("items.json")
  .then(res => res.json())
  .then(items => {
    allItems = items;
    // Tag each item with its stable index in O(N) without copying objects.
    // _gi is used in place of allItems.indexOf(item) (O(1) vs O(N)).
    // _idx (carousel slide) is initialised lazily in advanceCarousel.
    items.forEach((item, i) => { item._gi = i; });

    // ── Phase 1: critical path ──────────────────────────
    // Translate static UI and render the first page. The browser can
    // paint as soon as this synchronous block returns.
    applyTranslations();
    renderItems(getFiltered());
    renderBooks(getFilteredBooks());

    // ── Phase 2: deferred setup ─────────────────────────
    // Everything else (filter population, event wiring) is deferred one
    // task so the browser gets a chance to paint Phase 1 first.
    setTimeout(() => {
      populateFilters(allItems);
      const hadSavedState = restoreFilterState();
      populateBooksFilters(allItems);
      setupControls();
      setupBooksControls();
      setupPagination();
      setupLangToggle();
      setupCurrencyToggle();
      setupSectionNav();
      if (hadSavedState) {
        renderItems(getFiltered());
        renderBooks(getFilteredBooks());
      }
      document.addEventListener("currencychange", () => {
        renderItems(getFiltered());
        renderBooks(getFilteredBooks());
      });
    }, 0);
  });

// ── i18n ─────────────────────────────────────────────────

function applyTranslations() {
  document.documentElement.lang = getLang();

  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  // Sync active lang button
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === getLang());
  });
}

function setupLangToggle() {
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });

  document.addEventListener("langchange", () => {
    applyTranslations();
    renderItems(getFiltered());
    renderBooks(getFilteredBooks());
  });
}

// ── Section navigation ───────────────────────────────────

function showSection(id) {
  document.querySelectorAll("[id^='section-']").forEach(s => {
    s.hidden = s.id !== `section-${id}`;
  });
  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.section === id);
  });
  document.querySelectorAll(".footer-link[data-section]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.section === id);
  });
  history.replaceState(null, "", id === "coins" ? location.pathname : `#${id}`);
}

function setupSectionNav() {
  document.querySelectorAll(".nav-tab, .footer-link[data-section]").forEach(btn => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  // Honor URL hash on page load
  const hash = location.hash.slice(1);
  if (hash === "about" || hash === "books") showSection(hash);
}

// ── Filter persistence ───────────────────────────────────

const FILTER_KEY = "fedix_filters";

function saveFilterState() {
  sessionStorage.setItem(FILTER_KEY, JSON.stringify({
    search:       document.getElementById("search").value,
    country:      document.getElementById("filter-country").value,
    region:       document.getElementById("filter-region").value,
    denomination: document.getElementById("filter-denomination").value,
    sort:         document.getElementById("sort").value,
    page:         currentPage,
  }));
}

// Returns true when state was restored (caller should re-render).
function restoreFilterState() {
  const raw = sessionStorage.getItem(FILTER_KEY);
  if (!raw) return false;
  let s;
  try { s = JSON.parse(raw); } catch { return false; }
  document.getElementById("search").value = s.search || "";
  document.getElementById("filter-country").value = s.country || "";
  document.getElementById("sort").value = s.sort || "year-asc";
  if (s.page) currentPage = s.page;
  if (s.country) {
    updateRegionFilter(s.country);
    updateDenominationFilter(s.country);
    if (s.region)       document.getElementById("filter-region").value = s.region;
    if (s.denomination) document.getElementById("filter-denomination").value = s.denomination;
  }
  return true;
}

// ── Filters ──────────────────────────────────────────────

function populateFilters(items) {
  const coinItems = items.filter(i => !i.book);
  const countries = [...new Set(coinItems.map(i => i.country).filter(Boolean))].sort();
  appendOptions("filter-country", countries);
  updateRegionFilter("");
  updateDenominationFilter("");
}

// Rebuilds the region <select> options for the given country (empty = all countries).
// Hides the select entirely when no items have a region for that country.
function updateRegionFilter(countryValue) {
  const sel = document.getElementById("filter-region");
  while (sel.options.length > 1) sel.remove(1);

  const regions = [...new Set(
    allItems
      .filter(i => !i.book && (!countryValue || i.country === countryValue))
      .map(i => i.region)
      .filter(Boolean)
  )].sort();

  regions.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    sel.appendChild(opt);
  });

  // Reset selection if the current value is no longer in the list
  if (!regions.includes(sel.value)) sel.value = "";

  // Show only when a specific country is selected and it has regions
  sel.hidden = !countryValue || regions.length === 0;
}

// Rebuilds the denomination <select> scoped to the chosen country.
// Appears only after a country is selected and that country's catalog
// contains denominations worth filtering by.
function updateDenominationFilter(countryValue) {
  const sel = document.getElementById("filter-denomination");
  while (sel.options.length > 1) sel.remove(1);

  if (!countryValue) { sel.hidden = true; sel.value = ""; return; }

  const denoms = [...new Set(
    allItems
      .filter(i => !i.book && i.country === countryValue)
      .map(i => i.denomination)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  denoms.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    sel.appendChild(opt);
  });

  if (!denoms.includes(sel.value)) sel.value = "";
  sel.hidden = denoms.length < 2;
}

function appendOptions(selectId, values) {
  const sel = document.getElementById(selectId);
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

function setupControls() {
  ["search", "filter-region", "filter-denomination", "sort"].forEach(id => {
    const el = document.getElementById(id);
    const handler = () => { currentPage = 1; renderItems(getFiltered()); saveFilterState(); };
    el.addEventListener("input",  handler);
    el.addEventListener("change", handler);
  });

  // Country filter: cascade-update region + denomination options before re-rendering
  const countryEl = document.getElementById("filter-country");
  countryEl.addEventListener("change", () => {
    updateRegionFilter(countryEl.value);
    updateDenominationFilter(countryEl.value);
    currentPage = 1;
    renderItems(getFiltered());
    saveFilterState();
  });
}

function getFiltered() {
  const q            = document.getElementById("search").value.toLowerCase().trim();
  const country      = document.getElementById("filter-country").value;
  const region       = document.getElementById("filter-region").value;
  const denomination = document.getElementById("filter-denomination").value;
  const sort         = document.getElementById("sort").value;

  let results = allItems.filter(item => {
    if (item.book) return false;
    if (isItemExpired(item)) return false;
    const text = `${getItemTitle(item)} ${item.country} ${item.year} ${item.denomination || ""} ${item.reference || ""}`.toLowerCase();
    return (
      (!q            || text.includes(q)) &&
      (!country      || item.country      === country) &&
      (!region       || item.region       === region) &&
      (!denomination || item.denomination === denomination)
    );
  });

  if (sort === "price-asc")       results.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
  else if (sort === "price-desc") results.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
  else if (sort === "year-asc")   results.sort((a, b) => a.year - b.year);
  else if (sort === "year-desc")  results.sort((a, b) => b.year - a.year);
  else {
    // Default: country A→Z, then price low→high.
    // Uses < / > instead of localeCompare — ~10× faster for ASCII country names.
    results.sort((a, b) => {
      const ca = a.country || "", cb = b.country || "";
      if (ca < cb) return -1;
      if (ca > cb) return  1;
      return parsePrice(a.price) - parsePrice(b.price);
    });
  }

  return results;
}

function parsePrice(p) {
  return typeof p === 'number' ? p : parseFloat(p) || 0;
}

// Returns true when soldon is present and the date is more than one month in the past.
function isItemExpired(item) {
  if (!item.soldon) return false;
  const parts = item.soldon.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return false;
  const [d, m, y] = parts;
  const soldDate = new Date(y, m - 1, d);
  const cutoff   = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1);
  return soldDate < cutoff;
}

// ── Render ───────────────────────────────────────────────

function badgeClass(cond) {
  const c = (cond || "").toUpperCase();
  if (/UNC|MS\d/.test(c))          return "badge-unc";
  if (/VF|XF|AU|EF/.test(c))       return "badge-vf";
  if (/\bF\b|VG\b|\bG\b/.test(c))  return "badge-f";
  return "badge-other";
}

function renderItems(items) {
  const grid    = document.getElementById("grid");
  const countEl = document.getElementById("result-count");
  const total   = items.length;
  const pages   = Math.max(1, Math.ceil(total / itemsPerPage));

  if (currentPage > pages) currentPage = pages;

  const start     = (currentPage - 1) * itemsPerPage;
  const end       = Math.min(start + itemsPerPage, total);
  const pageItems = items.slice(start, end);

  // Result count: show range when paginated, plain count otherwise
  if (total === 0) {
    countEl.textContent = nItems(0);
  } else if (pages === 1) {
    countEl.textContent = nItems(total);
  } else {
    countEl.textContent = `${start + 1}–${end} / ${nItems(total)}`;
  }

  if (total === 0) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">◎</div>
        <h3>${t("no_results")}</h3>
        <p>${t("no_results_hint")}</p>
      </div>`;
    renderPagination(pages);
    return;
  }

  grid.innerHTML = "";

  pageItems.forEach((item, vi) => {
    // _gi was tagged in boot — O(1) lookup instead of allItems.indexOf (O(N))
    const gi      = item._gi;
    const card    = document.createElement("a");
    const hasMany = item.images.length > 1;
    const showQty = item.quantity != null && item.quantity > 1;

    card.className = "card";
    card.href = `item.html?index=${gi}`;
    card.style.animationDelay = `${vi * 0.045}s`;

    const dots = item.images
      .map((_, k) => `<span class="dot${k === 0 ? " active" : ""}"></span>`)
      .join("");

    // Images beyond the first visible row load lazily to avoid a burst of
    // parallel requests on the initial paint.
    const lazyAttr = vi >= 6 ? ' loading="lazy"' : "";

    card.innerHTML = `
      <div class="carousel">
        ${hasMany ? `<button class="nav left"  data-gi="${gi}" data-dir="prev" aria-label="Previous image">${CHEV_LEFT}</button>` : ""}
        <img class="carousel-img${item.sold ? " img-sold" : ""}" id="img-${gi}" src="${item.images[0]}" alt="${getItemTitle(item)}"${lazyAttr}>
        ${hasMany ? `<button class="nav right" data-gi="${gi}" data-dir="next" aria-label="Next image">${CHEV_RIGHT}</button>` : ""}
        ${hasMany ? `<div class="dots" id="dots-${gi}">${dots}</div>` : ""}
        ${showQty ? `<span class="qty-badge">×${item.quantity}</span>` : ""}
        ${item.sold ? `<div class="sold-overlay"><span class="sold-stamp">${t("sold_badge")}</span></div>` : ""}
      </div>
      <div class="card-body">
        <div class="card-title">${getItemTitle(item)}</div>
        <div class="card-meta">${item.country}&nbsp;&nbsp;·&nbsp;&nbsp;${item.year}</div>
        <div class="card-footer">
          ${item.sold
            ? `<span class="badge badge-sold">${t("sold_badge")}</span>`
            : `<span class="badge ${badgeClass(item.condition)}">${item.condition}</span>`}
          <span class="price">${formatPrice(item.price)}</span>
        </div>
      </div>`;

    grid.appendChild(card);

    if (hasMany) {
      attachSwipe(card.querySelector(".carousel"), delta => advanceCarousel(gi, delta));
    }
  });

  grid.querySelectorAll(".nav").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      e.preventDefault();
      advanceCarousel(parseInt(btn.dataset.gi), btn.dataset.dir === "next" ? 1 : -1);
    });
  });

  renderPagination(pages);
}

// ── Pagination ───────────────────────────────────────────

function renderPagination(totalPages) {
  const nav = document.getElementById("page-nav");
  nav.innerHTML = "";

  if (totalPages <= 1) return;

  // Previous button
  const prev = document.createElement("button");
  prev.className = "page-btn";
  prev.innerHTML = "&#8249;";
  prev.setAttribute("aria-label", "Previous page");
  prev.disabled = currentPage === 1;
  prev.addEventListener("click", () => changePage(currentPage - 1));
  nav.appendChild(prev);

  // Page number buttons with smart ellipsis
  getPageRange(currentPage, totalPages).forEach(p => {
    if (p === "...") {
      const span = document.createElement("span");
      span.className = "page-ellipsis";
      span.textContent = "…";
      nav.appendChild(span);
    } else {
      const btn = document.createElement("button");
      btn.className = "page-btn" + (p === currentPage ? " active" : "");
      btn.textContent = p;
      btn.addEventListener("click", () => changePage(p));
      nav.appendChild(btn);
    }
  });

  // Next button
  const next = document.createElement("button");
  next.className = "page-btn";
  next.innerHTML = "&#8250;";
  next.setAttribute("aria-label", "Next page");
  next.disabled = currentPage === totalPages;
  next.addEventListener("click", () => changePage(currentPage + 1));
  nav.appendChild(next);
}

// Returns page numbers and "..." placeholders for condensed display.
// Example: current=5, total=10 → [1, "...", 4, 5, 6, "...", 10]
function getPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const inner = [];
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    inner.push(i);
  }

  const result = [1];
  if (inner[0] > 2)                        result.push("...");
  result.push(...inner);
  if (inner[inner.length - 1] < total - 1) result.push("...");
  result.push(total);

  return result;
}

function changePage(n) {
  currentPage = n;
  renderItems(getFiltered());
  saveFilterState();
  document.getElementById("section-coins").scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupPagination() {
  const sel = document.getElementById("per-page");
  sel.value = String(itemsPerPage);
  sel.addEventListener("change", () => {
    itemsPerPage = parseInt(sel.value, 10);
    localStorage.setItem("fedix_per_page", itemsPerPage);
    currentPage = 1;
    renderItems(getFiltered());
    saveFilterState();
  });
}

// ── Albums & Catalogs section ────────────────────────────

function populateBooksFilters(items) {
  const books     = items.filter(i => i.book);
  const countries = [...new Set(books.map(i => i.country).filter(Boolean))].sort();
  appendOptions("books-filter-country", countries);
}

function getFilteredBooks() {
  const country     = document.getElementById("books-filter-country").value;
  const typeAlbum   = document.getElementById("books-type-album").checked;
  const typeCatalog = document.getElementById("books-type-catalog").checked;
  const anyType     = typeAlbum || typeCatalog;

  return allItems.filter(item => {
    if (!item.book) return false;
    if (isItemExpired(item)) return false;
    if (country && item.country !== country) return false;
    if (anyType) {
      return (typeAlbum && item.book_type === "album") ||
             (typeCatalog && item.book_type === "catalog");
    }
    return true;
  });
}

function renderBooks(items) {
  const grid    = document.getElementById("books-grid");
  const countEl = document.getElementById("books-result-count");
  countEl.textContent = nItems(items.length);

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">◎</div>
        <h3>${t("no_results")}</h3>
        <p>${t("no_results_hint")}</p>
      </div>`;
    return;
  }

  grid.innerHTML = "";

  items.forEach((item, vi) => {
    const gi      = item._gi;
    const card    = document.createElement("a");
    const hasMany = item.images && item.images.length > 1;
    const showQty = item.quantity != null && item.quantity > 1;

    card.className = "card";
    card.href = `item.html?index=${gi}`;
    card.style.animationDelay = `${vi * 0.045}s`;

    const dots = (item.images || [])
      .map((_, k) => `<span class="dot${k === 0 ? " active" : ""}"></span>`)
      .join("");

    const lazyAttr   = vi >= 6 ? ' loading="lazy"' : "";
    const img0       = item.images && item.images[0] ? item.images[0] : "";
    const typeLabel  = item.book_type ? `&nbsp;&nbsp;·&nbsp;&nbsp;${t(`book_type_${item.book_type}`)}` : "";
    const meta       = `${item.country || ""}${typeLabel}`;

    card.innerHTML = `
      <div class="carousel">
        ${hasMany ? `<button class="nav left"  data-gi="${gi}" data-dir="prev" aria-label="Previous image">${CHEV_LEFT}</button>` : ""}
        <img class="carousel-img${item.sold ? " img-sold" : ""}" id="img-${gi}" src="${img0}" alt="${getItemTitle(item)}"${lazyAttr}>
        ${hasMany ? `<button class="nav right" data-gi="${gi}" data-dir="next" aria-label="Next image">${CHEV_RIGHT}</button>` : ""}
        ${hasMany ? `<div class="dots" id="dots-${gi}">${dots}</div>` : ""}
        ${showQty ? `<span class="qty-badge">×${item.quantity}</span>` : ""}
        ${item.sold ? `<div class="sold-overlay"><span class="sold-stamp">${t("sold_badge")}</span></div>` : ""}
      </div>
      <div class="card-body">
        <div class="card-title">${getItemTitle(item)}</div>
        <div class="card-meta">${meta}</div>
        <div class="card-footer">
          ${item.sold
            ? `<span class="badge badge-sold">${t("sold_badge")}</span>`
            : item.condition ? `<span class="badge ${badgeClass(item.condition)}">${item.condition}</span>` : `<span></span>`}
          <span class="price">${formatPrice(item.price)}</span>
        </div>
      </div>`;

    grid.appendChild(card);

    if (hasMany) {
      attachSwipe(card.querySelector(".carousel"), delta => advanceCarousel(gi, delta));
    }
  });

  grid.querySelectorAll(".nav").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      e.preventDefault();
      advanceCarousel(parseInt(btn.dataset.gi), btn.dataset.dir === "next" ? 1 : -1);
    });
  });
}

function setupBooksControls() {
  const rerender = () => renderBooks(getFilteredBooks());
  document.getElementById("books-filter-country").addEventListener("change", rerender);
  document.getElementById("books-type-album").addEventListener("change", rerender);
  document.getElementById("books-type-catalog").addEventListener("change", rerender);
}

// ── Touch swipe ──────────────────────────────────────────

function attachSwipe(el, onSwipe) {
  let startX = 0, startY = 0;
  el.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      onSwipe(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

// ── Carousel ─────────────────────────────────────────────

function advanceCarousel(gi, delta) {
  const item = allItems[gi];
  item._idx  = ((item._idx || 0) + delta + item.images.length) % item.images.length;

  const img = document.getElementById(`img-${gi}`);
  if (!img) return;

  img.classList.add("out");
  setTimeout(() => {
    // Pin opacity at 0 before removing .out, so there is no flash
    // while the new image is fetched (browser keeps showing old src until loaded).
    img.style.opacity = "0";
    img.classList.remove("out");

    let done = false;
    const startIn = () => {
      if (done) return;
      done = true;
      img.style.opacity = "";
      img.classList.add("in");
      setTimeout(() => img.classList.remove("in"), 320);
    };

    img.onload = img.onerror = startIn;
    img.src = item.images[item._idx];
    if (img.complete) startIn(); // already in browser cache
  }, 180);

  const dotsEl = document.getElementById(`dots-${gi}`);
  if (dotsEl) {
    dotsEl.querySelectorAll(".dot").forEach((d, k) => {
      d.classList.toggle("active", k === item._idx);
    });
  }
}
