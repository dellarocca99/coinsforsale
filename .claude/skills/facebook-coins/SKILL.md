---
name: facebook-coins
description: Publica monedas de items.json en grupos de numismática de Facebook y en el perfil personal, una publicación por moneda, en tandas curadas por "programa" (variadas, Indian cents, argentinas del s.XIX, premium, etc.). Usar cuando el usuario quiera publicar o promocionar monedas en Facebook. Para publicar, seguir PUBLICAR.md.
---

# Publicación de monedas en Facebook

Arma tandas de publicaciones de monedas de `items.json` y las publica en grupos de Facebook desde la sesión del usuario en Chrome.

## Estado

| Capa | Estado |
|---|---|
| 1. Selección (monedas, grupos, días, tope diario, anti-repetición) | `plan_tanda.py` → `_plan.json` |
| 2. Render del texto | `render_post.py` |
| 3. Publicación en el navegador | Claude in Chrome, siguiendo **[PUBLICAR.md](PUBLICAR.md)**, paso a paso con `siguiente_paso.py` |

Para publicar, **leé `PUBLICAR.md`**: tiene solo el procedimiento y las reglas operativas. Este archivo es el contexto de fondo.

## Antes de cada tanda: dos confirmaciones

1. **Cotización.** `render_post.py` trae el dólar blue venta de `dolarapi.com` — la misma fuente que usa la web ([currency.js](../../../currency.js)), así que el precio del post coincide con el que ve el comprador si entra a fedixcoins.com.ar. Mostrale el valor y que lo confirme. Si quiere otro, `--rate <valor>`.
2. **Línea de eventos.** Preguntá **una vez por tanda** (no por post) si va la línea de entrega en eventos (Coin Show Buenos Aires, Jornadas de Mar del Plata). Si sí, `--eventos`.

## Uso

```bash
python .claude/skills/facebook-coins/render_post.py --index 0 --index 39 --eventos
python .claude/skills/facebook-coins/render_post.py --all --rate 1540
python .claude/skills/facebook-coins/render_post.py --index 39 --grupo paseo-numismatico
```

| Flag | Efecto |
|---|---|
| `--index N` | Índice en `items.json`, repetible |
| `--all` | Todos los disponibles (excluye `sold` y `book`) |
| `--eventos` | Agrega la línea 🤝 de entrega en eventos |
| `--grupo <slug>` | Aplica las reglas del grupo según `groups.json` |
| `--rate <n>` | Cotización fija; evita la llamada de red |

Las fotos del post salen de `item["images"]`, rutas relativas a la raíz del repo. El renderizador no las toca — las consume la capa de publicación.

## El template

```
🪙 {título}
{🏳️ país}  ·  {año}

▪️ Estado / Región / Disponibles / Denominación / Ceca / Peso / Diámetro / Composición / Referencia

💵 ${precio en ARS}

{descripción, si existe}

📍 La pieza se encuentra en Mar del Plata. Envíos a todo el país.
💳 Pago por transferencia bancaria, Mercado Pago o efectivo.
🤝 Se puede coordinar entrega en eventos (...)          ← opcional, se pregunta por tanda
🔗 Más piezas como esta en https://fedixcoins.com.ar    ← se omite donde la promo está prohibida
```

Decisiones fijas: **sin hashtags**, **sin línea de contacto** (ni WhatsApp ni CTA de MD), conservación **solo con el código** (`XF`, `VF+`, `VF Details`), sin traducir.

El renderizador replica la lógica de la web para no contradecirla nunca: título vía `getItemTitle` ([i18n.js:124](../../../i18n.js)), orden y labels del punteo vía el array `specs` ([item.js:116](../../../item.js)), precio vía `formatPrice` + dólar blue ([currency.js](../../../currency.js)). **Si cambia la ficha de la web, hay que reflejarlo acá.**

País y año no van en el punteo: ya están en la línea bajo el título, igual que en el eyebrow de la web.

## Reglas por grupo — `groups.json`

| Campo | Efecto |
|---|---|
| `promo` | `false` quita la línea 🔗 (Paseo y Familia). `null` = sin relevar: no se publica |
| `prefijo` | Primera línea obligatoria (`💰 VENTA` en "y del mundo" y TODO) |
| `moderado` | El post espera aprobación; verificar en `/my_pending_content` |
| `dias_permitidos` | Días en que el grupo acepta publicaciones comerciales ("Numismatica Argentina" sin tilde: viernes a domingo) |
| `pausado` | Un admin congeló el grupo; queda fuera del plan |
| `variante` | Variación de texto del modo individual |
| `_excluidos` | Grupos donde no se publica nunca, con el motivo |

