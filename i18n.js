// i18n.js — Fedix Coins translations
(function () {

  const T = {
    es: {
      tagline:              "Piezas Numismáticas de Calidad",
      nav_coins:            "Monedas",
      nav_about:            "Nosotros",
      search_placeholder:   "Buscar por título, país o año…",
      all_countries:        "Todos los países",
      all_regions:          "Todas las regiones",
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
      label_region:         "Región",
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
      per_page_label:       "Por página",
      footer_contact_label: "Contacto",
      footer_rights:        "© 2026 Fedix Coins. Todos los derechos reservados.",
      nav_books:            "Álbumes y Catálogos",
      all_book_types:       "Todos los tipos",
      book_type_album:      "Álbum",
      book_type_catalog:    "Catálogo",
      sold_badge:           "Vendido",
      sold_notice:          "Este artículo ya no está disponible.",
      sold_on:              "Vendido el",
    },
    en: {
      tagline:              "Premium Numismatic Pieces",
      nav_coins:            "Coins",
      nav_about:            "About Us",
      search_placeholder:   "Search by title, country or year…",
      all_countries:        "All Countries",
      all_regions:          "All Regions",
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
      label_region:         "Region",
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
      per_page_label:       "Per page",
      footer_contact_label: "Contact",
      footer_rights:        "© 2026 Fedix Coins. All rights reserved.",
      nav_books:            "Albums & Catalogs",
      all_book_types:       "All types",
      book_type_album:      "Album",
      book_type_catalog:    "Catalog",
      sold_badge:           "Sold",
      sold_notice:          "This item is no longer available.",
      sold_on:              "Sold on",
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

  // Returns the item's display title.
  // Falls back to "denomination year" when the title field is absent.
  window.getItemTitle = (item) =>
    item.title || (item.denomination ? `${item.denomination} ${item.year}` : String(item.year));

  window.waMessage = (title, country, link) => {
    const lang         = window.getLang();
    const countryLabel = T[lang]?.label_country ?? T.es.label_country;
    const intro        = lang === "en"
      ? "Hello, I'm interested in this item:"
      : "Hola! Me interesa este artículo:";
    return `${intro}\n\n${title}\n${countryLabel}: ${country}\n\n${link}`;
  };

})();

// ── Image extension fallback ──────────────────────────────
// When an image fails to load, retries with alternative extensions
// in the order defined below, skipping whichever were already tried.
// Handles both extension-type differences (.jpg / .jpeg / .png) and
// case sensitivity on GitHub Pages (Linux): "coin.JPG" ≠ "coin.jpg".
(function () {
  const EXTS = [".jpg", ".JPG", ".jpeg", ".JPEG", ".png", ".PNG"];

  // Returns [basePath, matchedExt] by checking known extensions.
  function splitExt(src) {
    for (const ext of EXTS) {
      if (src.endsWith(ext)) return [src.slice(0, -ext.length), ext];
    }
    return [src, ""];
  }

  document.addEventListener("error", function (e) {
    const img = e.target;
    if (img.tagName !== "IMG") return;

    const src = img.getAttribute("src") || "";
    const [base, currentExt] = splitExt(src);
    if (!base || !currentExt) return; // no recognised extension — nothing to try

    // Build the set of already-tried extensions for this element.
    const tried = img.dataset.extsTried
      ? img.dataset.extsTried.split(",")
      : [currentExt];

    const next = EXTS.find(x => !tried.includes(x));
    if (!next) return; // all extensions exhausted — fail gracefully

    tried.push(next);
    img.dataset.extsTried = tried.join(",");
    img.src = base + next;
  }, true); // capture phase — "error" does not bubble
})();
