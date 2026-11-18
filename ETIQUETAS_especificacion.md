# Etiquetas para sobres de monedas — especificación completa

Documento de referencia con **todas las convenciones** y los **parámetros exactos** del generador de etiquetas de Fedix Coins. Si se cambia algo del diseño o de la lógica, actualizar este archivo (y las constantes al principio de `etiquetas.py`).

- Generador: `tools/etiquetas/etiquetas.py` (Python + reportlab)
- Descripciones cortas: `tools/etiquetas/desc_corta.json`
- Tipografías: `tools/etiquetas/fonts/`
- Salida: `tools/etiquetas/salida/` (gitignored)
- Fuente de datos: `items.json` (**sólo lectura**: el generador nunca lo modifica)
- Dependencias: `pip install reportlab`

---

## 1. Concepto

- Cada moneda va en un **sobre plástico con solapa y dos bolsillos**: en uno va la moneda y en el otro el papelito.
- **Regla de oro: sin rótulos.** No dice "PAÍS: Argentina", dice directamente "ARGENTINA". Lo mismo con todos los campos.
- Se imprime tan chico que **tiene que leerse claro una vez impreso**: letra lo más grande posible, sin negrita en los datos y con buen interletrado.
- **El precio tiene que distinguirse del resto**: va abajo a la derecha, grande y en SemiBold, separado por una línea vertical.
- Un **QR** lleva a la ficha de la moneda en la página, para que el comprador vea las fotos y la descripción completa.

## 2. Medidas e impresión

| Parámetro | Valor |
|---|---|
| Tamaño de cada papelito | **4,5 cm de ancho × 4,8 cm de alto** (45 × 48 mm = 127,56 × 136,06 pt), exacto al imprimir |
| Hoja | **A4** (210 × 297 mm = 595,28 × 841,89 pt) |
| Grilla | **4 columnas × 5 filas = 20 papelitos por hoja**, celdas pegadas |
| Bloque de la grilla | 180 × 240 mm, centrado (márgenes de 15 mm a los costados y 28,5 mm arriba y abajo) |
| Por qué 20 y no 24 | 4 × 6 entra en A4 pero deja sólo 4,5 mm arriba y abajo, y muchas impresoras no imprimen tan cerca del borde |
| Borde de cada celda | línea negra de 0,5 pt; es la guía de corte |
| Márgenes internos | 2,6 mm a los costados, 2,4 mm arriba y 2,4 mm abajo |
| Ancho útil del texto | 45 − 2 × 2,6 = 39,8 mm |
| Más de 20 monedas | se agregan páginas al mismo PDF |

**Al imprimir:** "Tamaño real / 100 %", **nunca "Ajustar a página"** (si no, se achica todo y el QR puede dejar de leerse). Medir un papelito con regla y escanear un QR con el celular antes de imprimir todas las hojas.

## 3. Diseño del papelito (de arriba a abajo)

```
        ARGENTINA            ← país (el borde de la celda hace de línea de arriba)
 ─────────────────────       ← línea bajo el país
    20 Centavos 1899         ← valor facial + año (título de la página)
   Libertad de Oudine        ← descripción corta (cursiva)
   840.108 ac. (RARA)        ← tirada (sólo si es < 3 millones)
    KM# 36 (93) · VG         ← referencia + (índice) · estado
         Cu Ni               ← metal
     5 g · Ø 23 mm           ← peso · diámetro (sólo plata)
 ▣▣▣   FEDIX  │ USD
 ▣▣▣   COINS  │  28          ← pie: QR | marca | precio
```

Todo el texto de datos va **centrado** y **alineado arriba**: arranca debajo de la línea del país y no se reparte en el medio del espacio libre. Si sobra lugar, queda abajo, antes del pie.

### 3.1 Pie: QR a la izquierda, marca al medio, precio a la derecha

- Alto del pie: **9,5 mm** (26,9 pt), apoyado en el margen de abajo. Entre el último renglón de datos y el pie quedan al menos 2,5 pt.
- **QR** (abajo a la izquierda): cuadrado de 9,5 mm, sin zona blanca propia (la dan el margen y el aire alrededor).
  - Lleva a `https://fedixcoins.com.ar/item.html?index=N` (N = índice en `items.json`).
  - Corrección de errores nivel L: con esa URL sale en versión 3 (29 × 29 módulos, ≈ 0,33 mm por módulo).
- **Precio** (abajo a la derecha), alineado a la derecha del ancho útil:
  - "USD" chico arriba, tocando el borde de arriba del pie: EB Garamond Medium, 7,4 pt, interletrado 1,4.
  - El número grande abajo, apoyado en el margen de abajo: EB Garamond SemiBold, **24 pt** (entra justo en el alto del pie debajo de "USD", con 2,2 pt de aire), interletrado 0,2. Las cifras de EB Garamond son de caja alta (*lining*), no hay que tocarlas.
  - El precio sale de `price` de items.json, en USD como en la página. Los decimales quedan como en la página ("2.5"); los enteros sin ".0".
  - **Si el número es largo se achica solo** para entrar entre el QR y el borde derecho.
