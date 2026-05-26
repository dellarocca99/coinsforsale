---
name: mercadolibre-excel
description: Fill MercadoLibre's bulk-publish Excel template (.xlsx) with new coins from items.json. Use when the user wants to push new catalog entries to MercadoLibre — they will name the starting coin and you will fill from there to the end of items.json. Confirms pricing policy and package dimensions before running.
---

# MercadoLibre bulk-publish Excel filler

Fills a MercadoLibre coin-category bulk-publish `.xlsx` template with rows generated from `items.json`. Runs `fill_ml_excel.py` (openpyxl-based) which preserves the template's data validations and formulas.

## When to use

The user asks something like "fill MercadoLibre's Excel", "publish new coins to ML", "generate the ML upload sheet starting from X coin".

## Workflow

Follow these steps in order. Do NOT run the script until all four confirmations are gathered.

### 1. Locate the template

Look for `Publicar-*.xlsx` in the project root and use the most recently modified one. If multiple exist or none is obvious, ask the user for the path.

```bash
ls -t Publicar-*.xlsx | head -5
```

### 2. Find the starting coin

The user describes a coin (e.g. "start from the Morgan Dollar 1904"). Search `items.json` for that title and report back the index plus the next couple of entries so the user can confirm:

> "Found at index 137: `1 Dollar "Morgan" 1904`. Filling 137 → 200 (64 coins, last is `Quarter "Crossing the Delaware" 2021-D`). Confirm?"

If the user names something ambiguous, list the matches and ask. If they want a hard stop, ask for the ending coin too (otherwise default to end of file).

### 3. Confirm the pricing policy

Default policy (from `fill_0429.py`):

| Constant | Default | Meaning |
|---|---|---|
| USD→ARS | 1430 | Exchange rate |
| Threshold | 50,000 ARS | Above this: add surcharge + free shipping |
| Surcharge | 12,160 ARS | Added when above threshold |
| Silver mult | 1.25 | Final multiplier for silver coins |
| Base mult | 1.20 | Final multiplier for non-silver coins |
| Low threshold | 33,000 ARS | Below this: add low-add |
| Low add | 2,500 ARS | Added below low threshold |

Always present these values and ask: "Are all of these still correct, or do any need to change for this run?" Pass any changed values via CLI flags (`--usd-ars`, `--threshold`, etc.).

### 4. Remind about default package dimensions

State the defaults as a reminder, not a question that needs a yes/no:

> "Defaults for this batch: **10 × 15 × 2 cm, 0.1 kg**, with the **12,160 ARS surcharge** when free shipping kicks in. Let me know if any specific items in this batch should use different dimensions."

**If the user names items that need different dimensions:** for each of those items, also explicitly double-check the surcharge — the 12,160 ARS figure represents what ML charges the seller for free shipping at the default package size, so a larger or heavier package almost certainly has a different surcharge. Ask the user for the correct surcharge value for those items. Do not assume the same 12,160 applies.

Collect per-item overrides into a JSON file at `.claude/skills/mercadolibre-excel/_overrides.json` (gitignored — see Notes) with shape:

```json
{
  "150": {"width": 15, "height": 20, "depth": 5, "weight": 0.3, "surcharge": 15000},
  "152": {"width": 12, "height": 12, "depth": 3, "weight": 0.2, "surcharge": 13500}
}
```

Keys are items.json indices (as strings). Any subset of `width`/`height`/`depth`/`weight`/`surcharge` may be specified; missing fields fall back to the run-wide defaults.

### 5. Run the script

```bash
python .claude/skills/mercadolibre-excel/fill_ml_excel.py \
  "<template>.xlsx" \
  --start <index> \
  [--end <index>] \
  [--usd-ars 1430 --threshold 50000 --surcharge 12160 ...] \
  [--overrides .claude/skills/mercadolibre-excel/_overrides.json]
```

Output is saved as `<template>_filled.xlsx` next to the original. The original is never modified.

### 6. Report results

The script prints: rows written, skipped (sold/book), truncated titles (>60 chars), and any items missing a year (ML requires it). Surface this to the user and ask them to:
- Fix truncated titles manually in the Excel.
- Fill in the year for items where it was missing from items.json.

