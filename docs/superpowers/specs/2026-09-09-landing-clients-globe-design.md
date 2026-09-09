# Landing: Clients Section + Globe

**Date**: 2026-09-09
**Status**: Approved
**Scope**: New landing section (placeholder client logos on a cobe globe), shared contact dialog, one backend tweak

---

## 1. Overview

A new section on the public landing page, between Testimonials and the Pricing teaser: a heading, a rotating [cobe](https://cobe.vercel.app) globe with placeholder client wordmarks pinned to real-world coordinates, a "Muestra" (sample) disclaimer badge — same convention `TestimonialsSection` already uses for its placeholder quotes — and a "Contáctanos" button.

Senka has no disclosed real client names or logos anywhere in this codebase (testimonials are anonymized by business type, e.g. "Tienda de indumentaria · 2 locales"). Printing invented company names as if they were real customers would repeat the exact problem `section-testimonials.tsx` already documents and solves via its `SAMPLES` flag — so this section follows the same pattern: placeholder content, clearly labeled, swappable later without a code change to the labeling logic.

`cobe` is already installed (`package.json`, `^2.0.1`).

---

## 2. Section & Placement

`app/landing/_components/landing.tsx`:

```tsx
<TestimonialsSection />
<ClientsSection />
<PricingSection />
```

`id="clientes"`, figure `Fig 08`. That number is currently `section-pricing.tsx`'s (Testimonials is `07`, the pricing teaser is `08`, `faq.tsx` is `09`) — inserting between Testimonials and Pricing bumps both trailing labels by one: pricing teaser `08` → `09`, FAQ `09` → `10`. Two one-line changes, listed in §6.

---

## 3. Components

| File | Purpose |
|---|---|
| `app/landing/_components/section-clients.tsx` | The section: `SectionIntro`-style heading, sample badge/note (same visual as `TestimonialsSection`'s), `<ClientGlobe>`, `<SalesContactDialog>` CTA. |
| `app/landing/_components/client-globe.tsx` | cobe wrapper: canvas + marker labels. Detailed below. |
| `app/landing/_components/sales-contact-dialog.tsx` | `ContactSalesDialog` extracted out of `app/pricing/_components/pricing.tsx`, parametrized. Detailed below. |

### 3.1 `ClientGlobe`

```tsx
export function ClientGlobe({
  clients,
}: {
  readonly clients: readonly { id: string; name: string; lat: number; lng: number }[];
}) { ... }
```

- `<canvas>` sized by its container via `ResizeObserver` (devicePixelRatio-aware, same idea as the app's other canvas surfaces).
- `createGlobe` runs in `useEffect` (client-only; the canvas element itself is fine server-rendered, the WebGL call is not attempted until mount). `globe.destroy()` on unmount.
- Neutral palette only — `baseColor`, `markerColor`, `glowColor` are grayscale RGB triplets matching the landing's chroma-0 dark tokens (`--foreground`, `--muted-foreground`), not an invented accent. `dark` (cobe's own light/dark param) is read from `document.documentElement.classList.contains("dark")` — same source `ThemeProvider` toggles — and updated inside `onRender` each frame, so flipping the theme toggle re-colors the globe live without remounting it.
- Rotation: `onRender` advances `phi`. `matchMedia("(prefers-reduced-motion: reduce)")` freezes the increment — mirrors the `animation: none` rule `.lp-orbit`/`.lp-spark`/`.lp-rail-track` already get under reduced motion (`app/globals.css`), just done in JS since this loop isn't CSS-driven.
- Perf: an `IntersectionObserver` on the section (same idiom `demo-cursor.tsx` uses) stops advancing `phi` — and skips creating the globe at all until first intersection — while the section is off-screen. A spinning WebGL canvas is the one continuously-animating thing on this page that isn't already covered by the shared reveal observer, so it gets its own, scoped to just this component.
- Markers: one per client, `{ location: [lat, lng], size, id: client.id }`. Each also renders a small absolutely-positioned `<span>` (the wordmark) with `style={{ positionAnchor: \`--cobe-${client.id}\` }}`, `bottom: anchor(top)`, `left: anchor(center)`, and `opacity`/`filter` driven by `var(--cobe-visible-${client.id})` — the CSS Anchor Positioning contract cobe v2 exposes, so a label fades out on its own when its pin rotates behind the globe. No manual 3D→2D projection.

### 3.2 `SalesContactDialog`

Same form, same fields, same honeypot, same `/api/demo-request` call as today's `ContactSalesDialog` — moved out of `pricing.tsx` so `/pricing` and the new section share one implementation instead of two copies that drift, which is the failure mode this codebase's own comments call out repeatedly (e.g. `scene-kit.tsx`'s intro).

```tsx
export function SalesContactDialog({
  source,
  titleKey,
  bodyKey,
  triggerLabelKey,
}: {
  readonly source: "pricing" | "clients";
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly triggerLabelKey: string;
}) { ... }
```

`pricing.tsx`'s call site becomes `<SalesContactDialog source="pricing" titleKey="pricing.contactModal.title" bodyKey="pricing.contactModal.body" triggerLabelKey="pricing.cta.contactSales" />` — same copy as today, no visible change on `/pricing`.

The new section calls it with its own keys (§6), so the dialog says "Contáctanos" / a general inquiry, never "Enterprise demo" — that framing is specific to the $9,990 plan and would be misleading here.

### 3.3 Backend: `source` on the demo-request payload

`app/api/demo-request/route.ts` hardcodes the email subject as `Enterprise demo — ${company}`. Reused as-is from a non-Enterprise CTA, every lead from the new section would land in the inbox mislabeled. Adding an optional `source` field to the request body:

```ts
const source = body.source === "clients" ? "clients" : "pricing"; // default keeps today's behavior
subject: source === "clients" ? `Consulta — ${company}` : `Enterprise demo — ${company}`,
```

Same honeypot, same rate limit, no new endpoint.

`ENTITY.email` is `null` in this checkout, so both call sites show the existing dashed "sin configurar" placeholder until it's set — not a new gap, the same one `/pricing` already has today.

---

## 4. Data

```ts
// section-clients.tsx
const SAMPLES = true; // same switch section-testimonials.tsx uses

type PlaceholderClient = {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
};

const PLACEHOLDER_CLIENTS: readonly PlaceholderClient[] = [
  { id: "casa-lima", name: "Casa Lima", lat: -34.6, lng: -58.4 },        // Buenos Aires
  { id: "estudio-norte", name: "Estudio Norte", lat: 19.4, lng: -99.1 }, // CDMX
  { id: "bella-piel", name: "Bella Piel", lat: 4.7, lng: -74.1 },        // Bogotá
  { id: "raiz-mayorista", name: "Raíz Mayorista", lat: -33.4, lng: -70.6 }, // Santiago
  { id: "ventanal", name: "Ventanal Propiedades", lat: -12.0, lng: -77.0 }, // Lima
  { id: "sonrisa-dental", name: "Sonrisa Dental", lat: -23.5, lng: -46.6 }, // São Paulo
  { id: "andes-fit", name: "Andes Fit", lat: -34.9, lng: -56.2 },        // Montevideo
  { id: "punto-envio", name: "Punto Envío", lat: 40.4, lng: -3.7 },      // Madrid
];
```

Fictional names, not the logos from the reference screenshot (that artwork belongs to whoever designed it) and not real senka customers. Rendered as plain text/mono wordmarks in a small plate — the same visual language `Avatar` (testimonials' initials chip) already uses — not illustrated logo art, so there's no fake brand mark being drawn. Swapping in real clients later means replacing this array and flipping `SAMPLES` to `false`; the badge and note disappear on their own, identical to how `TestimonialsSection` already works.

---

## 5. i18n Keys

`lib/i18n/dictionaries.ts`, both `es` and `en` blocks:

```ts
// es
"landing.clients.titleLine1": "Negocios de todo tipo",
"landing.clients.titleLine2": "ya lo están probando",
"landing.clients.body": "Desde tiendas de barrio hasta operaciones con varias sucursales — así se ve senka corriendo en distintos rubros.",
"landing.clients.sampleBadge": "Muestra",
"landing.clients.sampleNote": "Estos son negocios de ejemplo, no clientes reales todavía. Los actualizamos apenas tengamos casos públicos.",
"landing.clients.cta": "Contáctanos",
"landing.clients.contactModal.title": "Contáctanos",
"landing.clients.contactModal.body": "Contanos sobre tu negocio y te respondemos.",

// en
"landing.clients.titleLine1": "Businesses of every kind",
"landing.clients.titleLine2": "are already trying it",
"landing.clients.body": "From corner shops to multi-branch operations — this is what senka looks like running across different industries.",
"landing.clients.sampleBadge": "Sample",
"landing.clients.sampleNote": "These are example businesses, not real customers yet. We'll update this as soon as we have public case studies.",
"landing.clients.cta": "Contact us",
"landing.clients.contactModal.title": "Contact us",
"landing.clients.contactModal.body": "Tell us about your business and we'll get back to you.",
```

Copy above is a starting draft — easy to adjust wording without touching any other part of the design.

---

## 6. Files to Create/Modify

### New

| File | Purpose |
|---|---|
| `app/landing/_components/section-clients.tsx` | New section |
| `app/landing/_components/client-globe.tsx` | cobe wrapper |
| `app/landing/_components/sales-contact-dialog.tsx` | Extracted, parametrized dialog |

### Modified

| File | Change |
|---|---|
| `app/landing/_components/landing.tsx` | Insert `<ClientsSection />` between Testimonials and Pricing |
| `app/landing/_components/section-pricing.tsx` | `figure="Fig 08"` → `"Fig 09"` |
| `app/landing/_components/faq.tsx` | `Fig 09` → `Fig 10` |
| `app/pricing/_components/pricing.tsx` | Remove local `ContactSalesDialog`, import `SalesContactDialog` from the new file, pass `source="pricing"` + existing keys |
| `app/api/demo-request/route.ts` | Accept optional `source`, vary the email subject |
| `lib/i18n/dictionaries.ts` | Add `landing.clients.*` keys, es + en |

No changes to `package.json` — `cobe` is already installed.

---

## 7. Testing

- Manual/visual (this is a marketing page — no existing test coverage on landing sections to extend): globe renders, rotates, pauses under `prefers-reduced-motion` and when scrolled out of view, labels track their pins and hide behind the globe, light/dark toggle re-colors it live.
- `app/api/demo-request/route.ts`: extend existing coverage (if any) or hand-verify both `source` values produce the right subject line; confirm omitting `source` still behaves exactly as today (default `"pricing"`).
- `pnpm typecheck` — the extraction touches `pricing.tsx`'s imports.

---

## 8. Out of Scope

- Real client data — swapped in later by editing `PLACEHOLDER_CLIENTS` and flipping `SAMPLES`, no design change needed.
- Fabricated stats (user counts, countries, payment volume) — the Ramp reference shows these, but senka has no such numbers on record anywhere in this repo to draw from.
- `arcs` between cities (cobe supports these) — logos on the globe satisfy the ask; connecting lines are a different section if ever wanted.
- Scroll-spy / header nav entry for the new section — not requested, and every other landing section besides the six feature ones is already un-linked from the header nav (Testimonials, Pricing teaser, Faq).