- **Línea vertical**: 0,5 pt, a lo alto de todo el pie, 3,5 pt a la izquierda del bloque del precio.
- **Marca** "FEDIX / COINS" apilada en dos renglones, centrada en el hueco entre el QR y la línea vertical (con 2,5 pt de aire a cada lado) y centrada en el alto del pie: Cormorant Garamond SemiBold (la tipografía de títulos de la página), hasta 10,5 pt, interletrado 1,6; se achica si el hueco es angosto (precios de 3 cifras).
- La marca **"Fedix Coins" no se traduce** (igual que en la página).

### 3.2 País arriba

- **País:** en mayúsculas espaciadas (EB Garamond Medium 11,2 pt, interletrado 1,7), con las mayúsculas a 1,5 pt del margen de arriba. El borde de la celda hace de línea de arriba.
- **Línea:** debajo del país, de todo el ancho útil, 0,4 pt.
- **Aire** país → línea = línea → primer renglón de datos: **5,0 pt**, o **3,6 pt** si el papelito tiene 7 renglones de datos o más.
- País largo:
  1. primero se cierra el interletrado (hasta 0,35);
  2. después se achica la letra;
  3. si ni así entra al 80 % de su tamaño, va en **dos renglones**, cortado de forma pareja y sin dejar " - " colgando.
- El país no se parte por la regla general de renglones de la sección 6.

### 3.3 Datos

| Renglón | Estilo | Fuente / tamaño / interletrado |
|---|---|---|
| Valor facial + año | `titulo` | EB Garamond SemiBold, 13,8 pt, 0,5 |
| Descripción corta | `desc` | EB Garamond Medium Italic, 12,6 pt, 0,4 |
| Tirada, referencia + estado, metal, peso · diámetro | `dato` | EB Garamond Medium, 12,6 pt, 0,45 |

- Interlineado base: **15,8 pt**.
- **Sin negrita** en los datos: Medium es un grosor intermedio, pensado para que no se pierda al imprimir.
- **Tipografía:** EB Garamond para los datos y el precio, Cormorant Garamond para la marca (es la de los títulos de la página). Las dos tienen licencia libre (OFL), vienen del repo `google/fonts` (fuentes variables) y se guardan como instancias estáticas: EB Garamond Medium (500), Medium Italic (500), SemiBold (600); Cormorant Garamond Medium (500) y SemiBold (600).
- Letra más grande posible: la idea es que no sobre luz abajo en un papelito normal.

## 4. Lógica de cada campo (`items.json`)

### 4.1 País — `country`
- En mayúsculas, tal cual items.json ("ARGENTINA", "USA", "URUGUAY").

### 4.2 Valor facial y año — `title`
- Igual que la página (`getItemTitle`): `title`, o si no hay, `denomination` + `year`.
- Si el título no trae el año y `year` es un número, se agrega al final.
- Las comillas rectas pasan a tipográficas: `5 Cents "Buffalo" 1914` → `5 Cents “Buffalo” 1914`.

### 4.3 Descripción corta — `desc_corta.json`
- Va **debajo del valor facial y arriba de la tirada / referencia**.
- Es lo de la descripción de la página, pero **en 1 a 3 palabras**: el tipo o motivo ("Libertad de Oudine", "Walking Liberty", "Eva Perón"), la variante (`variety`: "3 cerrado", "Sin lágrima"), un comentario de la pieza ("Pátina original", "Marca en reverso"), la serie ("Primera serie", "Westward Journey") o la escasez ("Escasa", "Fecha clave").
- **Nada de historia:** si la descripción cuenta historia, se resume o no se pone.
- Algunas combinan dos datos con " · " ("Serie FAO · Sin lágrima").
- La escribe Claude a mano leyendo `description` y `variety`. Vive en `desc_corta.json` (índice → texto), **no en items.json**, y se corrige a mano ahí.
- Si la moneda no tiene descripción corta, el renglón no aparece (el generador lista al final las que no tienen).
- **No repetir el título:** si todas las palabras significativas de la descripción (de más de 3 letras) ya están en el título, no se pone.
- Monedas nuevas: hay que agregarles su descripción corta en el JSON; si no, salen sin ese renglón.

### 4.4 Tirada — `mintage`
- **Sólo si la tirada es menor a 3.000.000.** Si es mayor o no se conoce, no hay renglón.
- Formato:
  - **Menos de 1.000.000:** `450.000 ac. (RARA)` (se abrevia "ac." y se agrega "(RARA)" en la misma línea).
  - **Entre 1.000.000 y 2.999.999:** `1.328.888 acuñadas`.
  - Miles con punto.
- Va debajo de la descripción corta y arriba de la referencia.
- **Si aparece la tirada, se saca de la descripción corta lo que habla de escasez:** "Escasa", "Rara", "Poco vista", "Difícil de ver", "Tirada baja" (y "Muy …"). Lo demás se queda ("Escasa · Año único" → "Año único").
- `mintage` en items.json es un entero (ver CLAUDE.md para las fuentes de verdad de cada país).
- Esta línea nunca se parte en dos renglones: si es larga, se achica.