**Regla dura: si el slug no está en `groups.json`, no se publica ahí.** El script corta con error. Un grupo nuevo se releva primero (¿promo? ¿precio? ¿prefijo `[VENDO]`? ¿idioma? ¿formulario de compraventa en vez de composer libre?) y recién después entra al archivo. Nunca asumas `promo: true` por default para un grupo desconocido.

## Riesgo: texto duplicado entre grupos

Sin hashtags, el mismo post iría idéntico a todos los grupos: es el patrón que el antispam de Facebook usa para marcar cuentas.

**Implementado y aprobado:** cada grupo tiene un `variante` fijo en `groups.json` (0–10, asignado a mano). `render()` rota el emoji del título (🪙 ⭐ 🔷 🏵️ 🔎), intercambia Peso/Diámetro y el orden de 📍/💳. Los bits son independientes, así que las variantes 0–19 son todas distintas. **No derivar la variante del slug**: un hash por suma de caracteres dio 6 combinaciones para 11 grupos.

En modo multi-grupo (el default) el texto es uno por compositor, así que lo que varía es el emoji entre una moneda y la siguiente, no entre grupos. Es el costo aceptado de publicar en muchos grupos con un solo compositor; la tanda del 10-09 salió así sin advertencias.

## Datos del catálogo a tener en cuenta

El catálogo cambia seguido (ventas, altas). **Recontá siempre en el momento**, no confíes en números anotados.

