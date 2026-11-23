#!/usr/bin/env python3
"""Organización de las monedas en hojas de 4 x 5 bolsillos — Fedix Coins.

Genera un PDF A4 con una página por hoja de monedas: grilla de 4 columnas (A–D)
x 5 filas (1–5) con, en cada casillero, el índice de items.json, la posición,
el título (y variante), el estado y el precio. Entra cada moneda disponible
(sin vendidas ni catálogos/álbumes), un casillero por moneda aunque haya stock.

Orden de las hojas:
  1. USA                         (arranca en hoja nueva)
  2. Argentina                   (arranca en hoja nueva)
  3. Uruguay + resto del mundo   (arranca en hoja nueva; comparten hojas)
Dentro de cada grupo: sistema monetario → valor facial → año. En el último
grupo, Uruguay primero y después el resto por país.

Uso:
    python tools/etiquetas/hojas.py            # → tools/etiquetas/organizacion_hojas.pdf
    python tools/etiquetas/hojas.py -o x.pdf

items.json es de sólo lectura.
"""

import argparse
import datetime
import json
import re
from fractions import Fraction
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ITEMS = ROOT / "items.json"
FONTS = HERE / "fonts"
OUT = HERE / "organizacion_hojas.pdf"

COLS, ROWS = 4, 5
PER_SHEET = COLS * ROWS

# Sistema monetario (orden cronológico) y valor facial, para ordenar.
SYS = {"Real": 0, "Peso fuerte": 0, "Peso": 1, "Peso moneda nacional": 2, "Medalla monetaria": 2,
       "Peso ley": 3, "Peso uruguayo": 4, "Peso convertible": 5}
UNIT = {"centavo": .01, "centésimo": .01, "cent": .01, "real": 1, "peso": 1, "dime": .1,
        "half dime": .05, "quarter dollar": .25, "half dollar": .5, "dollar": 1,
        "kreuzer": 1, "franc": 1, "lire": 1}


def face(denomination):
    d = denomination.lower()
    m = re.match(r"([\d/]+)\s+(.*)", d)
    n, u = (float(Fraction(m.group(1))), m.group(2)) if m else (1, d)
    for k in sorted(UNIT, key=len, reverse=True):
        if u.startswith(k):
            return n * UNIT[k]
    raise ValueError(f"denominación desconocida: {denomination!r} (sumarla a UNIT)")


def key(p):
    i, it = p
    return (SYS.get(it.get("currency"), 0), face(it["denomination"]), it.get("year") or 0,
            it.get("title") or "", i)


def build_groups(items):
    av = [(i, it) for i, it in enumerate(items) if not it.get("sold") and not it.get("book")]
    usa = sorted([p for p in av if p[1]["country"] == "USA"], key=key)
    arg = sorted([p for p in av if p[1]["country"] == "Argentina"], key=key)
    uru = sorted([p for p in av if p[1]["country"] == "Uruguay"], key=key)
    rest = sorted([p for p in av if p[1]["country"] not in ("USA", "Argentina", "Uruguay")],
                  key=lambda p: (p[1]["country"],) + key(p))
    # (nombre del grupo, monedas, mostrar país en cada casillero)
    return [("USA", usa, False), ("Argentina", arg, False),
            ("Uruguay y resto del mundo", uru + rest, True)]


def build_pages(groups):
    pages = []
    for name, coins, show_country in groups:
        for s in range(0, len(coins), PER_SHEET):
            pages.append((name, s, len(coins), coins[s:s + PER_SHEET], show_country))
    return pages


