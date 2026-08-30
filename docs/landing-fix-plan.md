# Plan de arreglo — Landing page (`/landing`)

Auditoría contra el código real de la app: `app/globals.css`, `components/ui/button.tsx`,
`lib/i18n/dictionaries.ts`, `lib/types.ts`, `lib/nav-items.ts`, `lib/model-catalog.ts`,
`agent/tools/*`, y las páginas `app/dashboard`, `app/inbox`, `app/ads`, `app/automations`.

Referencia estética: linear.app — rail angosto, tipografía sans apretada, jerarquía por
hairlines y contraste, cero decoración inventada.

---

## Resumen

| # | Área | Estado | Severidad |
|---|------|--------|-----------|
| A | Tokens de color | Paleta azulada inventada, no es la de la app | Alta |
| B | Tipografía | Serif Cooper que no existe en el producto | Alta |
| C | Botones | `rounded-full` contra `rounded-[13px]` de la app | Alta |
| D | Navbar | Links incompletos, animación rota, sin foco | Media |
| E | Animaciones | Blur en 45 nodos, float infinito, 760 ms | Media |
| F | Contenido inventado | Tabs, títulos, tools y KPIs que no existen | Alta |
| G | Secciones faltantes | Precios, Términos, Privacidad, FAQ | Alta |
| H | Infra / SEO | Sin robots, sitemap, OG, `lang` mal puesto | Media |

---

## A. Tokens de color — la landing no usa la paleta de la app

**Evidencia.** La app en oscuro es neutro puro (croma `0`):

```css
/* app/globals.css:218 — .dark */
--background: oklch(0.155 0 0);   /* #161616 */
--card:       oklch(0.18  0 0);
--muted:      oklch(0.21  0 0);
--muted-foreground: oklch(0.58 0 0);
```

La landing inventa una escala **azulada** (croma 0.003–0.015, hue 246–275):

```css
/* app/globals.css:2071 — .lp */
--background: oklch(0.139 0.003 246);
--card:       oklch(0.177 0.004 264);
--muted-foreground: oklch(0.649 0.015 262);
--lp-text-3:  oklch(0.649 0.015 262);
--lp-text-4:  oklch(0.509 0.012 262);
```

Y `.lp-screen` (el "screenshot" de la app) inventa **otra tercera escala**, más clara que
la app real y también azulada:

```css
/* app/globals.css:2232 — .lp-screen */
--background: oklch(0.205 0.004 264);  /* la app real es 0.155 */
--card:       oklch(0.238 0.005 268);  /* la app real es 0.18  */
```

Verificado en runtime: el `background-color` computado del mockup es `lab(7.765%)`
= `oklch(0.205)`, no `oklch(0.155)` de la app.

Además el glow del hero usa **índigo** (`oklch(0.62 0.13 275)`), un acento que la app no
tiene en ningún lado — su `--primary` es neutro (blanco en oscuro, negro en claro).

### Arreglo

1. **Borrar el bloque `.lp-screen` entero.** El mockup debe heredar `.dark` tal cual. Si un
   screenshot necesita separarse del fondo, se separa con el `box-shadow` y el bezel del
   `.lp-frame`, no cambiando la paleta del producto.
2. **Reescribir `.lp`** para que sea `.dark` con croma `0`. Si se quiere la página un punto
   más profunda que el chrome, bajar solo `--background` a `oklch(0.125 0 0)` y dejar
   `--card`, `--muted`, `--muted-foreground`, `--border` idénticos a `.dark`.
3. **Eliminar `--lp-text-3` / `--lp-text-4`.** Reemplazar los ~30 usos por
   `text-muted-foreground` (= `oklch(0.58 0 0)`) y `text-muted-foreground/70`.
4. **`.lp-glow`**: neutro, no índigo. `oklch(0.85 0 0 / 0.06)` como halo blanco difuso, o
   quitarlo. Un acento de color que no aparece en el producto es marca inventada.
5. **`--lp-hairline` / `--lp-hairline-strong`**: alinear con `--border` de la app
   (`oklch(1 0 0 / 0.1)`) en vez de `0.07` / `0.14`.

**Archivos:** `app/globals.css:2071-2110`, `app/globals.css:2232-2255`, y los usos de
`var(--lp-text-*)` en los 6 componentes de `app/landing/_components/`.

---

## B. Tipografía — el serif no existe en el producto