## Column reference (Monedas sheet, data starts row 9)

| Col | Field | Filled? | Notes |
|---|---|---|---|
| A  | Código catálogo ML | no | — |
| B  | Título | yes | Search-optimized — see "Title rules" below. |
| C  | (formula: char count) | skip | — |
| D  | Condición | yes | Always `Usado` |
| E  | Código universal | no | — |
| F  | Fotos | yes | Comma-joined GitHub URLs, with `coins.jpg` appended last |
| G  | SKU | yes | items.json index as string |
| H  | Stock | yes | Always `1` |
| I  | Precio | yes | ARS, computed by `calc_price_and_ship` |
| J  | Descripción | yes (if present) | Spanish description from items.json |
| K  | Ancho (cm) | yes | Default `10` |
| L  | Alto (cm) | yes | Default `15` |
| M  | Profundidad (cm) | yes | Default `2` |
| N  | Peso (kg) | yes | Default `0.1` |
| O  | (formula) | skip | — |
| P  | Cuotas | no | Template default `No agregar cuotas` |
| Q  | (formula) | skip | — |
| R  | Forma de envío | no | Template default `Mercado Envíos` |
| S  | Costo de envío | yes | `Ofrecés envío gratis` or `A cargo del comprador` |
| T  | Retiro en persona | no | Template default `No acepto` |
| U–X | Garantía / Factura A | no | Template defaults are fine |
| Y  | Año de emisión | yes (if present) | Required by ML |
| Z  | Origen | yes (if mapped) | Country mapped via `COUNTRY_ORIGEN` |
| AA | Marca | no | — |
| AB | Modelo | no | — |
| AC | Tipo de metal | yes (if derived) | Plata / Cobre / Níquel / Bronce / Oro |
| AD | Moneda conmemorativa | no | — |
| AE | Valor de la moneda | no | — |
| AF | Tipo de moneda | yes (if derived) | Peso / Dólar / Real |
| AG–AI | Internal ML helpers | skip | — |

## Title rules (search-optimized)

The title (column B) is built as a cascade, fitting as many keywords as possible within ML's 60-char limit. Order (left = highest priority, last to be dropped):

```
{base} {country_full} {metal} Moneda Coleccion
```

- **`base`** is the coin's `title` field with inner double-quotes stripped (e.g. `1 Dollar "Anthony" 1979-D` → `1 Dollar Anthony 1979-D`). Quotes are search-neutral and waste chars.
- **`{country_full}`** for USA is `Estados Unidos - EEUU - USA` (covers all three common search spellings). Falls back to `EEUU - USA` if the full form pushes the title over 60 chars. For other countries, uses the mapped Origen name.
- **`{metal}`** is `Plata` for silver coins or `Oro` for gold (derived from composition). Added only if there's room. Other metals (Cobre/Níquel/Bronce) are not appended — only the high-search-intent ones.
- **`Moneda`** is appended at the end as a keyword. The category already says "Monedas", but the word still helps free-text search ranking.
- **`Coleccion`** appended when room allows.

When the title overflows 60 chars, the function drops the rightmost keyword first (`Coleccion` → `Moneda` → metal), then swaps the country form to the short version and retries the full keyword cascade. Only as a last resort is the result truncated.

What is intentionally NOT done:
- Year is left in its natural position inside `base` (no special reordering).
- Spanish spellings like `Dolar`/`Centavo` are not substituted for `Dollar`/`Cent` — keeps the original coin name intact.

## Notes

- Items with `sold: true` or `book: true` are skipped automatically and reported.
- Items with `country: "Egipto"` get a blank `Z` because ML's dropdown doesn't include Egypt.
- Some denominations (Lira, Qirsh, Franc) don't map to ML's `Tipo de moneda` dropdown — AF stays blank for those.
- Per-item package dimensions and surcharge are supported via `--overrides path/to/file.json`. Keep override files out of git — write them to `.claude/skills/mercadolibre-excel/_overrides.json` (the leading underscore puts them in `.gitignore` patterns the user already uses, or add an explicit ignore line if needed).
- Whenever the user changes dimensions for an item, the 12,160 ARS surcharge for that item must also be revisited — it's the price ML charges the seller for free shipping at the default package size, and it scales with the package.