def draw(pages, out):
    pdfmetrics.registerFont(TTFont("Med", str(FONTS / "EBGaramond-Medium.ttf")))
    pdfmetrics.registerFont(TTFont("Bold", str(FONTS / "EBGaramond-SemiBold.ttf")))
    pdfmetrics.registerFont(TTFont("Ital", str(FONTS / "EBGaramond-MediumItalic.ttf")))

    W, H = A4
    M, TOP = 12 * mm, 30 * mm
    CW = (W - 2 * M) / COLS
    CH = (H - TOP - 16 * mm) / ROWS
    INK, GREY, LIGHT = (0.12, 0.12, 0.12), (0.45, 0.45, 0.45), (0.75, 0.75, 0.75)

    cv = canvas.Canvas(str(out), pagesize=A4)
    cv.setTitle("Organización en hojas 4×5 — Fedix Coins")
    today = datetime.date.today().strftime("%d-%m-%Y")
    for n, (name, s, tot, chunk, show_country) in enumerate(pages, 1):
        cv.setFillColorRGB(*INK)
        cv.setFont("Bold", 22)
        cv.drawString(M, H - 18 * mm, f"Hoja {n}")
        cv.setFont("Med", 15)
        cv.drawString(M + 30 * mm, H - 18 * mm, f"{name}  ·  {s + 1}–{s + len(chunk)} de {tot}")
        cv.setFont("Med", 9)
        cv.setFillColorRGB(*GREY)
        cv.drawRightString(W - M, H - 18 * mm, f"Fedix Coins · {len(pages)} hojas · {today}")

        top = H - TOP
        cv.setFont("Bold", 10)
        for c in range(COLS):
            cv.drawCentredString(M + c * CW + CW / 2, top + 2.5 * mm, "ABCD"[c])
        for r in range(ROWS):
            cv.drawCentredString(M - 4.5 * mm, top - r * CH - CH / 2, str(r + 1))

        for k in range(PER_SHEET):
            r, c = divmod(k, COLS)
            x, y = M + c * CW, top - (r + 1) * CH
            cv.setStrokeColorRGB(*LIGHT)
            cv.setLineWidth(0.6)
            cv.rect(x, y, CW, CH)
            pad, tw = 3 * mm, CW - 6 * mm
            if k >= len(chunk):
                cv.setFillColorRGB(*LIGHT)
                cv.setFont("Ital", 11)
                cv.drawCentredString(x + CW / 2, y + CH / 2, "libre")
                continue
            i, it = chunk[k]
            yy = y + CH - pad - 14
            cv.setFillColorRGB(*INK)
            cv.setFont("Bold", 17)
            cv.drawString(x + pad, yy, f"#{i}")
            cv.setFont("Med", 9)
            cv.setFillColorRGB(*GREY)
            cv.drawRightString(x + CW - pad, yy + 3, f"{'ABCD'[c]}{r + 1}")
            yy -= 6
            if show_country:
                yy -= 11
                cv.setFont("Bold", 9.5)
                cv.drawString(x + pad, yy, it["country"].upper())
            title = it.get("title") or f'{it["denomination"]} {it["year"]}'
            cv.setFillColorRGB(*INK)
            cv.setFont("Med", 11.5)
            for line in simpleSplit(title, "Med", 11.5, tw)[:3]:
                yy -= 13
                cv.drawString(x + pad, yy, line)
            if it.get("variety"):
                cv.setFont("Ital", 9)
                cv.setFillColorRGB(*GREY)
                for line in simpleSplit(it["variety"], "Ital", 9, tw)[:2]:
                    yy -= 10.5
                    cv.drawString(x + pad, yy, line)
            cv.setFont("Med", 9)
            cv.setFillColorRGB(*GREY)
            cv.drawString(x + pad, y + pad, it.get("condition", ""))
            price = it.get("price")
            cv.setFillColorRGB(*INK)
            cv.setFont("Bold", 10)
            cv.drawRightString(x + CW - pad, y + pad,
                               f"US$ {price:g}" if isinstance(price, (int, float)) else str(price or ""))
        cv.showPage()
    cv.save()


def main():
    ap = argparse.ArgumentParser(description="Organización en hojas 4×5 — Fedix Coins")
    ap.add_argument("-o", "--out", help=f"ruta del PDF (por defecto {OUT.relative_to(ROOT)})")
    args = ap.parse_args()
    out = Path(args.out) if args.out else OUT
    items = json.loads(ITEMS.read_text(encoding="utf-8"))
    groups = build_groups(items)
    pages = build_pages(groups)
    draw(pages, out)
    first = 1
    for name, coins, _ in groups:
        n = -(-len(coins) // PER_SHEET)
        print(f"{name}: {len(coins)} monedas, hojas {first}–{first + n - 1}")
        first += n
    print(f"{out} · {len(pages)} hojas")


if __name__ == "__main__":
    main()
