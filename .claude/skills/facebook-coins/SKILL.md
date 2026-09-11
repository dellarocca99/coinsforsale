---
name: facebook-coins
description: Publica monedas de items.json en grupos de numismática de Facebook y en el perfil personal, una publicación por moneda, en tandas curadas por "programa" (variadas, Indian cents, argentinas del s.XIX, premium, etc.). Usar cuando el usuario quiera publicar o promocionar monedas en Facebook. Para publicar, seguir PUBLICAR.md.
---

# Publicación de monedas en Facebook

Renderiza el texto de venta de una moneda de `items.json` y (a futuro) lo publica en Facebook.

## Estado

| Capa | Estado |
|---|---|
| 1. Selección (monedas, grupos, tope diario, anti-repetición) | `plan_tanda.py` → `_plan.json` |
| 2. Render del texto | `render_post.py` |
| 3. Publicación en el navegador | Claude in Chrome, siguiendo **[PUBLICAR.md](PUBLICAR.md)** |

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

```json
{ "paseo-numismatico": { "nombre": "Paseo Numismático", "url": null, "promo": false } }
```

`promo: false` quita la línea 🔗. Paseo Numismático y Familia Numismática la tienen prohibida.

**Regla dura: si el slug no está en `groups.json`, no se publica ahí.** El script corta con error. Un grupo nuevo se releva primero (¿promo? ¿precio? ¿prefijo `[VENDO]`? ¿idioma? ¿formulario de compraventa en vez de composer libre?) y recién después entra al archivo. Nunca asumas `promo: true` por default para un grupo desconocido.

## Riesgo: texto duplicado entre grupos

Sin hashtags, el mismo post iría idéntico a todos los grupos: es el patrón que el antispam de Facebook usa para marcar cuentas.

**Implementado y aprobado:** cada grupo tiene un `variante` fijo en `groups.json` (0–10, asignado a mano). `render()` rota el emoji del título (🪙 ⭐ 🔷 🏵️ 🔎), intercambia Peso/Diámetro y el orden de 📍/💳. Los bits son independientes, así que las variantes 0–19 son todas distintas. **No derivar la variante del slug**: un hash por suma de caracteres dio 6 combinaciones para 11 grupos.

En modo multi-grupo el texto es uno por compositor, así que la variación por grupo se pierde dentro de cada perfil. Es el costo aceptado de publicar en muchos grupos con un solo compositor.

## Datos del catálogo a tener en cuenta

Al momento de escribir esto, 170 disponibles (230 totales − 55 vendidas − 5 libros). **Recontá siempre**: el archivo cambia solo.

- **78 no tienen `title`** y caen al fallback `denomination + year`. Se leen bien, pero **hay repetidos** (cinco "5 Centavos 1898" como piezas distintas). No pongas dos monedas del mismo título en la misma tanda ni en el mismo grupo: parecen post duplicado.
- **La ficha técnica ya está cargada**: 169 de 170 con `reference` (KM#) y 169 con módulo y peso, vía la skill `numista-enrich`. El punteo típico pasó de 3 líneas a 7.
- **Todas tienen descripción**, escrita por tipo de Numista (60 textos para 154 monedas), en español e inglés.
- `composition` está completa en las 170.
- Los ítems con `book: true` son libros, no monedas: `--all` los excluye y un `--index` explícito avisa.

## Lo que parecía un límite de Facebook no lo era

En las sesiones del 07 y 09-09 el compositor dejó de abrir y se atribuyó a un límite anti-automatización de Facebook "que iba en aumento". **Era incorrecto.** Verificado el 10-09 leyendo la pestaña: `visibilityState: "hidden"`, `hasFocus: false`, `requestAnimationFrame` pausado.

La ventana de Chrome quedaba tapada por la app de Claude, Windows la marcaba como ocluida y **Chrome congelaba el renderizado**. El diálogo de Facebook necesita renderizar para aparecer, así que no aparecía. Explica todo: el compositor mudo, las capturas con timeout "renderer frozen", que a veces sí anduviera, y que a mano funcionara (el usuario traía Chrome al frente).

La regla que sale de acá está en `PUBLICAR.md`: **chequear visibilidad antes de cada acción** y nunca actuar con la pestaña oculta.

Lo que sigue siendo cierto: Meta no publica umbrales antispam, y la API de grupos no existe desde abril de 2024.

## Notas

- `items.json` vive en OneDrive y **puede cambiar entre lecturas**. Releé los conteos en el momento en vez de confiar en números de una conversación previa.
- `_rate.json` es cache local de la cotización (gitignored, con el mismo corte de las 04:00 que usa `currency.js`). `render_post.py` está cubierto por el `*.py` del `.gitignore`, igual que el script de la skill de MercadoLibre.
- Como el post lleva fotos adjuntas, Facebook lo trata como post de fotos y deja la URL de la línea 🔗 como texto plano, sin tarjeta de preview: no se convierte en "link post".
