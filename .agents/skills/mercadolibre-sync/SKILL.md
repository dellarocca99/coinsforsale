---
name: mercadolibre-sync
description: Sincroniza items.json (la web de Fedix Coins) con MercadoLibre por API — altas, bajas, ventas, republicaciones, cambios de precio. Usar cuando el usuario diga que vendió una moneda ("che, vendí tal"), pida subir/publicar monedas nuevas en ML, pida "sincronizá" / revisar ventas de ML, cambiar un precio o datos de una publicación, o actualizar precios por el dólar. Reemplaza a mercadolibre-excel.
---

# MercadoLibre sync

Herramienta: `python tools/mercadolibre/ml_sync.py <comando>` (desde la raíz del repo).
Todo comando que cambia algo es **vista previa por defecto**; `--apply` lo ejecuta. Con `--apply`, si cambia `items.json` o `ml_state.json`, hace commit + push (eso publica la web). `--no-push` / `--no-commit` para evitarlo.

## Reglas de negocio

- `quantity` es stock interno: **no se muestra en la web**. Ausente = 1.
- No todo es moneda: ver "Catálogos y álbumes".
- **Venta en la web**: qty −1. Si queda > 0, ML no se toca. Si llega a 0 → `sold: true` + `soldon` (hoy) y se cierra la publicación de ML.
- **Venta en ML**: qty −1. Si queda > 0 → se republica en ML (usado, stock 1) con el precio del día. Si llega a 0 → `sold: true` + `soldon` = fecha de la orden.
- Monedas en ML: **Usado, stock 1**. Catálogos y álbumes: **Nuevo, todo el stock**.
- `items.json` es **append-only**: el índice del array es la identidad de la moneda y su `SELLER_SKU` en ML. Nunca reordenar ni borrar entradas.

## Catálogos y álbumes (no todo es moneda)

Items con `book: true` y `book_type` (`catalog` / `album`) se sincronizan igual, con estas diferencias (config en `ml_config.json` → `types`):
- Se publican como **Nuevo con todo el stock** (`available_quantity` = `quantity`). Una venta en ML no se republica: ML descuenta solo; la web baja la qty y, si ML quedó sin stock con stock en la web, se reactiva. Venta en la web con stock restante → se actualiza el stock en ML.
- Categoría: catálogos `MLA412445` (Libros Físicos), álbumes `MLA441114` (Álbumes para Numismática).
- Paquete por tipo: catálogo 9×20×6 cm 710 g (medido del Red Book), álbum 25×30×3 cm 300 g (estimado — si ML cobra distinto, ajustar). Override por índice en `overrides`.
- Precio: misma fórmula (×1,20, no son de plata). Título: `{título} Catálogo de Monedas|Álbum para Monedas {país} Numismatica`.
- Atributos obligatorios: IVA e Impuesto interno (`tax` en la config — **los define el usuario**, no asumir), y para catálogos AUTOR + ISBN (`item_attributes["<idx>"]`, p. ej. `{"AUTHOR": "...", "GTIN": "978..."}`). `publish` saltea y reporta lo que falte.
- `match_score` exige el año del item en el título de ML: tenerlo en cuenta si un catálogo/álbum no matchea.

## Política de precios (validada con el usuario 2026-11-04)

```
ars = USD × dólar blue venta (dolarapi.com/v1/dolares/blue — mismo valor que dolarhoy y que usa la web)
si ars ≥ 50.000:  ars += costo real del envío gratis que ML cobra al vendedor (consultado a la API por medidas/peso)
ars ×= 1,25 si es plata, 1,20 si no
si ars < 33.000:  ars += 2.500
```
Paquete por defecto 10×15×2 cm, 0,1 kg; medidas distintas por moneda en `ml_config.json` → `overrides` (clave = índice). Todo en `tools/mercadolibre/ml_config.json`.
Si la cotización no responde, el comando aborta (nunca publicar con dólar viejo). Si el costo de envío no responde, usa `fallback_surcharge` y lo marca como `(fallback)` en la vista previa — avisale al usuario.
**Antes de cada alta**, mostrale al usuario la cotización del día y el desglose de precio de la vista previa y esperá su OK.