**Evidencia.** Cooper Lt BT se carga solo para la landing (`app/globals.css:29`) y todos
los `h1`/`h2` de la landing lo usan (`font-cooper`). La app usa **Saans**:

```css
/* app/globals.css:361 */
h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading); }  /* = Saans */
```

Y todos los títulos de página de la app son `text-2xl font-semibold` en Saans
(`app/dashboard/page.tsx:116`, `app/inbox/page.tsx:317`, `app/ads/page.tsx:283`, …).

### Arreglo

1. Reemplazar `font-cooper` por `font-heading` en los 6 títulos de la landing
   (`landing-hero.tsx:44`, `primitives.tsx:84`, `landing-sections.tsx:111`, `:470`).
2. Ajustar la escala: Saans aguanta más peso, así que
   `font-semibold tracking-[-0.03em] leading-[1.02]` en vez de `tracking-[-0.02em] leading-[1.05]`.
3. Quitar los dos `@font-face` de Cooper y los `.woff2` de `public/fonts/cooper/`
   (~80 KB menos y una fuente menos en el critical path).
4. Mantener `--font-mono` (Geist Mono) para `lp-eyebrow` — eso sí lo usa la app
   (`flow-canvas.tsx` usa mono para las categorías de nodo).

---

## C. Botones — `rounded-full` contra el sistema de la app

**Evidencia.** El `Button` de la app es una squircle, nunca una píldora:

```ts
// components/ui/button.tsx:22
"... rounded-[13px] ..."
// size: sm → rounded-[11px], lg → rounded-[14px], xs → rounded-[9px]
```

La landing lo pisa en 5 lugares:

| Archivo | Línea | Qué |
|---|---|---|
| `landing-header.tsx` | 74 | CTA "Empezar" → `rounded-full px-4` |
| `landing-hero.tsx` | 35 | badge "Nuevo" → `lp-tile rounded-full` |
| `landing-hero.tsx` | 37 | chip "Nuevo" → `rounded-full` |
| `landing-hero.tsx` | 60, 63 | CTAs "Empezar" / "Ver el panel" → `rounded-full px-6` |
| `landing-sections.tsx` | 483, 489 | CTAs del prefooter, **botón reimplementado a mano** con `var(--btn-*)` en vez de usar `<Button>` |

### Arreglo

1. Sacar todos los `rounded-full` de CTAs y badges. `<Button asChild size="lg">` ya trae el
   radio correcto — no pasarle `className` de radio.
2. `landing-sections.tsx:481-493`: borrar los dos `<a>` con estilos crudos y usar
   `<Button asChild size="lg">` / `<Button asChild size="lg" variant="outline">`, igual que
   el hero. Un botón reimplementado a mano es exactamente lo que se desincroniza.
3. Badge del hero: usar `<Badge variant="secondary">` de `components/ui/badge.tsx`, no un
   `lp-tile` con forma de píldora.

**Lo que SÍ debe quedar redondo** (porque la app lo hace):
`SlidingTabs` (`.t-tabs { border-radius: 48px }`), la burbuja de usuario del chat
(`message.tsx:53`), el botón de enviar del composer (`prompt-input.tsx:1245`), y las barras
de progreso del panel. Esos están bien en `app-screens.tsx`.

4. `.lp-tile:hover { translate: 0 -2px }` → fuera. La `Card` de la app hace
   `hover:shadow-[var(--shadow-elevated)] hover:border-input` (`dashboard-card.tsx:22`),
   sin levantarse. Copiar ese hover.

---

## D. Navbar — rehacer

**Problemas encontrados** (`landing-header.tsx`):

1. **Links incompletos.** `LINKS` tiene 4 entradas (Bandeja, Automatizaciones, Agentes,
   Autoalojado) pero la página tiene 6 secciones con `id`. `#ads` queda huérfano.
2. **Animación del menú móvil rota.** Usa `.t-dropdown`, que es una clase de Radix:
   ```css
   /* app/globals.css:471 */
   .t-dropdown { transform-origin: var(--radix-select-content-transform-origin); }
   .t-dropdown[data-state="closed"] { animation: dropdown-out ...; }
   ```
   El menú no es Radix: la variable no existe (el `transform-origin` cae a `center`) y
   `[data-state="closed"]` nunca se aplica, así que el menú **cierra de golpe, sin salida**.
3. **"Abrir la app" del menú móvil no cierra el menú** (le falta el `onClick` que sí tienen
   los demás links, línea 105).
