---
name: numista-enrich
description: Completa los datos técnicos de las monedas de items.json (módulo, peso, composición, unidad monetaria, número de catálogo KM#, territorio) tomándolos de la API de Numista. Usar cuando el usuario quiera enriquecer el catálogo, cargar fichas técnicas, o actualizar items.json después de agregar monedas nuevas.
---

# Enriquecer items.json desde Numista

Rellena los campos técnicos de cada moneda consultando la API oficial de Numista y los deja en `items.json`, que es la fuente única de la web, de la skill de Facebook y de la de MercadoLibre.

## Campos que escribe

| Campo | Ejemplo | Origen en la API |
|---|---|---|
| `diameter` | `"37 mm"` | `size` |
| `weight` | `"25 g"` | `weight` |
| `composition` | `"Plata 0.900"` | `composition.text`, normalizado al castellano |
| `currency` | `"Peso"` | `value.currency.name` |
| `reference` | `"KM# 17"` | `references[]`, prefiriendo el catálogo KM |
| `region` | `"Buenos Aires"` | `issuer.name`, solo si el emisor difiere del país |
| `numista_id` | `27128` | `id` del tipo |

`numista_id` es el que hace baratas las corridas siguientes: una moneda ya vinculada no se vuelve a buscar. **Nunca toca** `title`, `price`, `condition`, `description`, `images`, `sold`, `quantity`, `country` ni `year` — esos dos últimos son la clave de matcheo.

## La API key

La API necesita una key. **El usuario la genera y la carga él mismo. No se la pidas por chat, no la escribas vos en ningún archivo, y si te la pega igual, no la uses: pedile que la ponga por una de estas dos vías.**

- `.claude/skills/numista-enrich/_numista_key.txt` (gitignoreado por `_*.txt`), o
- `$env:NUMISTA_API_KEY = 'la-key'`.

El script prueba la variable y después el archivo. El archivo existe porque `setx` solo afecta procesos nuevos: una app ya abierta no ve la variable hasta reiniciarse.

El `client ID` de Numista no hace falta — es para OAuth de colección, no para leer el catálogo.

Si la key llegó a aparecer en un chat o un log, conviene regenerarla en Numista.

## Cuota: 2.000 requests por mes

El plan gratuito da **2.000 requests por mes calendario**, no acumulables — lo que no se usa se pierde el 1º. Incluye toda la API salvo *Search by Image* (que esta skill no usa).

Una corrida limpia del catálogo entero cuesta **~180 requests**: 130 búsquedas + ~50 detalles de tipo + 1 de `/issuers`. Cómodo, pero no es gratis, así que:

- **El cache es la defensa principal.** `_numista_cache.json` guarda búsquedas, tipos y la lista de emisores, y se graba aunque cortes la corrida a mitad. Volver a correr sobre el mismo catálogo cuesta casi 0 requests. **No lo borres sin motivo.**
- **La corrida incremental es la barata.** Sin flags solo procesa lo que no tiene `numista_id`: diez monedas nuevas son ~15 requests.
- **`--refresh` es la cara**, porque reprocesa todo. Usalo solo cuando cambie el mapeo de campos.
- Resolver un pendiente poniéndole el `numista_id` a mano cuesta **1 request** (va directo al tipo, sin buscar).

Un 429 corta la corrida y avisa; lo ya consultado queda en el cache, así que se retoma sin volver a gastar.

## Uso

El script es de dos fases a propósito: **nunca escribe `items.json` hasta que se lo pidas**.

```bash
python .claude/skills/numista-enrich/enrich.py            # 1. busca y propone
python .claude/skills/numista-enrich/enrich.py --apply    # 2. aplica la propuesta
```

| Flag | Efecto |
|---|---|
| *(sin flags)* | Procesa lo pendiente: sin `numista_id`, **o** con `numista_id` pero sin `currency` (o sea, vinculado a mano y todavía sin completar). Sirve tanto para la primera corrida como para el alta incremental. |
| `--refresh` | Reprocesa también los ya vinculados (para re-normalizar o corregir en masa). |
| `--index N` | Solo esos índices, repetible. |
| `--apply` | Aplica `_numista_proposal.json` a `items.json`. |
| `--dump-schema <N#>` | Imprime el JSON crudo de un tipo. |

### Para monedas nuevas

Es el caso incremental y no requiere ningún flag: agregás las monedas a `items.json`, corrés el script, y como las nuevas no tienen `numista_id`, son las únicas que consulta. El cache hace que los tipos ya conocidos ni siquiera peguen a la red.

## Workflow

1. **Verificá que la key esté configurada.** Si no, pedile al usuario que la genere; no sigas.
2. **Primera vez: fijá el esquema.** Corré `--dump-schema 27128` (Uruguay 1 Peso 1877) y confirmá los nombres reales de los campos. El mapeo es defensivo pero se escribió sin haber visto una respuesta real: si algún campo viene con otro nombre, corregí `pick_*()` antes de la corrida grande.
3. **Corré sin flags** y mirá el resumen: cuántos resolvió y cuántos quedaron para revisar.
4. **Revisá `_numista_review.json`.** Son los casos donde el script **no adivina**: ningún tipo cubre el año, varios tipos lo cubren, o la composición no está en la tabla de normalización. Cada uno trae los candidatos con su link. Resolvelos poniendo el `numista_id` a mano en `items.json` y volviendo a correr.
5. **Revisá `_numista_proposal.json`** — trae `antes`/`despues` por campo y el link a Numista de cada tipo.
6. **`--apply`.** Hace backup de `items.json` (`_items_backup_<fecha>.json`) antes de escribir.
7. **`git diff items.json`** y revisión final antes de commitear.

## Cómo matchea, y por qué puede fallar

**No uses el parámetro `issuer`.** Cuando va presente, la API ignora el `q` y devuelve el catálogo entero del emisor ordenado por denominación — con 50 por página, el tipo correcto queda fuera de la primera página. Verificado: `q="1 Cent"` + `issuer=united-states` devolvía "½ Cent" y tipos de Estados Confederados.

Lo que sí funciona es texto libre solo, y **el año adentro de la query lo afina muchísimo**: `q="1 cent 1873 indian"` devuelve 2 resultados con el Indian Head correcto primero. Por eso la query es `"{emisor} {denominación} {año}"`.

Sobre esos candidatos corren tres filtros, y las corridas mostraron que los tres hacen falta:

1. **Emisor, por jerarquía de códigos.** No alcanza comparar nombres: las provinciales argentinas las emite `"Buenos Aires"` o `"Córdoba, Provincia de"`, que no contienen la palabra "Argentina". `/issuers` expone la jerarquía real (`buenos_aires` → `argentine-provinces` → `argentina`), así que se acepta al candidato cuyo código **desciende de la raíz del país**. Las raíces no son adivinables — `Francia` es `france_section`, `Perú` es `perou_section`, `USA` es `united-states` — están en la tabla `ISSUERS`. De paso, que el emisor no sea la raíz misma es exactamente lo que llena `region`.
2. **Denominación normalizada.** `items.json` escribe "Half dollar" y "5/10 Real"; Numista escribe "½ Dollar" y "5⁄10 Real" (con barra de fracción U+2044). Sin normalizar, **todas** las fraccionarias del catálogo fallaban. `norm_denom()` unifica glifos, "half"→"1/2", "quarter"→"1/4", y aplica alias como `1 Dime` → `10 Cents`.
3. **Año** dentro de `min_year`–`max_year`, más el descarte de `pattern`, `token`, `countermark`, `trial`.

Queda **un solo tipo** → se aplica. **Cero o varios** → va a revisión, sin adivinar. Poner un KM# equivocado en una publicación de venta es peor que dejarlo vacío.

Las ambigüedades son reales, no un defecto del filtro: el Perú 1 Real 1772 cae justo en el año en que se solapan dos tipos de Carlos III (1760-1772 y 1772-1789), y hay que mirar la moneda para saber cuál es.

## `currency` no siempre es una palabra

Numista devuelve la unidad monetaria histórica real, no una etiqueta corta: `"Peso"`, `"Dollar"`, pero también `"Peso moneda nacional"` y `"Peso fuerte"`. Es correcto y es más informativo, pero tiene dos consecuencias:

- Viene `"Dollar"`, no `"Dólar"`, aun pidiendo `lang=es`.
- La skill de MercadoLibre necesita para su columna `AF` los valores del desplegable de ML (`Peso`, `Dólar`, `Real`). `"Peso moneda nacional"` no matchea, así que ese mapeo va del lado de la skill de ML, no de acá.

## Trampas ya encontradas (no las repitas)

- **La ley de plata viene con coma.** Con `lang=es` Numista escribe `"Plata 892,4"`. Un regex que capture solo `[\d.]` la trunca a `0.892` en silencio. `pick_composition()` limpia coma y punto antes de rearmar la ley.
- **`--index` procesa el índice aunque ya esté completo**, pero la corrida sin flags toma lo que no tiene `numista_id` **o** no tiene `currency`. La segunda condición es la que permite el flujo de resolución manual: si el filtro mirara solo `numista_id`, una moneda recién vinculada a mano quedaría excluida justo en la corrida que tenía que completarla.
- **Numista describe las clad con el proceso completo** (`"Cobre recubierto de cuproníquel"`). La tabla las acorta conservando el "clad", que es lo que explica por qué el peso no es el del metal puro.
- **La jerarquía de emisores mete falsos positivos**: `danish_west_indies_period` desciende de `united-states`, así que un cent danés puede aparecer entre los candidatos de un cent norteamericano. Solo agrega ruido a la revisión, nunca produce un match automático equivocado.

## Notas

- `lang=es` en todas las llamadas, así la composición viene en castellano de origen. La tabla `COMPOSITION` solo unifica la ortografía con la que ya usa el repo (`Cu Ni`, `Plata 0.900`, `Bronce de aluminio`). Lo que no está en la tabla se guarda tal cual **y se reporta**, nunca se traduce a la fuerza.
- Cache en `_numista_cache.json`: guarda búsquedas y tipos completos, y se graba aunque cortes la corrida a mitad. Borralo para forzar consultas frescas.
- 0.4 s entre llamadas. Un 429 corta y avisa.
- Todos los `_*.json` de las skills están gitignoreados, igual que `enrich.py` (el `.gitignore` del repo ignora `*.py`, misma convención que la skill de MercadoLibre).
- Reescribir `items.json` con `json.dump(indent=2)` es seguro: se verificó que el round-trip mantiene el mismo número de líneas y solo normaliza un par de espacios que ya estaban inconsistentes en el original.
- `items.json` vive en OneDrive y puede cambiar entre lecturas. Releé antes de aplicar.
- Estado del catálogo tras la primera pasada completa: **173 de 174** monedas con `numista_id`, `reference`, `diameter`, `weight` y `currency`. La única sin resolver es el **Blister Mundial 1978 (idx 228)**: es un set de varias monedas en blister y Numista cataloga piezas sueltas, no el envase. No hay tipo que le corresponda; dejala así.
- Las ambigüedades se resolvieron mirando lo que el propio `items.json` ya decía. Vale la pena intentarlo antes de preguntar: el título trae el conmemorativo ("ONU", "Tango", "Mundial"), la composición ya cargada desempata tipos que solo difieren en el metal (el 5 Centavos 1942 decía "Bronce de aluminio" → KM# 40), y hasta **el nombre del archivo de imagen** desempata los Westward Journey (`nickel_boat_d` → Keelboat, `nickel_purchase_d` → Louisiana Purchase).
- Lo que sí requiere ver la moneda: el canto (los 2 Pesos argentinos de un mismo conmemorativo difieren solo en estriado vs liso, y son KM# distintos) y los años de transición entre diseños.