## Qué hacer según lo que dice el usuario

| El usuario dice | Hacer |
|---|---|
| "vendí X" / "se vendió X por la web" | Buscar X en `items.json` (por `title`, o `denomination` + `year` cuando no hay title; ignorar las `sold`). Si hay más de una coincidencia, mostrar las opciones con índice y preguntar. Con la moneda identificada sin dudas: `sold-web <idx> --apply` (la orden del usuario ya es la confirmación). Reportar stock que queda y si se cerró en ML. |
| "sincronizá" / "¿se vendió algo en ML?" | `sync-orders` (vista previa) → si hay órdenes nuevas, mostrar y correr `sync-orders --apply`. Reportar órdenes sin matchear y cancelaciones. |
| "subí las nuevas" / "publicá X" | `publish --new` (o `publish <idx...>`) en vista previa → mostrar tabla de títulos y precios + salteadas con motivo → con OK, `--apply`. |
| "cambiá el precio / descripción / fotos de X" | Editar `items.json`, commit+push de la web, y `update <idx> --fields price,description,pictures` (vista previa → `--apply`). El título solo se puede cambiar si la publicación no tuvo ventas. |
| "actualizá los precios por el dólar" | `reprice --min-change 5` → mostrar diff → con OK, `--apply`. |
| "¿cómo está todo?" | `status --online`. |

Al empezar una sesión de trabajo con la tienda, conviene correr `sync-orders` (vista previa) para detectar ventas de ML pendientes.

## Comandos

```
auth [--code "<URL redirigida o code>"]     # una vez: login OAuth
reconcile [--apply] [--close-sold]          # conciliar ML vs items.json; --apply guarda mapeo y config (categoría, tipo de publicación, IDs de atributos)
price <idx...> [--offline]                  # solo calcula precio/título, no cambia nada
publish (<idx...> | --new) [--apply] [--force]
sold-web <idx> [--qty N] [--apply]
sync-orders [--since YYYY-MM-DD] [--apply]
update <idx> [--fields price,description,pictures,title] [--apply]
reprice [--min-change 5] [--apply]
status [--online]
```

## Archivos

- `tools/mercadolibre/ml_api.py` — OAuth + HTTP. El refresh token es de uso único: se rota y se guarda en cada renovación.
- `tools/mercadolibre/ml_policy.py` — precio, título (máx 60, optimizado para búsqueda), atributos, fotos (GitHub raw + `coins.jpg` al final).
- `tools/mercadolibre/ml_config.json` — política y datos de categoría (commiteado).
- `tools/mercadolibre/ml_state.json` — índice → `ml_id` actual + historial (cambia al republicar), órdenes procesadas (commiteado).
- `tools/mercadolibre/_credentials.json` — client_id/secret y tokens (**gitignoreado, nunca commitear ni mostrar**). Plantilla: `credentials.example.json`.
- `tools/mercadolibre/_reconcile_report.json` — detalle del último `reconcile` (gitignoreado).

## Primera puesta en marcha (Fase 0)

1. El usuario crea la app en developers.mercadolibre.com.ar → Mis aplicaciones (redirect URI `https://fedixcoins.com.ar/`, scopes lectura/escritura/offline_access) y copia `credentials.example.json` → `_credentials.json` con su client_id/secret. Las credenciales las carga el usuario, no Claude.
2. `auth` → el usuario abre la URL, autoriza, y pasa la URL a la que fue redirigido → `auth --code "<url>"`.
3. `reconcile` (solo lectura) → revisar con el usuario → `reconcile --apply` (+ `--close-sold` para cerrar en ML lo vendido en la web).
4. Revisar en `_reconcile_report.json` → `sample_item.attributes` que los IDs de atributos guardados en `ml_config.json` coincidan con los que usaba la planilla; probar `publish <idx>` con **una** moneda antes de usar `--new`.

## Pendiente (Fase 2)

GitHub Action con cron cada ~30 min para `sync-orders --apply`. Requiere resolver dónde viven los tokens (el refresh token es de uso único: local y GitHub no pueden tener cada uno su copia) — opción preferida: Cloudflare KV.
