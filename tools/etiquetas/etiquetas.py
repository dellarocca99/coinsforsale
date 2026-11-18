#!/usr/bin/env python3
"""Etiquetas para sobres de monedas — Fedix Coins.

Genera un PDF A4 con papelitos de 45 x 48 mm (4 x 5 = 20 por hoja), uno por
moneda disponible de items.json. Especificación completa:
ETIQUETAS_especificacion.md (en la raíz del repo).

Uso (desde cualquier carpeta):
    python tools/etiquetas/etiquetas.py              # las primeras 20 disponibles
    python tools/etiquetas/etiquetas.py --todas      # todas las disponibles
    python tools/etiquetas/etiquetas.py 93 141 141   # esos índices (repetir = otra copia)

items.json es de sólo lectura: el generador nunca lo modifica.
"""

import argparse
import datetime
import json
import re
import sys
from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ITEMS = ROOT / "items.json"
DESC_CORTA = HERE / "desc_corta.json"
FONTS = HERE / "fonts"
OUT_DIR = HERE / "salida"
SITE_URL = "https://fedixcoins.com.ar/item.html?index={}"
BRAND = "FEDIX COINS"

# ── Medidas (pt) ───────────────────────────────────────────────────────────
PAGE_W, PAGE_H = 210 * mm, 297 * mm          # A4
COLS, ROWS = 4, 5                # 20 por hoja: márgenes de ~28 mm arriba y abajo
CELL_W, CELL_H = 45 * mm, 48 * mm
PAD_X, PAD_TOP, PAD_BOTTOM = 2.6 * mm, 2.4 * mm, 2.4 * mm
INNER_W = CELL_W - 2 * PAD_X
BORDER = 0.5
RULE = 0.4

# ── Tipografías ─────────────────────────────────────────────────────────────
FONT_FILES = {
    "Logo": "CormorantGaramond-SemiBold.ttf",
    "Med": "EBGaramond-Medium.ttf",
    "MedIt": "EBGaramond-MediumItalic.ttf",
    "Semi": "EBGaramond-SemiBold.ttf",
}
ASC, DESC = 0.72, 0.26          # alto sobre/bajo la base, en fracción del cuerpo
CAP = 0.65                      # alto de mayúsculas y cifras (EB Garamond, Cormorant)

# País (arriba de todo; el borde de la celda hace de línea de arriba)
COUNTRY_SIZE, COUNTRY_CS = 11.2, 1.7
COUNTRY_TOP = 1.5               # del margen de arriba a las mayúsculas del país
AIR, AIR_TIGHT = 5.0, 3.6       # aire país → línea → datos (ajustado con 7+ renglones)

# Pie: QR (izq.) y precio (der.)
BAND_H = 9.5 * mm
BAND_GAP = 2.5                  # aire entre el último dato y el pie
QR_SIZE = BAND_H
USD_SIZE, USD_CS = 7.4, 1.4
PRICE_MAX, PRICE_CS = 24.0, 0.2
PRICE_LINE_PAD = 3.5            # holgura a cada lado de la línea vertical
LOGO_SIZE, LOGO_CS = 10.5, 1.6  # FEDIX / COINS apilado entre el QR y el precio

# Datos
STYLES = {
    "titulo": ("Semi", 13.8, 0.5),
    "desc": ("MedIt", 12.6, 0.4),
    "dato": ("Med", 12.6, 0.45),
}
LEADING = 15.8
MIN_CS = 0.35
SPLIT_BELOW = 0.82              # si hay que achicar a menos de esto, se parte
SILVER = re.compile(r"plata", re.I)
SCARCITY = re.compile(r"^(muy )?(escasa|escaso|rara|raro|poco vista|dif[ií]cil de ver|tirada baja)$", re.I)


def register_fonts():
    for name, file in FONT_FILES.items():
        pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))


def text_width(text, font, size, cs):
    return pdfmetrics.stringWidth(text, font, size) + cs * max(len(text) - 1, 0)


def fit(text, font, size, cs, avail, min_cs=MIN_CS):
    """Cierra el interletrado y después achica la letra hasta que entre."""
    while cs > min_cs and text_width(text, font, size, cs) > avail:
        cs = max(min_cs, cs - 0.05)
    w = text_width(text, font, size, cs)
    if w > avail:
        size *= avail / w
    return size, cs