4. **Sin `:focus-visible`** en `.lp-navlink` — solo hay `:hover`. Navegando por teclado no
   se ve dónde estás.
5. **Sin sección activa.** No hay scroll-spy ni `aria-current`.
6. **Offset inconsistente**: el header mide 64 px (`.lp-header { height: 64px }`) pero las
   secciones usan `scroll-mt-20` (80 px). El ancla queda 16 px corrida.
7. **Estética**: `gap-7` entre links sueltos sobre fondo transparente se lee flaco.

### Arreglo (patrón Linear)

- Wordmark a la izquierda, nav **centrada** con `absolute left-1/2 -translate-x-1/2`,
  acciones a la derecha. Eso es lo que le da el equilibrio que hoy no tiene.
- Links a `13px`, `gap-6`, `text-muted-foreground` → `text-foreground` en hover, con una
  barra activa de 1 px debajo del link de la sección visible.
- Agregar `Precios` a `LINKS` y `#ads` (o quitarle el `id` a la sección de Ads si no va al
  nav — pero decidirlo, no dejarlo huérfano).
- Menú móvil: animación propia (`@keyframes lp-menu-in/out`) o un `<Popover>` de Radix real.
  No reusar `.t-dropdown`.
- `scroll-mt-16` en todas las secciones, o subir el header a 80 px. Uno de los dos.
- `.lp-navlink:focus-visible { outline: 2px solid var(--ring); outline-offset: 4px; }`.
- Scroll-spy con un segundo `IntersectionObserver` en `useReveal` (o un hook nuevo
  `useActiveSection`), sin `setState` por frame.

---

## E. Animaciones — las tres que están mal

### E1. El blur del reveal

```css
/* app/globals.css:2131 */
.lp [data-reveal] { opacity: 0; translate: 0 18px; filter: blur(4px); ... }
```

`filter: blur()` sobre ~45 nodos, animado, con `will-change: opacity, translate, filter`.
Es el efecto más caro de la página, crea containing block en cada wrapper, y el texto
desenfocado que entra en foco es el tell visual de landing generada.

**Arreglo:** sacar `filter` del reveal y del `will-change`. Dejar `opacity` + `translate`.

### E2. La duración

`--lp-reveal-dur: 760ms` con `cubic-bezier(0.16, 1, 0.3, 1)`. Scrolleando normal, los
elementos llegan tarde. Linear usa ~300–400 ms.

**Arreglo:** `--lp-reveal-dur: 420ms`, stagger de `60ms` (hoy hay delays de 480–640 ms en
los overlays, que llegan casi un segundo después del screenshot).

### E3. El float infinito

```css
/* app/globals.css:2309 */
@keyframes lp-float { 0%,100% { translate: 0 0 } 50% { translate: 0 -6px } }
.lp-overlay.is-in.lp-float { animation: lp-float 7s infinite; }
```

Dos problemas: (a) la animación y la transición del reveal **pelean por la misma
propiedad** (`translate`), y (b) corre para siempre — trabajo de compositor permanente
mientras la pestaña esté abierta, en 6 tarjetas.

**Arreglo:** eliminar `lp-float`. Si se quiere movimiento, que sea parallax ligado al scroll
con `transform: translateY(calc(var(--scroll) * -0.02))`, o nada. Las tarjetas flotando
solas no las hace Linear ni la app.

### E4. Otros

- `will-change` en 45 nodos al cargar. Aplicarlo solo cuando el elemento está por entrar
  (o directamente sacarlo — con `opacity`+`translate` el navegador ya promueve).
- Marquee de canales: `38s` para 6 items es lento; a `28s` respira. Pausa en hover ya está.
- `prefers-reduced-motion` está bien cubierto (`app/globals.css:2394-2403`). Mantenerlo.

---

## F. Contenido inventado — lo que la app no tiene

### F1. Tab que no existe

`app-screens.tsx:745` dibuja tres tabs: **Campañas · Leads · Métricas**.
La página real tiene dos:

```ts
// app/ads/page.tsx:87
type Tab = "campaigns" | "leads";
```

**Arreglo:** borrar "Métricas".

### F2. Títulos y subtítulos que no coinciden con el diccionario

