# PUBLICAR — procedimiento operativo

Solo reglas consolidadas. El porqué de cada regla está en `SKILL.md` → "Metodología que funcionó".

## Antes de empezar

1. **Chrome visible toda la tanda:** lado a lado con la app de Claude, y la pantalla sin apagarse (subir el apagado de pantalla en la configuración de energía de Windows si el usuario se va a alejar). Tapado o con la pantalla apagada, Chrome congela la pestaña.
2. `python .claude/skills/facebook-coins/plan_tanda.py --eventos` → escribe `_plan.json`. Confirmar antes cotización y línea de eventos.
3. Mostrarle la tanda al usuario (monedas, grupos, cantidad). **Un OK explícito autoriza esa tanda**; sin OK no se publica.
4. `python .claude/skills/facebook-coins/siguiente_paso.py --ver 1`

## Guard — antes de cada acción en el navegador

```js
const raf = await Promise.race([
  new Promise(r => requestAnimationFrame(() => r(true))),
  new Promise(r => setTimeout(() => r(false), 1500))]);
({ ok: document.visibilityState === 'visible' && raf })
```

`ok: false` → **frenar** y avisar al usuario. Nunca clicar ni tipear con la pestaña oculta.

## Por cada paso

Cada punto se **verifica antes de pasar al siguiente**. Si la verificación falla, no se avanza.

1. Navegar a `URL` (siempre la URL, nunca menús). Esperar ~6 s.
2. Guard + `scrollTo(0,0)` + medir el centro de "Escribe algo…" **hasta que dos mediciones seguidas coincidan** (la portada mueve el layout al cargar). Clicar ahí.
3. Verificar `div[role=dialog]` con "Crear publicación" y un `div[contenteditable]`. Enfocar el contenteditable por JS y confirmar que es `document.activeElement`.
4. Tipear `TEXTO`. Si aparece la tarjeta de vista previa del link, ignorarla: las fotos la reemplazan.
5. `find` del `input[type=file]` **del diálogo** (no el de comentarios) → `file_upload` con `FOTOS`. Nunca clicar el botón de foto. Esperar ~6 s y verificar que el diálogo tenga tantas imágenes como fotos.
6. **Recién ahora** "Agregar grupos". Al agregar un grupo Facebook oculta el botón de fotos, pero conserva las ya cargadas.
7. En el panel, tildar cada nombre de `AGREGAR` por **nombre exacto** (primer renglón de la fila) con `checkbox.click()` por JS. Leer de vuelta los tildados: `extras` y `faltan` tienen que dar vacío. Recién ahí "Listo".
8. Verificar en el compositor: cantidad de grupos en "lista para compartir" = `AGREGAR`, fotos presentes, texto intacto (y sin 🔗 si el perfil es sin promo). Medir "Publicar" en ese momento y clicar.
9. Esperar ~15 s. Confirmación: el diálogo se cerró o se vació. Buscar textos de advertencia.
10. `siguiente_paso.py --hecho K` → registra y muestra el paso siguiente.

No hace falta pausa adicional: el procedimiento tarda 2–3 min por compositor, y a ese ritmo salieron 42 publicaciones sin advertencias.

## Cortes

| Situación | Acción |
|---|---|
| Guard falla | Pausar, avisar, retomar desde el mismo paso cuando vuelva |
| 2 fallas seguidas **con la pestaña visible** | Frenar y reportar |
| Texto de advertencia, checkpoint, "actividad inusual" | Frenar y reportar |
| Un tildado de más en "Agregar grupos" | Destildar antes de "Listo"; si ya se cerró, quitarlo desde "lista para compartir" |
| El usuario corrige una regla de grupo en medio de la tanda | Anotarla en `groups.json` y regenerar el plan antes del paso siguiente |

## Verificación final

- `<url del grupo>/my_posted_content` y `/my_pending_content` muestran "Publicadas · N" y "Pendientes · N". Es más confiable que el feed (carga por partes) y que la búsqueda (tarda en indexar).
- Grupos moderados: los posts aparecen en pendientes hasta la aprobación.
- `_plan.json` y `_posted.json` están gitignoreados.
