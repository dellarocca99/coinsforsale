---
name: facebook-coins
description: Publica monedas de items.json en grupos de numismática de Facebook y en el perfil personal, una publicación por moneda, en tandas curadas por "programa" (variadas, Indian cents, argentinas del s.XIX, premium, etc.). Usar cuando el usuario quiera publicar o promocionar monedas en Facebook. ESTADO - la capa de render está lista; la capa de publicación todavía no está implementada.
---

# Publicación de monedas en Facebook

Renderiza el texto de venta de una moneda de `items.json` y (a futuro) lo publica en Facebook.

## Estado

| Capa | Estado |
|---|---|
| 1. Selección (programas, tope diario, anti-repetición) | **pendiente** |
| 2. Render del texto | **listo** — `render_post.py` |
| 3. Publicación en el navegador | **pendiente** — bloqueada hasta relevar los grupos |

Mientras 1 y 3 no existan, esta skill sirve para generar el texto y que el usuario lo pegue a mano. **No inventes la capa de publicación sobre la marcha**: si el usuario pide publicar, decíselo y ofrecé el relevamiento de grupos como paso previo.

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

Sin hashtags, el post va carácter por carácter idéntico a todos los grupos que comparten el mismo valor de `promo`. Es el patrón que el antispam de Facebook usa para marcar cuentas, y lo que está en juego es la cuenta personal del usuario, no un post.

Mitigación propuesta pero **no aprobada todavía**: rotar el emoji de apertura (🪙 / 💰 / ⭐) y alternar el orden de las líneas 📍 y 💳 según el grupo. No la implementes sin confirmarlo.

Mientras tanto: espaciar las publicaciones y respetar el **tope de 5 posts por grupo por día**.

## Datos del catálogo a tener en cuenta

Al momento de escribir esto, 170 disponibles (230 totales − 55 vendidas − 5 libros). **Recontá siempre**: el archivo cambia solo.

- **78 no tienen `title`** y caen al fallback `denomination + year`. Se leen bien, pero **hay repetidos** (cinco "5 Centavos 1898" como piezas distintas). No pongas dos monedas del mismo título en la misma tanda ni en el mismo grupo: parecen post duplicado.
- **La ficha técnica ya está cargada**: 169 de 170 con `reference` (KM#) y 169 con módulo y peso, vía la skill `numista-enrich`. El punteo típico pasó de 3 líneas a 7.
- **154 siguen sin descripción.** Es lo único que le falta al post para estar completo; escribirlas y guardarlas en `items.json` mejora también la web.
- `composition` está completa en las 170.
- Los ítems con `book: true` son libros, no monedas: `--all` los excluye y un `--index` explícito avisa.

## Notas

- `items.json` vive en OneDrive y **puede cambiar entre lecturas**. Releé los conteos en el momento en vez de confiar en números de una conversación previa.
- `_rate.json` es cache local de la cotización (gitignored, con el mismo corte de las 04:00 que usa `currency.js`). `render_post.py` está cubierto por el `*.py` del `.gitignore`, igual que el script de la skill de MercadoLibre.
- Como el post lleva fotos adjuntas, Facebook lo trata como post de fotos y deja la URL de la línea 🔗 como texto plano, sin tarjeta de preview: no se convierte en "link post".