| Pantalla | Landing dice | `dictionaries.es` dice |
|---|---|---|
| Inbox | "Bandeja" / "Contactos que esperan una respuesta humana" | **"Inbox humano"** / **"Handoffs y follow-ups que el bot no debe seguir solo"** |
| Ads | "Campañas, leads y coste por lead" | **"Campañas, métricas y leads de Meta Marketing"** |
| Automatizaciones | "Flujos que responden por vos" | **"Respuestas automáticas y flujos programados"** |
| KPI 4 del panel | "Mensajes por chat" | **"Promedio por conversación"** |
| KPI 1 sub | "18 activas ahora" | **"18 activas en la última hora"** |
| KPI 2 sub | "WhatsApp 62%" | **"WhatsApp concentra el 62%"** |
| KPI 3 sub | "7 automatizaciones activas" | **"de 7 automatizaciones activas"** |
| Card Canales | "Reparto por canal" | **"Distribución por canal"** |

**Arreglo:** el archivo ya tiene el helper `es()` (`app-screens.tsx:71`) y lo usa para el
sidebar. Pasar **todos** los strings de las pantallas por `es("clave")`. Así el mockup no
puede volver a desincronizarse: si cambia el diccionario, cambia el screenshot.

### F3. Tools inventadas

La landing muestra `listar_contactos`, `buscar_conocimiento`, `guardar_conocimiento`
(`app-screens.tsx:648,649,672`) y `crear_automatizacion`, `agregar_paso`
(`landing-sections.tsx:274-279`).

Las tools reales (`agent/tools/`) son en inglés snake_case:
`search_knowledge`, `upsert_contact`, `update_contact`, `transfer_human`,
`list_automations`, `propose_automation`, `propose_automation_update`, `reminder`,
`calendar`, `web_search`, `web_fetch`, `http_request`, `run_python`, `bash`,
`generate_media`, `send_media`, `agent`.

**No existe ninguna tool que escriba conocimiento**, así que la conversación del mockup
("Escribí la política de devoluciones y cargala" → `guardar_conocimiento`) muestra algo
que el producto no hace.

**Arreglo:** reescribir esa conversación con tools reales. Propuesta:
`list_automations` → `search_knowledge` → `transfer_human`, con una respuesta que cuente
por qué derivó. Y en `AgentOverlay`, `propose_automation` / `propose_automation_update`.

### F4. "Webhooks" no es un canal

`landing-sections.tsx:34` lo pone en la banda de canales junto a WhatsApp e Instagram.

```ts
// lib/types.ts:6
export type ChannelId = "web" | "whatsapp" | "messenger" | "instagram";
```

Webhook es un **disparador** de automatización (`app/api/automations/[id]/webhook/route.ts`),
y Meta Ads es una **fuente de leads**, no un canal de chat.

**Arreglo:** dejar los 4 canales reales en la banda y mover Meta Ads / Webhooks a una línea
aparte ("y además: leads de Meta Ads, webhooks de entrada") o a la sección de Ads.

### F5. Modelo equivocado

`app-screens.tsx:625` dice "Claude Opus 5". El default de chat es
`claude-sonnet-5` (`lib/model-catalog.ts:12`); Opus 5 es el default de
`automation` / `agent_design`.

**Arreglo:** "Claude Sonnet 5" en el chat, "Claude Opus 5" en el overlay de automatización.

### F6. Métrica inexistente

`app-screens.tsx:544` dice "3.640 ejecuciones". El campo del modelo es `responseCount`
(`app/automations/page.tsx:142`) → "3.640 respuestas".

---

## G. Secciones faltantes

### G1. Precios (`/pricing` + sección en la landing)

**Decisión de negocio pendiente — necesito tus números.** El producto es autoalojado con
claves propias, así que el modelo no es obvio. Tres formas que encajan con lo que ya hay en
el código:

| Plan | Qué incluye (todo verificable en el repo hoy) |
|---|---|
| **Community** | Self-host, código completo, 4 canales, agentes, automatizaciones, conocimiento, Meta Ads, tus claves de modelo. Gratis. |
| **Pro** | Lo anterior + soporte, actualizaciones guiadas, plantillas de agentes, SLA. `$ ?` |
| **Managed** | Lo hospedamos nosotros, Postgres gestionado, backups, observabilidad. `$ ?` |

La página se arma con `lp-tile` + `Disclosure` (ya existen) y una tabla comparativa con la
`Card` de la app. **Lo que necesito de vos: los precios, la moneda (los mockups usan `$` con
separador de miles latino → ¿ARS?) y si va mensual/anual.**

### G2. Términos y condiciones (`/terms`) y Privacidad (`/privacy`)

