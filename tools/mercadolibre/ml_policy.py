"""Listing policy for MercadoLibre: price, title, attributes, photos.

Title/metal/commemorative/origin logic is ported unchanged from the old
`.agents/skills/mercadolibre-excel/fill_ml_excel.py`, so listings created via
the API look like the ones created with the bulk Excel.

Pricing (same formula as the Excel era):
    ars = usd * blue_rate
    if ars >= threshold:  ars += free_shipping_cost   (real cost, asked to ML)
    ars *= silver_mult | base_mult
    if ars < low_thresh:  ars += low_add
"""

import json
import unicodedata
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "ml_config.json"


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


# ── Exchange rate ───────────────────────────────────────────

def blue_rate(cfg):
    """Dólar blue venta (dolarapi.com mirrors dolarhoy.com). Raises on failure:
    we never price with a stale rate silently."""
    url = cfg["pricing"]["rate_url"]
    req = urllib.request.Request(url, headers={"User-Agent": "fedix-coins-ml-sync/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read().decode("utf-8"))
    rate = float(data["venta"])
    if rate <= 0:
        raise ValueError(f"Cotización inválida: {data}")
    return rate, data.get("fechaActualizacion")


# ── Coin classification (ported) ────────────────────────────

COUNTRY_ORIGEN = {
    "Argentina": "Argentina",
    "Uruguay":   "Uruguay",
    "USA":       "Estados Unidos",
    "Bolivia":   "Bolivia",
    "Francia":   "Francia",
    "Italia":    "Italia",
    "Peru":      "Perú",
    "Perú":      "Perú",
    "Egipto":    "",   # not in ML's list
}


def is_silver(item):
    c = (item.get("composition") or "").lower()
    ce = (item.get("composition_en") or "").lower()
    return "plata" in c or "silver" in c or "silver" in ce or c.startswith("ag ")


def get_metal(item):
    c = (item.get("composition") or "").strip().lower()
    ce = (item.get("composition_en") or "").strip().lower()
    if "plata" in c or "silver" in c or "silver" in ce or c.startswith("ag "):
        return "Plata"
    if c in ("cobre", "cu"):
        return "Cobre"
    if c == "cu ni":
        return "Níquel"
    if c == "bronce de aluminio":
        return "Bronce"
    if "oro" in c or "gold" in ce:
        return "Oro"
    return ""


def get_tipo_moneda(item):
    d = (item.get("denomination") or "").lower()
    if any(x in d for x in ("peso", "centavo", "centesimo", "centésimo")):
        return "Peso"
    if any(x in d for x in ("cent", "dime", "dollar", "quarter", "half dime", "half dollar")):
        return "Dólar"
    if "real" in d:
        return "Real"
    return ""


COMMEMORATIVE_KEYWORDS = (
    "conmemorativ", "commemorative",
    "aniversario", "anniversary",
    "centenario", "centennial", "bicentenario", "bicentennial",
    "homenaje", "jubilee",
    "mundial", "fifa", "olímpic", "olimpic", "olympic",
    "onu",
    "haudenosaunee", "sacagawea",
    "formation years",
    "lewis and clark", "louisiana purchase", "ocean in view",
    "crossing the delaware", "westward",
)


def is_commemorative(item):
    text = " ".join([
        item.get("title", "") or "",
        item.get("description", "") or "",
        item.get("description_en", "") or "",
    ]).lower()
    if any(k in text for k in COMMEMORATIVE_KEYWORDS):
        return "Sí"
    if "buffalo" in text and item.get("year") == 2005:
        return "Sí"
    return "No"


def label(item):
    """Human-readable name (many items have no `title`; the site uses denomination + year)."""
    t = item.get("title")
    if t:
        return t
    return f"{item.get('denomination') or '?'} {item.get('year') or '?'}"


BOOK_KIND = {"catalog": "Catálogo de Monedas", "album": "Álbum para Monedas"}


def build_book_title(item):
    base = (item.get("title") or label(item)).replace('"', '')
    kind = BOOK_KIND.get(item_type(item), "")
    country = "EEUU - USA" if item.get("country") == "USA" else COUNTRY_ORIGEN.get(item.get("country", ""), "")
    parts = [base, kind, country, "Numismatica"]
    while parts:
        s = " ".join(p for p in parts if p)
        if len(s) <= 60:
            return s, False
        parts.pop()
    return base[:60], True


def build_title(item):
    """Return (title, was_truncated). Search-optimized, max 60 chars."""
    if item.get("book"):
        return build_book_title(item)
    raw_country = item.get("country", "")
    cd = COUNTRY_ORIGEN.get(raw_country, raw_country) or raw_country
    region = item.get("region", "")
    jt = item.get("title")
    if jt:
        base = jt.replace('"', '')
    else:
        denom = item.get("denomination", "")
        year = item.get("year", "")
        base = f"{denom} {year} ({region})" if region else f"{denom} {year}"

    metal = get_metal(item)
    metal_kw = metal if metal in ("Plata", "Oro") else ""

    if raw_country == "USA":
        country_forms = ["Estados Unidos - EEUU - USA", "EEUU - USA"]
    else:
        country_forms = [cd] if cd else [""]

    cascade = [[metal_kw, "Moneda", "Coleccion"], [metal_kw, "Moneda"], [metal_kw], []]

    def join(parts):
        return " ".join(p for p in parts if p)

    for cf in country_forms:
        for addons in cascade:
            s = join([base, cf] + addons)
            if len(s) <= 60:
                return s, False
    return join([base, country_forms[-1]])[:60], True


def build_pictures(item, cfg):
    base = cfg["photos_base"]
    pics = [{"source": base + p} for p in item.get("images", [])]
    pics.append({"source": base + cfg["background_image"]})
    return pics


# ── Item types: coins vs catalogs/albums ────────────────────

def item_type(item):
    """'coin', or the book_type ('catalog' / 'album') for non-coin items."""
    if item.get("book"):
        return item.get("book_type") or "catalog"
    return "coin"


def type_cfg(cfg, item):
    t = item_type(item)
    tc = dict(cfg.get("types", {}).get(t, {}))
    if t == "coin":
        tc.setdefault("category_id", cfg.get("category_id"))
    tc.setdefault("condition", "used")
    return tc


def ml_quantity(item, cfg):
    """Stock to publish on ML: used items always 1, new items their whole stock."""
    q = item.get("quantity")
    q = 1 if q is None else int(q)
    return q if type_cfg(cfg, item)["condition"] == "new" else min(q, 1)


def package_for(index, cfg, item=None):
    pkg = dict(cfg["package"])
    if item is not None:
        pkg.update(type_cfg(cfg, item).get("package", {}))
    pkg.update(cfg.get("overrides", {}).get(str(index), {}))
    return pkg


def package_attributes(pkg):
    """Package size as the SELLER_PACKAGE_* attributes the existing listings carry."""
    def n(x):
        return int(x) if float(x).is_integer() else x
    return [
        {"id": "SELLER_PACKAGE_WIDTH",  "value_name": f"{n(pkg['width'])} cm"},
        {"id": "SELLER_PACKAGE_HEIGHT", "value_name": f"{n(pkg['height'])} cm"},
        {"id": "SELLER_PACKAGE_LENGTH", "value_name": f"{n(pkg['depth'])} cm"},
        {"id": "SELLER_PACKAGE_WEIGHT", "value_name": f"{int(round(pkg['weight'] * 1000))} g"},
    ]


def dimensions_str(pkg):
    """ML format: 'WxHxD,grams'."""
    def n(x):
        return int(x) if float(x).is_integer() else x
    return f"{n(pkg['width'])}x{n(pkg['height'])}x{n(pkg['depth'])},{int(round(pkg['weight'] * 1000))}"


# ── Price ───────────────────────────────────────────────────

def compute_price(item, rate, cfg, ship_cost_fn=None):
    """Return a breakdown dict with the final ARS price.

    `ship_cost_fn(final_price) -> float | None` asks ML what free shipping costs
    the seller for this package at that price. Called at most twice because the
    cost can depend on the price band. Falls back to `fallback_surcharge`.
    """
    p = cfg["pricing"]
    usd = item.get("price")
    if not isinstance(usd, (int, float)):
        raise ValueError(f"precio no numérico: {usd!r}")
    silver = is_silver(item)
    mult = p["silver_mult"] if silver else p["base_mult"]
    ars0 = usd * rate
    out = {"usd": usd, "rate": rate, "ars_base": round(ars0), "mult": mult,
           "silver": silver, "surcharge": 0, "surcharge_source": None,
           "low_add": 0, "free_shipping": False}

    if ars0 >= p["threshold"]:
        out["free_shipping"] = True
        surcharge, source = p["fallback_surcharge"], "fallback"
        if ship_cost_fn:
            for _ in range(2):
                cost = ship_cost_fn((ars0 + surcharge) * mult)
                if cost is None:
                    break
                source = "ML"
                if abs(cost - surcharge) < 1:
                    break
                surcharge = cost
        out["surcharge"], out["surcharge_source"] = round(surcharge), source
        final = (ars0 + surcharge) * mult
    else:
        final = ars0 * mult

    if final < p["low_thresh"]:
        final += p["low_add"]
        out["low_add"] = p["low_add"]
    out["price"] = int(round(final))
    return out


def free_shipping_cost(client, cfg, pkg, price, condition="used"):
    """What ML charges the seller for free shipping (ARS), or None if unknown."""
    params = {
        "dimensions": dimensions_str(pkg),
        "verbose": "true",
        "item_price": int(round(price)),
        "mode": "me2",
        "condition": condition,
        "free_shipping": "true",
    }
    if cfg.get("listing_type_id"):
        params["listing_type_id"] = cfg["listing_type_id"]
    try:
        res = client.get(f"/users/{client.user_id}/shipping_options/free", **params)
    except Exception:
        return None
    cov = (res or {}).get("coverage", {}).get("all_country", {})
    cost = cov.get("list_cost")
    return float(cost) if cost is not None else None


# ── Matching ML listings to items.json by title ─────────────
# (SKUs of the Excel-era listings are shifted: coins were inserted mid-array
#  after those uploads, so the title is the reliable key.)

import re as _re

_STOP = set("moneda monedas coleccion coleccionable plata oro estados unidos eeuu usa "
            "argentina uruguay francia italia egipto peru bolivia de la del el error -".split())


def title_tokens(text):
    s = _re.sub(r'["(),.]', " ", norm(text))
    return {t for t in s.split() if t not in _STOP}


def item_tokens(item):
    return title_tokens(label(item) + " " + (item.get("region") or ""))


def match_score(ml_title, item, item_toks=None):
    """0..1 similarity; 0 when the coin's year is not in the listing title."""
    mt = title_tokens(ml_title)
    year = str(item.get("year") or "")
    if year and not any(year in t for t in mt):
        return 0.0
    it = item_toks if item_toks is not None else item_tokens(item)
    union = it | mt
    return len(it & mt) / len(union) if union else 0.0


# ── Attributes ──────────────────────────────────────────────

# Logical field -> accepted (normalized) attribute names in ML's coin category.
ATTRIBUTE_NAMES = {
    "year":          ["ano de emision", "ano"],
    "origin":        ["origen", "pais de origen"],
    "brand":         ["marca"],
    "model":         ["modelo"],
    "metal":         ["tipo de metal", "metal", "material"],
    "commemorative": ["moneda conmemorativa", "es conmemorativa", "es moneda conmemorativa"],
    "coin_value":    ["valor de la moneda", "valor nominal", "valor"],
    "coin_type":     ["tipo de moneda"],
}


def discover_attribute_ids(category_attrs):
    """Map logical fields to attribute ids from GET /categories/{id}/attributes."""
    by_name = {norm(a.get("name")): a["id"] for a in category_attrs}
    found = {}
    for logical, names in ATTRIBUTE_NAMES.items():
        for n in names:
            if n in by_name:
                found[logical] = by_name[n]
                break
    return found


def build_book_attributes(item, index, cfg):
    """Albums (MLA441114) and catalogs (Libros Físicos) need different required fields."""
    attrs = {"SELLER_SKU": str(index)}
    missing = []
    t = item_type(item)
    title = (item.get("title") or label(item)).replace('"', '')
    publisher = item.get("mint") or ""
    if t == "album":
        attrs.update({"MANUFACTURER": publisher, "BRAND": publisher, "MODEL": title,
                      "EMPTY_GTIN_REASON": "El producto no tiene código registrado"})
    else:
        attrs.update({"BOOK_TITLE": title, "BOOK_PUBLISHER": publisher})
    for k, v in (cfg.get("tax") or {}).items():
        attrs[k] = v
    attrs.update(cfg.get("item_attributes", {}).get(str(index), {}))
    if attrs.get("GTIN"):
        attrs.pop("EMPTY_GTIN_REASON", None)

    # Tax fields are only demanded for new items; used ones (like the coins) go without.
    required = ["VALUE_ADDED_TAX", "IMPORT_DUTY"] if type_cfg(cfg, item)["condition"] == "new" else []
    required +=["MANUFACTURER", "BRAND", "MODEL"] if t == "album" else ["BOOK_TITLE", "AUTHOR", "BOOK_PUBLISHER", "GTIN"]
    for k in required:
        if not attrs.get(k):
            missing.append(k + (" (ml_config.json → tax)" if k in ("VALUE_ADDED_TAX", "IMPORT_DUTY")
                                else f" (ml_config.json → item_attributes[\"{index}\"])"))
    return [{"id": k, "value_name": str(v)} for k, v in attrs.items() if v not in (None, "")], missing


def build_attributes(item, index, cfg):
    """Return (attributes, missing_required_fields)."""
    if item.get("book"):
        return build_book_attributes(item, index, cfg)
    ids = cfg.get("attributes", {})
    attrs = [{"id": "SELLER_SKU", "value_name": str(index)}]
    missing = []

    def add(logical, value):
        if logical in ids and value not in (None, ""):
            attrs.append({"id": ids[logical], "value_name": str(value)})

    # Coins have no brand/model: value_id -1 is ML's "No aplica".
    for logical in ("brand", "model"):
        if logical in ids:
            attrs.append({"id": ids[logical], "value_id": "-1", "value_name": None})

    year = item.get("year")
    origin = COUNTRY_ORIGEN.get(item.get("country", ""), "")
    metal = get_metal(item)
    denom = item.get("denomination", "")
    tipo = get_tipo_moneda(item)

    add("year", year)
    add("origin", origin)
    add("metal", metal)
    add("commemorative", is_commemorative(item))
    add("coin_value", denom)
    add("coin_type", tipo)

    if year is None:
        missing.append("año")
    if not denom:
        missing.append("valor de la moneda (denomination)")
    if not tipo:
        missing.append(f"tipo de moneda (denomination {denom!r} no mapea)")
    return attrs, missing


def build_item_payload(item, index, cfg, price_info):
    title, truncated = build_title(item)
    tc = type_cfg(cfg, item)
    pkg = package_for(index, cfg, item)
    attrs, missing = build_attributes(item, index, cfg)
    attrs += package_attributes(pkg)
    payload = {
        "site_id": cfg["site_id"],
        "title": title,
        "category_id": tc["category_id"],
        "price": price_info["price"],
        "currency_id": cfg["currency_id"],
        "available_quantity": ml_quantity(item, cfg),
        "buying_mode": "buy_it_now",
        "listing_type_id": cfg["listing_type_id"],
        "condition": tc["condition"],
        "pictures": build_pictures(item, cfg),
        "attributes": attrs,
        "shipping": {
            "mode": "me2",
            "local_pick_up": False,
            "free_shipping": price_info["free_shipping"],
        },
    }
    return payload, truncated, missing
