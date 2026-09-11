# PUBLICAR — procedimiento operativo

Solo reglas consolidadas. El contexto de fondo está en `SKILL.md`.

## Antes de empezar

1. **Chrome lado a lado con la app de Claude**, visible toda la tanda. Si queda tapado, Chrome congela la pestaña y el compositor no abre.
2. `python .claude/skills/facebook-coins/plan_tanda.py` → escribe `_plan.json` y muestra la tanda.
3. Mostrarle la tanda completa al usuario (moneda, texto, grupos). **Un OK explícito autoriza esa tanda**; sin OK no se publica.

## Guard — antes de CADA acción en el navegador

```js
const raf = await Promise.race([
  new Promise(r => requestAnimationFrame(() => r(true))),
  new Promise(r => setTimeout(() => r(false), 1500))]);
({ ok: document.visibilityState === 'visible' && raf })
```

`ok: false` → **frenar** y pedirle al usuario que traiga Chrome al frente. Nunca clicar ni tipear con la pestaña oculta: el texto termina escrito sobre la página.

## Por cada paso del plan

1. Navegar a la URL del grupo. Esperar a que cargue la portada (mueve el layout).
2. Guard.
3. Abrir el compositor: medir el rect de "Escribe algo…", convertir `x_captura = x_css * ancho_captura / innerWidth`, y clicar. Alternativa: foco por JS + Enter.
4. Verificar que existe `div[role=dialog]` con "Crear publicación". Si no → reintentar una vez.
5. Foco en el `div[contenteditable]` del diálogo y tipear `texto` tal cual. Si aparece una tarjeta de vista previa del link, no importa: las fotos la reemplazan.
6. `file_upload` sobre el `input[type=file]` del diálogo con `fotos`. **Nunca clicar el botón de foto**: abre el selector nativo.
7. **Recién ahora**, "Agregar grupos" → tildar los nombres de `agregar` → "Listo". **El orden importa:** al agregar un grupo Facebook oculta el botón de fotos, pero conserva las ya cargadas. Si agregás grupos antes de las fotos, no hay forma de adjuntarlas.
   - Tildar por **nombre exacto** (primer renglón de la fila). Leer de vuelta los tildados antes de "Listo": tienen que ser exactamente `agregar`, ni uno más.
   - La lista incluye grupos no relevados y homónimos. Nunca tildar algo que no esté en `agregar`.
8. Verificar: cabecera "+ N grupos", fotos en el diálogo, texto intacto. Medir "Publicar" (se mueve cuando crece el diálogo) y clicar.
9. **El diálogo se cierra o se vacía.** Esa es la confirmación.
10. Registrar en `_posted.json`: `grupo → {índice: fecha}` por cada destino. Después de cada paso, no al final.
11. Pausa de 60–90 s antes del siguiente paso.

## Cortes

| Situación | Acción |
|---|---|
| Guard falla | Pausar, pedir Chrome al frente, retomar |
| 2 fallas seguidas **con la pestaña visible** | Frenar y reportar: ahí sí es algo de Facebook |
| Texto de advertencia, checkpoint, "actividad inusual" | Frenar y reportar |
| Día no permitido (`dias_permitidos`) | El plan ya excluye el grupo |

## Datos útiles

- Verificar en el feed del grupo, no en la búsqueda: la búsqueda tarda en indexar.
- En grupos **moderados** el post no aparece en el feed: está en `<url del grupo>/my_pending_content`.
- Las referencias de `find` se invalidan al navegar. Buscar de nuevo antes de usarlas.
- Tildar por JavaScript (`checkbox.click()` sobre el `input[type=checkbox]` de la fila) funciona y React lo registra. Igual verificar después de "Listo" que la lista para compartir tenga exactamente `agregar`.
- **Verificación final por grupo:** `<url del grupo>/my_posted_content` y `/my_pending_content` muestran contadores "Publicadas · N" y "Pendientes · N". Es más confiable que el feed, que carga de a pedazos.
- Tanda del 10-09: 42 publicaciones en 10 compositores, sin advertencias. Las dos pausas fueron por la pantalla apagada (el guard las atajó).
- `_plan.json` y `_posted.json` están gitignoreados.
