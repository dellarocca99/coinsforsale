const PHONE = "5492235831244";

let allItems = [];

// ── Boot ─────────────────────────────────────────────────

fetch("items.json")
  .then(res => res.json())
  .then(items => {
    allItems = items.map(item => ({ ...item, _idx: 0 }));
    applyTranslations();
    populateFilters(allItems);
    renderItems(allItems);
    setupControls();
    setupLangToggle();
    setupSectionNav();
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
  history.replaceState(null, "", id === "about" ? "#about" : location.pathname);
}

function setupSectionNav() {
  document.querySelectorAll(".nav-tab, .footer-link[data-section]").forEach(btn => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  // Honor URL hash on page load
  if (location.hash === "#about") showSection("about");
}

// ── Filters ──────────────────────────────────────────────

function populateFilters(items) {
  const countries  = [...new Set(items.map(i => i.country).filter(Boolean))].sort();
  const conditions = [...new Set(items.map(i => i.condition).filter(Boolean))].sort();
  appendOptions("filter-country",   countries);
  appendOptions("filter-condition", conditions);
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
  ["search", "filter-country", "filter-condition", "sort"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input",  () => renderItems(getFiltered()));
    el.addEventListener("change", () => renderItems(getFiltered()));
  });
}

function getFiltered() {
  const q         = document.getElementById("search").value.toLowerCase().trim();
  const country   = document.getElementById("filter-country").value;
  const condition = document.getElementById("filter-condition").value;
  const sort      = document.getElementById("sort").value;

  let results = allItems.filter(item => {
    const text = `${item.title} ${item.country} ${item.year} ${item.denomination || ""} ${item.reference || ""}`.toLowerCase();
    return (
      (!q         || text.includes(q)) &&
      (!country   || item.country   === country) &&
      (!condition || item.condition === condition)
    );
  });

  if (sort === "price-asc")  results.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
  if (sort === "price-desc") results.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
  if (sort === "year-asc")   results.sort((a, b) => a.year - b.year);
  if (sort === "year-desc")  results.sort((a, b) => b.year - a.year);

  return results;
}

function parsePrice(str) {
  return parseFloat((str || "0").replace(/[^0-9.]/g, "")) || 0;
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
    const gi      = allItems.indexOf(item);
    const card    = document.createElement("div");
    const hasMany = item.images.length > 1;
    const showQty = item.quantity != null && item.quantity > 1;

    card.className = "card";
    card.style.animationDelay = `${vi * 0.045}s`;

    const dots = item.images
      .map((_, k) => `<span class="dot${k === 0 ? " active" : ""}"></span>`)
      .join("");

    card.innerHTML = `
      <div class="carousel">
        ${hasMany ? `<button class="nav left"  data-gi="${gi}" data-dir="prev">&#8249;</button>` : ""}
        <img class="carousel-img" id="img-${gi}" src="${item.images[0]}" alt="${item.title}">
        ${hasMany ? `<button class="nav right" data-gi="${gi}" data-dir="next">&#8250;</button>` : ""}
        ${hasMany ? `<div class="dots" id="dots-${gi}">${dots}</div>` : ""}
        ${showQty ? `<span class="qty-badge">×${item.quantity}</span>` : ""}
      </div>
      <div class="card-body">
        <div class="card-title">${item.title}</div>
        <div class="card-meta">${item.country}&nbsp;&nbsp;·&nbsp;&nbsp;${item.year}</div>
        <div class="card-footer">
          <span class="badge ${badgeClass(item.condition)}">${item.condition}</span>
          <span class="price">${item.price}</span>
        </div>
      </div>`;

    card.addEventListener("click", e => {
      if (!e.target.closest(".nav")) {
        window.location.href = `item.html?index=${gi}`;
      }
    });

    grid.appendChild(card);
  });

  grid.querySelectorAll(".nav").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      advanceCarousel(parseInt(btn.dataset.gi), btn.dataset.dir === "next" ? 1 : -1);
    });
  });
}

// ── Carousel ─────────────────────────────────────────────

function advanceCarousel(gi, delta) {
  const item = allItems[gi];
  item._idx  = ((item._idx || 0) + delta + item.images.length) % item.images.length;

  const img = document.getElementById(`img-${gi}`);
  if (!img) return;

  img.classList.add("out");
  setTimeout(() => {
    img.src = item.images[item._idx];
    img.classList.remove("out");
    img.classList.add("in");
    setTimeout(() => img.classList.remove("in"), 320);
  }, 160);

  const dotsEl = document.getElementById(`dots-${gi}`);
  if (dotsEl) {
    dotsEl.querySelectorAll(".dot").forEach((d, k) => {
      d.classList.toggle("active", k === item._idx);
    });
  }
}