### 4.5 Referencia, índice y estado — `reference`, índice, `condition`
- Referencia **con numeral**, tal cual items.json: "KM# 110", "KM# 36".
- Después, el **índice de la moneda en items.json entre paréntesis** (el mismo de `item.html?index=N` y del SKU de MercadoLibre): "KM# 36 (93)". Sin referencia queda sólo "(93)".
- El **estado va en la misma línea**, separado por " · ": "KM# 36 (93) · VG".
- Estado = `condition` **en la escala inglesa, como en la página** (AG, G, VG, F, VF, XF, AU, UNC, Proof, SMS, con +).
- "Details" se abrevia: "XF Details" → **"XF det."**.

### 4.6 Metal — `composition`
- Tal cual items.json, como en la página ("Plata 0.900", "Cu Ni", "Bronce de aluminio").
- "Bimetálica (centro de … en anillo de …)" → sólo **"Bimetálica"**.
- Sin metal, el renglón no aparece.

### 4.7 Peso y diámetro — `weight`, `diameter`
- **Sólo en las monedas de plata** (metal que contiene "plata": "Plata 0.900", "Vellón (plata 0.400)").
- Formato: `26,73 g · Ø 38,1 mm`. Separador " · ", decimales con coma y símbolo de diámetro **Ø** (la tipografía no trae ⌀).
- Si sólo hay uno de los dos, va ese; si no hay ninguno, no hay renglón.

### 4.8 Precio — `price`
- En USD, el de la página, en el pie (ver 3.1). Nunca en ARS: el blue cambia y el papel no.

### 4.9 Lo que NO va
- **Stock / cantidad** (`quantity`): no se pone, y se imprime **un papelito por moneda** aunque tenga varias unidades.
- **Costo:** nunca.
- Rótulos de campo.

## 5. Qué monedas entran

- **Disponibles** = no vendidas (sin `sold: true`) y **no catálogos/álbumes** (sin `book: true`).
- Orden: por índice de items.json.
- Modos (desde la raíz del repo):
  - `python tools/etiquetas/etiquetas.py --todas` → todas las disponibles. Sale `salida/etiquetas_todas_AAAA-MM-DD.pdf`.
  - `python tools/etiquetas/etiquetas.py` → las primeras 20 disponibles. Sale `salida/etiquetas_AAAA-MM-DD.pdf`.
  - `python tools/etiquetas/etiquetas.py 93 141 141` → esos índices. Repetir un índice = otra copia. Avisa si un índice no existe (no lo imprime), si está vendido o si es un catálogo (sí lo imprime).
  - `-o ruta.pdf` cambia el archivo de salida.
- Al terminar informa la letra mínima por papelito, avisa los muy cargados (< 8 pt) y lista los índices sin descripción corta.

## 6. Reglas de ajuste (para que todo entre y se lea)

1. **Primero se cierra el interletrado** (hasta 0,35) y **después se achica la letra**, renglón por renglón, hasta que entre en el ancho útil.
2. **Renglón demasiado largo:** si una línea tuviera que achicarse a menos del 82 % de su tamaño, se **parte en dos renglones** por el espacio más parejo, sin dejar " · " o " - " colgando. No se parten ni el país (tiene su propia regla, 3.2) ni la línea de tirada.
3. **Papelito con muchos renglones:** el interlineado baja lo justo para que el último renglón quede por encima del pie, y **la letra baja en la misma proporción**, así no se enciman.
4. Con 7 renglones de datos o más, el aire alrededor del país pasa de 5,0 a 3,6 pt.
5. Verificación: ningún texto puede salirse de su celda ni meterse en el pie, y todos los QR tienen que leerse. Con el catálogo actual (177 disponibles) la letra mínima va de 8,7 a 12,6 pt y los 177 QR se decodifican bien.

## 7. Historial de decisiones (en orden)

1. Base: especificación de etiquetas de otro numismático (papelito de 4,5 × 4,8 cm, sin rótulos, EB Garamond sin negrita, reglas de ajuste, descripción corta, tirada < 3 M con "(RARA)").
2. Adaptación a Fedix Coins: datos de `items.json`, identificador = índice de items.json, estado en escala inglesa como en la página ("Details" → "det."), metal tal cual la página.
3. Precio **abajo a la derecha**, "USD" chico + número grande en SemiBold con línea vertical, para que se distinga del resto.
4. QR a la ficha de la moneda en `fedixcoins.com.ar`, abajo a la izquierda.
5. La marca "FEDIX COINS" iba arriba a lo ancho, pero con el QR en el pie dejaba los papelitos cargados en 6,7 pt: pasó al pie, apilada entre el QR y el precio (mínimo 8,7 pt). El país queda arriba de todo.
6. Hoja **A4** con **20 papelitos (4 × 5)** para no depender del margen mínimo de la impresora.
7. Excluidos los catálogos/álbumes (`book: true`).