- **78 no tienen `title`** y caen al fallback `denomination + year`. Se leen bien, pero **hay repetidos** (cinco "5 Centavos 1898" como piezas distintas). No pongas dos monedas del mismo título en la misma tanda ni en el mismo grupo: parecen post duplicado.
- **La ficha técnica ya está cargada**: 169 de 170 con `reference` (KM#) y 169 con módulo y peso, vía la skill `numista-enrich`. El punteo típico pasó de 3 líneas a 7.
- **Todas tienen descripción**, escrita por tipo de Numista (60 textos para 154 monedas), en español e inglés.
- `composition` está completa en las 170.
- Los ítems con `book: true` son libros, no monedas: `--all` los excluye y un `--index` explícito avisa.

## Metodología que funcionó

Las sesiones del 07 y 09-09 sacaron 5 publicaciones con mucho esfuerzo. La del 10-09 sacó **42 en 10 compositores**, sin advertencias de Facebook. Esto es lo que cambió, en orden de impacto. Cada punto viene de un error concreto; no los saltees.

### 1. Diagnosticar midiendo, no suponiendo

Durante dos sesiones el compositor no abría y se lo atribuyó a un "límite anti-automatización de Facebook que iba en aumento". Era falso, y esa hipótesis llevó a recomendar abandonar la publicación masiva.

La causa real salió de **leer el estado de la pestaña** en vez de reintentar: `visibilityState: "hidden"` y `requestAnimationFrame` pausado. Chrome congela el renderizado de una pestaña cuando la ventana está tapada o la pantalla apagada, y el diálogo de Facebook necesita renderizar para aparecer.

La pista que lo delataba estaba desde antes: **"a mano me abre"**. Si el usuario puede y la automatización no, la variable es el entorno de la automatización, no la cuenta. Ante un bloqueo, buscar la señal medible que separe las hipótesis antes de concluir.

### 2. Guard de visibilidad antes de cada acción

Nunca clicar ni tipear sin comprobar pestaña visible y rAF funcionando (código en `PUBLICAR.md`). En la tanda del 10-09 la pantalla se apagó dos veces y el guard frenó las dos, sin tipear a ciegas. Antes de tenerlo, el texto de un post terminó escrito dos veces sobre la página vacía.

Setup: Chrome lado a lado con la app de Claude y la pantalla sin apagarse mientras dure la tanda.

### 3. Verificar cada transición antes de la siguiente acción

Un lote de acciones del navegador no se detiene si un paso intermedio falla: sigue ejecutando. Por eso cada acción que depende de la anterior se verifica en su propia llamada:

- el diálogo existe y el contenteditable tiene el foco **antes** de tipear;
- el diálogo tiene tantas fotos como se subieron **antes** de agregar grupos;
- los tildados coinciden exactamente con el plan (`extras` y `faltan` vacíos) **antes** de "Listo";
- lista para compartir, fotos y texto correctos **antes** de "Publicar";
- el diálogo se cerró o vació **antes** de registrar.

### 4. Medir coordenadas en el momento y esperar a que el layout se quede quieto

Los clics fallaban por coordenadas viejas: la portada del grupo carga tarde y baja el compositor, y en una ocasión la página había quedado scrolleada. Ahora: `scrollTo(0,0)`, medir el rect hasta que dos lecturas coincidan, y clicar. El botón "Publicar" se mide recién después de cargar las fotos, porque el diálogo crece.

### 5. Fotos primero, grupos después

"Agregar grupos" permite un compositor para hasta 9 grupos, pero **oculta el botón de fotos al agregar el primero**. Una prueba hecha en el orden inverso llevó a concluir que el multi-grupo no servía con fotos. El usuario insistió en que se podía, y tenía razón: si las fotos ya están cargadas, se conservan y llegan a todos los grupos (verificado en un post pendiente de TODO NUMISMÁTICA con sus 2 fotos).

Esto es lo que hace masiva la publicación: 42 posts salieron de 10 compositores en vez de 42.

### 6. Grupos homónimos: por URL, nunca por la lista

"Agregar grupos" identifica los grupos **solo por nombre**, y hay tres "Numismática/Numismatica Argentina" con reglas distintas (uno moderado, uno solo viernes a domingo, uno pausado). `plan_tanda.py` hace base de su propio compositor a todo grupo de nombre repetido y lo abre por su URL; nunca lo tilda desde la lista. En la tanda llegó a tildarse el de "solo fin de semana" un jueves: se detectó al leer los tildados y se quitó antes de escribir el texto.

Lección aparte: los slugs de `groups.json` se habían armado por cantidad de miembros, y eso confundió cuál grupo tenía la regla de días. Hoy son `numismatica-argentina-con-tilde` / `-sin-tilde`. **Identificar grupos por algo inequívoco** (URL, nombre exacto), no por atributos que cambian.

### 7. El plan decide, el ejecutor ejecuta

Todas las reglas (días, pausados, tope diario, promo, prefijo, homónimos, anti-repetición contra `_posted.json`) se aplican en `plan_tanda.py`, antes de tocar el navegador. Durante la ejecución no se decide nada nuevo: si el usuario corrige una regla en medio de la tanda, se anota en `groups.json` y **se regenera el plan**, que ya descuenta lo publicado.

### 8. Registrar después de cada paso

`siguiente_paso.py --hecho K` escribe `_posted.json` antes de mostrar el paso siguiente. Las dos interrupciones por pantalla apagada se retomaron exactamente en el paso pendiente, sin duplicar ni saltear nada.

### 9. Leer más, capturar menos

JavaScript para leer estado (diálogo, tildados, fotos, visibilidad), `find` solo para obtener la referencia del `input[type=file]`, y capturas de pantalla solo cuando algo no cierra. Las capturas son lentas y dan timeout con la pestaña congelada, justamente cuando más confunden.

### 10. Verificar el resultado en Facebook, no en el registro

`/my_posted_content` y `/my_pending_content` de cada grupo dan contadores exactos. Así apareció que RED retiene algunos posts en revisión aunque no esté marcado como moderado, y que el grupo con tilde aprobó los cinco del día.

### 11. Relevar reglas en la fuente correcta y anotarlas enseguida

Las reglas formales están en `/about` → "Reglas de los administradores del grupo"; los posts destacados son secundarios. Lo que aporta el usuario (días permitidos, promo prohibida, grupos de solo estudio) se escribe en `groups.json` **en el momento**: una regla de días quedó una sesión sin anotar y después se la asignó al grupo equivocado.

### Qué no hacer

- Concluir "límite de la plataforma" sin una medición que lo pruebe.
- Reintentar en bucle sobre algo que falla en silencio.
- Tipear o clicar sin verificar el estado previo.
- Agregar grupos antes de subir las fotos.
- Tildar grupos homónimos desde la lista.
- Derivar la variante de texto de un hash del slug (dio 6 combinaciones para 11 grupos).

## Notas

- `items.json` vive en OneDrive y **puede cambiar entre lecturas**. Releé los conteos en el momento en vez de confiar en números de una conversación previa.
- `_rate.json` es cache local de la cotización (gitignored, con el mismo corte de las 04:00 que usa `currency.js`). `render_post.py` está cubierto por el `*.py` del `.gitignore`, igual que el script de la skill de MercadoLibre.
- Como el post lleva fotos adjuntas, Facebook lo trata como post de fotos y deja la URL de la línea 🔗 como texto plano, sin tarjeta de preview: no se convierte en "link post".
