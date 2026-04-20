const PHONE = "5492235831244";

const params     = new URLSearchParams(window.location.search);
const itemIndex  = parseInt(params.get("index"));
let currentIdx   = 0;
let images       = [];
let loadedItem   = null;

// ── Boot ─────────────────────────────────────────────────

fetch("items.json")
  .then(res => res.json())
  .then(items => {
    const item = items[itemIndex];
    if (!item || isItemExpired(item)) { window.location.href = "index.html"; return; }

    loadedItem = item;
    images     = item.images || [];
    document.title = `${getItemTitle(item)} — Fedix Coins`;

    applyTranslations();
    renderItem(item);
    setupLangToggle();
    setupCurrencyToggle();
    setupLightbox();

    // Currency change: update only the price element to avoid resetting the gallery
    document.addEventListener('currencychange', () => {
      const el = document.querySelector('.item-price');
      if (el) el.textContent = formatPrice(item.price);
    });
  });

// ── i18n ─────────────────────────────────────────────────

function applyTranslations() {
  document.documentElement.lang = getLang();

  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

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
    if (loadedItem) {
      currentIdx = 0;
      renderItem(loadedItem);
    }
  });
}

// ── Localized fields ─────────────────────────────────────

// Returns the English variant (field_en) when available and lang=en,
// otherwise falls back to the base field. Works for any field name.
function getLocalizedField(item, field) {
  if (getLang() === "en" && item[field + "_en"]) return item[field + "_en"];
  return item[field] || "";
}

function getDescription(item) {
  return getLocalizedField(item, "description");
}

// ── Sold / expiry ────────────────────────────────────────

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

// ── Badge ────────────────────────────────────────────────

function badgeClass(cond) {
  const c = (cond || "").toUpperCase();
  if (/UNC|MS\d/.test(c))          return "badge-unc";
  if (/VF|XF|AU|EF/.test(c))       return "badge-vf";
  if (/\bF\b|VG\b|\bG\b/.test(c))  return "badge-f";
  return "badge-other";
}

// ── Render ───────────────────────────────────────────────

