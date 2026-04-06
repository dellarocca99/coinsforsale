const PHONE = "5492235831244";

const params  = new URLSearchParams(window.location.search);
const id      = parseInt(params.get("id"));
let currentIdx = 0;
let images     = [];

fetch("items.json")
  .then(res => res.json())
  .then(items => {
    const item = items.find(i => i.id === id);
    if (!item) { window.location.href = "index.html"; return; }
    document.title = `${item.title} — Coins for Sale`;
    images = item.images || [];
    renderItem(item);
  });

// ── Badge ────────────────────────────────────────────────

function badgeClass(cond) {
  const c = (cond || "").toUpperCase();
  if (/UNC|MS\d/.test(c))         return "badge-unc";
  if (/VF|XF|AU|EF/.test(c))      return "badge-vf";
  if (/\bF\b|VG\b|\bG\b/.test(c)) return "badge-f";
  return "badge-other";
}

// ── Render ───────────────────────────────────────────────

function renderItem(item) {
  const container = document.getElementById("item-detail");
  const message   = encodeURIComponent(`Hola! Me interesa: ${item.title} (${item.year})`);

  const thumbsHtml = item.images.length > 1
    ? `<div class="gallery-thumbs">
        ${item.images.map((src, i) => `
          <div class="thumb${i === 0 ? " active" : ""}" data-index="${i}">
            <img src="${src}" alt="${item.title} photo ${i + 1}">
          </div>`).join("")}
       </div>`
    : "";

  const descHtml = item.description
    ? `<p class="item-description">${item.description}</p>`
    : "";

  container.innerHTML = `
    <div class="detail-layout">

      <div class="gallery-side">
        <div class="gallery-main" id="gallery-main">
          <img src="${item.images[0]}" id="gallery-img" alt="${item.title}">
        </div>
        ${thumbsHtml}
      </div>

      <div class="item-info">
        <div class="item-eyebrow">${item.country}&nbsp;&nbsp;·&nbsp;&nbsp;${item.year}</div>
        <h1 class="item-title">${item.title}</h1>

        <div class="item-divider"></div>

        <div class="item-row">
          <span class="item-label">Grade</span>
          <span class="badge ${badgeClass(item.condition)}">${item.condition}</span>
        </div>
        <div class="item-row">
          <span class="item-label">Country</span>
          <span class="item-value">${item.country}</span>
        </div>
        <div class="item-row">
          <span class="item-label">Year</span>
          <span class="item-value">${item.year}</span>
        </div>

        <div class="item-divider"></div>

        <div class="item-price">${item.price}</div>

        ${descHtml}

        <button class="btn-whatsapp" onclick="contactWhatsApp('${message}')">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Consultar por WhatsApp
        </button>
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

// ── WhatsApp ─────────────────────────────────────────────

function contactWhatsApp(message) {
  window.open(`https://wa.me/${PHONE}?text=${message}`, "_blank");
}

// ── Lightbox ─────────────────────────────────────────────

function openLightbox(src) {
  const lb    = document.getElementById("lightbox");
  const lbImg = document.getElementById("lightbox-img");
  lbImg.src   = src;
  lb.classList.add("open");
}

function closeLightbox() {
  document.getElementById("lightbox")?.classList.remove("open");
}

document.getElementById("lightbox").addEventListener("click", closeLightbox);
document.getElementById("lightbox-close").addEventListener("click", e => {
  e.stopPropagation();
  closeLightbox();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeLightbox();
});