# ── Contenido ───────────────────────────────────────────────────────────────
def item_title(item):
    t = item.get("title") or (f"{item['denomination']} {item.get('year', '')}".strip()
                              if item.get("denomination") else str(item.get("year", "")))
    year = item.get("year")
    if isinstance(year, int) and str(year) not in t:
        t = f"{t} {year}"
    t = re.sub(r'"([^"]*)"', "“\\1”", t)          # comillas tipográficas
    return t


def fmt_int(n):
    return f"{n:,}".replace(",", ".")


def mintage_line(item):
    m = item.get("mintage")
    if not isinstance(m, int) or m >= 3_000_000:
        return None
    return f"{fmt_int(m)} ac. (RARA)" if m < 1_000_000 else f"{fmt_int(m)} acuñadas"


def short_desc(idx, item, title, desc_map, has_mintage):
    d = desc_map.get(str(idx))
    if not d:
        return None
    parts = [p.strip() for p in d.split("·")]
    if has_mintage:
        parts = [p for p in parts if not SCARCITY.match(p)]
    d = " · ".join(p for p in parts if p)
    if not d:
        return None
    words = [w for w in re.findall(r"\w+", d.lower()) if len(w) > 3]
    tl = title.lower()
    if words and all(w in tl for w in words):
        return None
    return d


def grade(item):
    g = (item.get("condition") or "").strip()
    return re.sub(r"\s*Details$", " det.", g)


def metal(item):
    c = (item.get("composition") or "").strip()
    if not c:
        return None
    if c.lower().startswith("bimet"):
        return "Bimetálica"
    return c


def dec(s):
    return str(s).strip().replace(".", ",")


def weight_diam(item):
    if not SILVER.search(item.get("composition") or ""):
        return None
    parts = []
    if item.get("weight"):
        parts.append(dec(item["weight"]))
    if item.get("diameter"):
        parts.append("Ø " + dec(item["diameter"]))
    return " · ".join(parts) or None


def price_text(item):
    p = item.get("price")
    if isinstance(p, float) and p.is_integer():
        p = int(p)
    return str(p)


def build_lines(idx, item, desc_map):
    title = item_title(item)
    mint = mintage_line(item)
    lines = [("titulo", title)]
    d = short_desc(idx, item, title, desc_map, bool(mint))
    if d:
        lines.append(("desc", d))
    if mint:
        lines.append(("dato", mint))
    ref = " · ".join(x for x in [
        f"{item['reference']} ({idx})" if item.get("reference") else f"({idx})",
        grade(item),
    ] if x)
    lines.append(("dato", ref))
    for extra in (metal(item), weight_diam(item)):
        if extra:
            lines.append(("dato", extra))
    return lines


# ── Ajuste de renglones ─────────────────────────────────────────────────────
SEPS = {"·", "-", "–"}


def split_balanced(text):
    toks = text.split(" ")
    best = None
    for i in range(1, len(toks)):
        a, b = toks[:i], toks[i:]
        if a[-1] in SEPS:
            a = a[:-1]
        if b and b[0] in SEPS:
            b = b[1:]
        if not a or not b:
            continue
        a, b = " ".join(a), " ".join(b)
        score = max(len(a), len(b))
        if best is None or score < best[0]:
            best = (score, a, b)
    return (best[1], best[2]) if best else (text,)


def layout_lines(lines, avail_w, avail_h):
    """Devuelve [(texto, font, size, cs)] y el interlineado, ajustados al hueco."""
    fitted = []
    for style, text in lines:
        font, size, cs = STYLES[style]
        s, c = fit(text, font, size, cs, avail_w)
        is_mintage = text.endswith("ac. (RARA)") or text.endswith("acuñadas")
        if s < size * SPLIT_BELOW and not is_mintage and " " in text:
            for part in split_balanced(text):
                fitted.append([part, font, *fit(part, font, size, cs, avail_w), size])
        else:
            fitted.append([text, font, s, c, size])
    n = len(fitted)
    base = max(f[4] for f in fitted)
    needed = ASC * fitted[0][2] + (n - 1) * LEADING + DESC * fitted[-1][2]
    scale = min(1.0, avail_h / needed)
    leading = LEADING * scale
    out = [(t, f, min(s, s0 * scale), c) for t, f, s, c, s0 in fitted]
    return out, leading, base * scale