function renderItem(item) {
  const container = document.getElementById("item-detail");

  const thumbImgClass = item.sold ? ' class="img-sold"' : "";
  const thumbsHtml = item.images.length > 1
    ? `<div class="gallery-thumbs">
        ${item.images.map((src, i) => `
          <div class="thumb${i === 0 ? " active" : ""}" data-index="${i}">
            <img src="${src}" alt="${getItemTitle(item)} ${i + 1}"${thumbImgClass}>
          </div>`).join("")}
       </div>`
    : "";

  const qtyHtml = (item.quantity != null && item.quantity > 1)
    ? `<div class="item-row">
         <span class="item-label">${t("label_qty")}</span>
         <span class="item-value">${item.quantity}</span>
       </div>`
    : "";

  // Optional technical fields — only rendered when present
  const optFields = [
    ["label_denomination", item.denomination],
    [item.book ? "label_editorial" : "label_mint", item.mint],
    ["label_weight",       item.weight],
    ["label_diameter",     item.diameter],
    ["label_composition",  getLocalizedField(item, "composition")],
    ["label_reference",    item.reference],
  ].filter(([, v]) => v != null && v !== "");

  const optFieldsHtml = optFields.length
    ? `<div class="item-divider"></div>
       ${optFields.map(([k, v]) => `
         <div class="item-row">
           <span class="item-label">${t(k)}</span>
           <span class="item-value">${v}</span>
         </div>`).join("")}`
    : "";

  const desc = getDescription(item);
  const descHtml = desc
    ? `<p class="item-description">${desc}</p>`
    : "";

  container.innerHTML = `
    <div class="detail-layout">

      <div class="gallery-side">
        <div class="gallery-main" id="gallery-main">
          <img src="${item.images[0]}" id="gallery-img" alt="${getItemTitle(item)}"${item.sold ? ' class="img-sold"' : ""}>
          ${item.sold ? `<div class="sold-overlay gallery-sold-overlay"><span class="sold-stamp">${t("sold_badge")}</span></div>` : ""}
        </div>
        ${thumbsHtml}
      </div>

      <div class="item-info">
        <div class="item-eyebrow">${item.country}&nbsp;&nbsp;·&nbsp;&nbsp;${item.year}</div>
        <h1 class="item-title">${getItemTitle(item)}</h1>

        <div class="item-divider"></div>

        <div class="item-row">
          <span class="item-label">${t("label_grade")}</span>
          <span class="badge ${badgeClass(item.condition)}">${item.condition}</span>
        </div>
        <div class="item-row">
          <span class="item-label">${t("label_country")}</span>
          <span class="item-value">${item.country}</span>
        </div>
        ${item.region ? `<div class="item-row">
          <span class="item-label">${t("label_region")}</span>
          <span class="item-value">${item.region}</span>
        </div>` : ""}
        <div class="item-row">
          <span class="item-label">${t("label_year")}</span>
          <span class="item-value">${item.year}</span>
        </div>
        ${qtyHtml}
        ${optFieldsHtml}

        <div class="item-divider"></div>

        ${item.sold ? `
        <div class="item-sold-notice">
          <span class="item-sold-badge">${t("sold_badge")}</span>
          <span class="item-sold-text">${item.soldon ? `${t("sold_on")} ${item.soldon}` : t("sold_notice")}</span>
        </div>` : ""}

        <div class="item-price${item.sold ? " item-price-sold" : ""}">${formatPrice(item.price)}</div>

        ${descHtml}

        ${!item.sold ? `<button class="btn-whatsapp" id="wa-btn"
                data-title="${getItemTitle(item)}"
                data-country="${item.country || ""}">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          ${t("whatsapp_btn")}
        </button>` : ""}
      </div>

    </div>`;

  // Thumbnail clicks
  container.querySelectorAll(".thumb").forEach(thumb => {
    thumb.addEventListener("click", () => setImage(parseInt(thumb.dataset.index)));
  });

  // Gallery main → lightbox
  document.getElementById("gallery-main").addEventListener("click", () => {
    openLightbox(images[currentIdx]);
  });

  // Swipe on main gallery image
  if (images.length > 1) {
    attachSwipe(document.getElementById("gallery-main"), delta => {
      setImage((currentIdx + delta + images.length) % images.length);
    });
  }

  // WhatsApp button (absent for sold items)
  const waBtn = document.getElementById("wa-btn");
  if (waBtn) {
    waBtn.addEventListener("click", function () {
      const msg = waMessage(this.dataset.title, this.dataset.country, window.location.href);
      window.open(`https://wa.me/${PHONE}?text=${encodeURIComponent(msg)}`, "_blank");
    });
  }
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

// ── Gallery ──────────────────────────────────────────────

function setImage(i) {
  currentIdx = i;
  const img = document.getElementById("gallery-img");
  img.style.opacity   = "0";
  img.style.transform = "scale(0.97)";
  setTimeout(() => {
    img.src             = images[i];
    img.style.opacity   = "1";
    img.style.transform = "scale(1)";
  }, 190);
  document.querySelectorAll(".thumb").forEach((t, k) => {
    t.classList.toggle("active", k === i);
  });
}

// ── Lightbox ─────────────────────────────────────────────

function setupLightbox() {
  const lb   = document.getElementById("lightbox");
  const prev = document.getElementById("lightbox-prev");
  const next = document.getElementById("lightbox-next");

  lb.addEventListener("click", closeLightbox);

  document.getElementById("lightbox-close").addEventListener("click", e => {
    e.stopPropagation();
    closeLightbox();
  });

  prev.addEventListener("click", e => { e.stopPropagation(); lightboxNavigate(-1); });
  next.addEventListener("click", e => { e.stopPropagation(); lightboxNavigate(1); });

  document.addEventListener("keydown", e => {
    if (!document.getElementById("lightbox").classList.contains("open")) return;
    if (e.key === "Escape")     { closeLightbox(); return; }
    if (e.key === "ArrowLeft")  lightboxNavigate(-1);
    if (e.key === "ArrowRight") lightboxNavigate(1);
  });

  attachSwipe(lb, delta => lightboxNavigate(delta));
}

function lightboxNavigate(delta) {
  if (images.length < 2) return;
  const newIdx = (currentIdx + delta + images.length) % images.length;
  const lbImg  = document.getElementById("lightbox-img");

  lbImg.style.opacity = "0";
  setTimeout(() => {
    lbImg.src           = images[newIdx];
    lbImg.style.opacity = "";
    updateLightboxState();
  }, 160);

  setImage(newIdx);
}

function openLightbox(src) {
  const lb    = document.getElementById("lightbox");
  const lbImg = document.getElementById("lightbox-img");
  lbImg.src   = src;
  lb.classList.add("open");
  document.body.style.overflow = "hidden";
  updateLightboxState();
}

function closeLightbox() {
  document.getElementById("lightbox").classList.remove("open");
  document.body.style.overflow = "";
}

function updateLightboxState() {
  const multi   = images.length > 1;
  const display = multi ? "" : "none";
  document.getElementById("lightbox-prev").style.display    = display;
  document.getElementById("lightbox-next").style.display    = display;
  document.getElementById("lightbox-counter").style.display = display;
  if (multi) {
    document.getElementById("lightbox-counter").textContent = `${currentIdx + 1} / ${images.length}`;
  }
}
