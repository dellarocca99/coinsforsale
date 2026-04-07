// i18n.js — Fedix Coins translations
(function () {

  const T = {
    es: {
      tagline:              "Piezas Numismáticas de Calidad",
      nav_coins:            "Monedas",
      nav_about:            "Nosotros",
      search_placeholder:   "Buscar por título, país o año…",
      all_countries:        "Todos los países",
      all_grades:           "Todos los grados",
      sort_label:           "Ordenar…",
      sort_price_asc:       "Precio: menor → mayor",
      sort_price_desc:      "Precio: mayor → menor",
      sort_year_asc:        "Año: más antiguo",
      sort_year_desc:       "Año: más reciente",
      n_items_one:          "1 artículo",
      n_items_other:        "{n} artículos",
      no_results:           "Sin resultados",
      no_results_hint:      "Intentá ajustar la búsqueda o los filtros",
      back:                 "Volver",
      label_grade:          "Estado",
      label_country:        "País",
      label_year:           "Año",
      label_qty:            "Disponibles",
      label_denomination:   "Denominación",
      label_mint:           "Ceca",
      label_weight:         "Peso",
      label_diameter:       "Diámetro",
      label_composition:    "Composición",
      label_reference:      "Referencia",
      whatsapp_btn:         "Consultar por WhatsApp",
      about_title:          "Sobre Nosotros",
      about_body:           "Somos una empresa numismática con sede en Mar del Plata, Argentina. Comenzamos en 2020 y vendemos monedas en todo el país. Realizamos envíos a nivel nacional, generalmente a través de Andreani, aunque también podemos utilizar otros servicios de mensajería según el caso. Nos especializamos principalmente en monedas de Estados Unidos, Argentina y Uruguay.",
      stat_founded:         "Fundada en 2020",
      stat_location:        "Mar del Plata, Argentina",
      stat_shipping:        "Envíos a todo el país",
      stat_specialty:       "USA · Argentina · Uruguay",
      footer_contact_label: "Contacto",
      footer_rights:        "© 2026 Fedix Coins. Todos los derechos reservados.",
    },
    en: {
      tagline:              "Premium Numismatic Pieces",
      nav_coins:            "Coins",
      nav_about:            "About Us",
      search_placeholder:   "Search by title, country or year…",
      all_countries:        "All Countries",
      all_grades:           "All Grades",
      sort_label:           "Sort by…",
      sort_price_asc:       "Price: low → high",
      sort_price_desc:      "Price: high → low",
      sort_year_asc:        "Year: oldest first",
      sort_year_desc:       "Year: newest first",
      n_items_one:          "1 item",
      n_items_other:        "{n} items",
      no_results:           "No coins found",
      no_results_hint:      "Try adjusting your search or filters",
      back:                 "Back",
      label_grade:          "Grade",
      label_country:        "Country",
      label_year:           "Year",
      label_qty:            "Available",
      label_denomination:   "Denomination",
      label_mint:           "Mint",
      label_weight:         "Weight",
      label_diameter:       "Diameter",
      label_composition:    "Composition",
      label_reference:      "Reference",
      whatsapp_btn:         "Contact via WhatsApp",
      about_title:          "About Us",
      about_body:           "We are a numismatic company based in Mar del Plata, Argentina. We started in 2020 and sell coins across the entire country. We ship nationwide, usually using Andreani, but other shipping providers may be used depending on the case. We specialize mainly in US, Argentinian, and Uruguayan coins.",
      stat_founded:         "Founded in 2020",
      stat_location:        "Mar del Plata, Argentina",
      stat_shipping:        "Ships nationwide",
      stat_specialty:       "USA · Argentina · Uruguay",
      footer_contact_label: "Contact",
      footer_rights:        "© 2026 Fedix Coins. All rights reserved.",
    },
  };

  window.getLang = () => localStorage.getItem("fedix_lang") || "es";

  window.setLang = (lang) => {
    localStorage.setItem("fedix_lang", lang);
    document.dispatchEvent(new Event("langchange"));
  };

  window.t = (key) => {
    const lang = window.getLang();
    return T[lang]?.[key] ?? T.es?.[key] ?? key;
  };

  window.nItems = (n) =>
    n === 1
      ? window.t("n_items_one")
      : window.t("n_items_other").replace("{n}", n);

  window.waMessage = (title, year) =>
    window.getLang() === "en"
      ? `Hi! I'm interested in: ${title} (${year})`
      : `Hola! Me interesa: ${title} (${year})`;

})();

// ── Image extension case fallback ─────────────────────────
// GitHub Pages (Linux) is case-sensitive: "coin.JPG" ≠ "coin.jpg".
// If an image fails to load, this automatically retries with the
// opposite extension case (.jpg ↔ .JPG), once per element.
document.addEventListener("error", function (e) {
  const img = e.target;
  if (img.tagName !== "IMG" || img.dataset.fallbackTried) return;

  const src = img.getAttribute("src") || "";
  let alt = null;

  if (src.endsWith(".jpg"))  alt = src.slice(0, -4) + ".JPG";
  else if (src.endsWith(".JPG")) alt = src.slice(0, -4) + ".jpg";

  if (alt) {
    img.dataset.fallbackTried = "1";
    img.src = alt;
  }
}, true); // capture phase — "error" does not bubble