# ── Dibujo ──────────────────────────────────────────────────────────────────
def draw_centered(cv, text, font, size, cs, cx, y):
    w = text_width(text, font, size, cs)
    to = cv.beginText(cx - w / 2, y)
    to.setFont(font, size)
    to.setCharSpace(cs)
    to.textOut(text)
    cv.drawText(to)
    return w


def draw_left(cv, text, font, size, cs, x, y):
    to = cv.beginText(x, y)
    to.setFont(font, size)
    to.setCharSpace(cs)
    to.textOut(text)
    cv.drawText(to)


def draw_qr(cv, url, x, y, size):
    w = QrCodeWidget(url, barLevel="L", barBorder=0)
    b = w.getBounds()
    bw, bh = b[2] - b[0], b[3] - b[1]
    d = Drawing(size, size, transform=[size / bw, 0, 0, size / bh, 0, 0])
    d.add(w)
    renderPDF.draw(d, cv, x, y)


def draw_label(cv, x0, y0, idx, item, desc_map, warn):
    """(x0, y0) = esquina inferior izquierda de la celda."""
    cv.setLineWidth(BORDER)
    cv.rect(x0, y0, CELL_W, CELL_H)
    left, right = x0 + PAD_X, x0 + CELL_W - PAD_X
    cx = x0 + CELL_W / 2
    top = y0 + CELL_H - PAD_TOP
    bottom = y0 + PAD_BOTTOM

    lines = build_lines(idx, item, desc_map)
    air = AIR if len(lines) < 7 else AIR_TIGHT
    cv.setLineWidth(RULE)
    y = top + air - COUNTRY_TOP

    # País: entre el borde de la celda y una línea
    country = item["country"].upper()
    csize, ccs = fit(country, "Med", COUNTRY_SIZE, COUNTRY_CS, INNER_W)
    if csize < COUNTRY_SIZE * 0.8 and " " in country:
        parts = split_balanced(country)
        csize = min(fit(p, "Med", COUNTRY_SIZE, COUNTRY_CS, INNER_W)[0] for p in parts)
        y -= air + CAP * csize
        for i, p in enumerate(parts):
            if i:
                y -= csize * 0.95
            draw_centered(cv, p, "Med", csize, fit(p, "Med", csize, COUNTRY_CS, INNER_W)[1], cx, y)
    else:
        y -= air + CAP * csize
        draw_centered(cv, country, "Med", csize, ccs, cx, y)
    y -= air
    cv.line(left, y, right, y)                                   # línea bajo el país
    data_top = y - air

    # Pie: QR a la izquierda, precio a la derecha
    band_top = bottom + BAND_H
    draw_qr(cv, SITE_URL.format(idx), left, bottom, QR_SIZE)

    num = price_text(item)
    usd_w = text_width("USD", "Med", USD_SIZE, USD_CS)
    psize = min(PRICE_MAX, (BAND_H - CAP * USD_SIZE - 2.2) / CAP)
    max_pw = INNER_W - QR_SIZE - 2 * PRICE_LINE_PAD - 4
    psize, pcs = fit(num, "Semi", psize, PRICE_CS, max_pw)
    num_w = text_width(num, "Semi", psize, pcs)
    block_w = max(num_w, usd_w)
    bx = right - block_w
    cv.setLineWidth(BORDER)
    vx = bx - PRICE_LINE_PAD
    cv.line(vx, bottom, vx, band_top)                            # línea vertical
    draw_left(cv, "USD", "Med", USD_SIZE, USD_CS, right - usd_w, band_top - CAP * USD_SIZE)
    draw_left(cv, num, "Semi", psize, pcs, right - num_w, bottom)

    # FEDIX / COINS apilado en el hueco entre el QR y la línea vertical
    gx0, gx1 = left + QR_SIZE + 2.5, vx - 2.5
    words = BRAND.split()
    bsize = min(fit(w, "Logo", LOGO_SIZE, LOGO_CS, gx1 - gx0)[0] for w in words)
    gcx, mid = (gx0 + gx1) / 2, bottom + BAND_H / 2
    gap = bsize * 0.42
    for w, yb in zip(words, (mid + gap / 2, mid - gap / 2 - CAP * bsize)):
        draw_centered(cv, w, "Logo", bsize, fit(w, "Logo", bsize, LOGO_CS, gx1 - gx0)[1], gcx, yb)

    # Datos: centrados, alineados arriba, entre la línea 2 y el pie
    avail_h = data_top - (band_top + BAND_GAP)
    fitted, leading, _ = layout_lines(lines, INNER_W, avail_h)
    yb = data_top - ASC * fitted[0][2]
    for i, (t, f, s, c) in enumerate(fitted):
        if i:
            yb -= leading
        draw_centered(cv, t, f, s, c, cx, yb)
    min_size = min(s for _, _, s, _ in fitted)
    if min_size < 8:
        warn.append(f"  aviso: #{idx} muy cargado, letra mínima {min_size:.1f} pt")
    return min_size