Hoy no existen (`app/` no tiene ninguna de las dos rutas) y el footer no las linkea.

Puedo redactar el borrador completo cubriendo lo que el código realmente hace:
- Qué datos se guardan y dónde (Postgres del usuario — `@workflow/world-postgres`).
- Qué sale del servidor: solo la llamada al modelo configurado.
- Sandbox con `networkPolicy: "deny-all"` (`agent/sandbox/sandbox.ts:20`).
- Trazas por OpenTelemetry al colector del usuario.
- Datos de Meta (WhatsApp/Instagram/Messenger/Ads) y las políticas de plataforma de Meta.
- Retención, borrado y export (el inbox ya exporta CSV).

**No es asesoramiento legal**: el borrador te lo tiene que revisar un abogado, y hace falta
saber la jurisdicción y la razón social. Decime cuáles y lo escribo.

### G3. FAQ

Reusar el primitivo `Disclosure` (`primitives.tsx:110`) en una sección propia antes del
prefooter. 6–8 preguntas: qué hace falta para instalarlo, qué modelos soporta, si funciona
con WhatsApp Business API, qué pasa si el agente no sabe, cómo se cargan los documentos,
cuánto cuesta el modelo, cómo se actualiza.

### G4. Footer

Agregar columna **Legal**: Términos, Privacidad, Precios. Hoy `landing-footer.tsx:12-42`
tiene 4 columnas y ninguna legal.

---

## H. Infraestructura y SEO

1. **La landing vive en `/landing` y `/` es el chat.** Para un sitio público eso significa
   que la home no es la landing. Decidir: mover la landing a `/` con la app en `/app`, o
   dejarla y agregar redirect + canonical. Es una decisión tuya.
2. **`lang` mal puesto.** `app/layout.tsx:45` declara `<html lang="en">` y la landing pone
   `lang="es"` en un `<div>` (`landing.tsx:41`). Correcto sería un route group
   `app/(marketing)/layout.tsx` con su propio `<html lang="es">`.
3. **Tema forzado en un `div`.** `.lp dark` va en un `div`, pero `body { background: var(--background) }`
   sigue en el tema de la app y `color-scheme` en `<html>` sigue en `light`. Resultado:
   **overscroll blanco** y **scrollbars claros** sobre una página negra. El route group lo
   arregla: `dark` en `<html>`.
4. **Sin metadata social.** `app/landing/page.tsx:3-8` tiene solo `title` y `description`.
   Falta `openGraph`, `twitter`, `alternates.canonical`, y una imagen OG
   (`app/landing/opengraph-image.tsx`).
5. **Sin `robots.ts` ni `sitemap.ts`.** No existen en el repo.
6. **CTA "Empezar" → `/setup`.** `/setup` es la pantalla de diagnóstico dentro del
   `AppShell` (`app/setup/page.tsx:29`), no un onboarding público. Para un visitante frío
   debería ir a la doc de instalación o a un `/install` con los comandos.

---

## Orden de ejecución

**Fase 1 — Paleta y tipografía** (lo que más se nota, y desbloquea el resto)
`A1–A5`, `B1–B4`. Un solo pase por `globals.css` + reemplazo de `var(--lp-text-*)`.

**Fase 2 — Sistema de componentes**
`C1–C4`, `A7`/`H2`/`H3` (route group `(marketing)` con `<html lang="es" class="dark">`).

**Fase 3 — Navbar**
`D1–D7`.

**Fase 4 — Animaciones**
`E1–E4`.

**Fase 5 — Contenido real**
`F1–F6`. Todo por `es()` para que no se vuelva a desincronizar.

**Fase 6 — Secciones nuevas**
`G3` (FAQ) y `G4` (footer) salen ya. `G1` (precios) y `G2` (legales) esperan tus datos.

**Fase 7 — SEO**
`H4`, `H5`, `H6`. `H1` según lo que decidas del routing.

---

## Lo que necesito de vos para cerrar el plan

1. **Precios**: montos, moneda y si hay plan mensual/anual.
2. **Legales**: razón social y jurisdicción para redactar Términos y Privacidad.
3. **Routing**: ¿la landing pasa a `/` o se queda en `/landing`?
4. **CTA "Empezar"**: ¿a dónde manda a alguien que todavía no instaló nada?

Todo lo demás (Fases 1 a 5, más FAQ y footer) se puede ejecutar sin esperar nada.