# ── Selección ───────────────────────────────────────────────────────────────
def available(items):
    return [i for i, it in enumerate(items) if not it.get("sold") and not it.get("book")]


def main():
    ap = argparse.ArgumentParser(description="Etiquetas para sobres — Fedix Coins")
    ap.add_argument("indices", nargs="*", type=int, help="índices de items.json (repetir = otra copia)")
    ap.add_argument("--todas", action="store_true", help="todas las monedas disponibles")
    ap.add_argument("-o", "--out", help="ruta del PDF de salida")
    args = ap.parse_args()

    items = json.loads(ITEMS.read_text(encoding="utf-8"))
    desc_map = json.loads(DESC_CORTA.read_text(encoding="utf-8")) if DESC_CORTA.exists() else {}
    register_fonts()

    today = datetime.date.today().isoformat()
    if args.indices:
        sel = []
        for i in args.indices:
            if not 0 <= i < len(items):
                print(f"  #{i}: no existe en items.json — no se imprime", file=sys.stderr)
                continue
            if items[i].get("sold"):
                print(f"  #{i}: está vendida — se imprime igual", file=sys.stderr)
            if items[i].get("book"):
                print(f"  #{i}: es un catálogo/álbum — se imprime igual", file=sys.stderr)
            sel.append(i)
        name = f"etiquetas_{today}.pdf"
    elif args.todas:
        sel = available(items)
        name = f"etiquetas_todas_{today}.pdf"
    else:
        sel = available(items)[:COLS * ROWS]
        name = f"etiquetas_{today}.pdf"
    if not sel:
        sys.exit("No hay monedas para imprimir.")

    missing = [i for i in sel if str(i) not in desc_map]
    out = Path(args.out) if args.out else OUT_DIR / name
    out.parent.mkdir(parents=True, exist_ok=True)

    cv = canvas.Canvas(str(out), pagesize=(PAGE_W, PAGE_H))
    cv.setTitle("Etiquetas — Fedix Coins")
    gx = (PAGE_W - COLS * CELL_W) / 2
    gy = (PAGE_H - ROWS * CELL_H) / 2
    warn, sizes = [], []
    per_page = COLS * ROWS
    for n, idx in enumerate(sel):
        if n and n % per_page == 0:
            cv.showPage()
        k = n % per_page
        col, row = k % COLS, k // COLS
        x = gx + col * CELL_W
        y = PAGE_H - gy - (row + 1) * CELL_H
        sizes.append(draw_label(cv, x, y, idx, items[idx], desc_map, warn))
    cv.save()

    pages = (len(sel) + per_page - 1) // per_page
    print(f"{out}  —  {len(sel)} etiquetas, {pages} hoja(s) A4")
    print(f"letra mínima por papelito: {min(sizes):.1f}–{max(sizes):.1f} pt")
    for w in warn:
        print(w)
    if missing:
        print(f"sin descripción corta en desc_corta.json: {', '.join(map(str, sorted(set(missing))))}")


if __name__ == "__main__":
    main()
