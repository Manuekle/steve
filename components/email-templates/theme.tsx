import { SITE_URL } from "@/lib/site";

/**
 * Everything the five templates share about how they look: the faces, the
 * palette, and the one `<head>` block that makes both work in a real inbox.
 *
 * The fonts are self-hosted under `/public/fonts`, so their URLs have to be
 * absolute — an inbox has no origin to resolve `/fonts/…` against. `SITE_URL`
 * is the same value the canonicals use, which means a deployment that never
 * set `NEXT_PUBLIC_SITE_URL` sends emails pointing at localhost: the fonts
 * simply don't load there, and every stack below falls back cleanly.
 *
 * Which is the normal case anyway. Gmail strips `@font-face` outright and
 * Outlook's Word engine can't load web fonts at all — these are a bonus for
 * the clients that do support them (Apple Mail, iOS Mail, Outlook for Mac),
 * never something the layout depends on.
 */
const DIR = `${SITE_URL}/fonts`;

/**
 * Two `format()` entries per variable face on purpose: they are served as a
 * single variable file, and clients that predate `*-variations` need to be
 * told it is also just a woff2/ttf they can use at one weight.
 */
const FACES = `
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('${DIR}/inter/InterVariable.woff2') format('woff2-variations'),
       url('${DIR}/inter/InterVariable.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url('${DIR}/inter/InterVariable-Italic.woff2') format('woff2-variations'),
       url('${DIR}/inter/InterVariable-Italic.woff2') format('woff2');
}
@font-face {
  font-family: 'Saans';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('${DIR}/saans/SaansVF.ttf') format('truetype-variations'),
       url('${DIR}/saans/SaansVF.ttf') format('truetype');
}
@font-face {
  font-family: 'Cooper';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${DIR}/cooper/CooperLtBT_400-s.p.0ayak-z9t8l45.woff2') format('woff2');
}
@font-face {
  font-family: 'Cooper';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('${DIR}/cooper/CooperLtBT_500-s.p.268aeup1v2w88.woff2') format('woff2');
}
`.trim();

/**
 * The stacks, in the roles the faces already have in the product: Inter for
 * reading, Saans for headlines, Cooper for the display lines.
 *
 * Every stack ends in a face that exists on every machine, because Outlook
 * picks the first name it recognises and falls back to Times New Roman when it
 * recognises none of them.
 *
 * Cooper only ships at 400 and 500 here, so anything set in it should be
 * `font-normal` or `font-medium` — asking for 700 gets a synthesised bold,
 * which on a soft serif looks like a printing error.
 */
export const emailFontFamily = {
  sans: [
    "Inter",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Helvetica",
    "Arial",
    "sans-serif",
  ],
  heading: [
    "Saans",
    "Inter",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Helvetica",
    "Arial",
    "sans-serif",
  ],
  display: ["Cooper", "Saans", "Georgia", "Times New Roman", "serif"],
};

/**
 * The light palette, which is what every template actually renders: these are
 * Tailwind colours, so they end up as inline styles on the elements.
 */
export const emailColors = {
  canvas: "#f4f4f5",
  surface: "#ffffff",
  band: "#fafafa",
  ink: "#09090b",
  fg: "#18181b",
  "fg-2": "#52525b",
  muted: "#8b8b94",
  stroke: "#e4e4e7",
  rule: "#f1f1f3",
};

/**
 * And the dark one, which is not a Tailwind colour at all.
 *
 * Dark mode in email can only come from a stylesheet — `prefers-color-scheme`
 * has no inline form — but a stylesheet loses to the inline styles Tailwind
 * writes, so every rule here is `!important`. That is also why the templates
 * carry the `e-*` classes below *beside* their colour utilities: the utility
 * is inlined and its own class stripped, so the `e-*` class is the only hook
 * left on the element.
 */
const DARK: Record<string, string> = {
  "e-canvas": "background-color:#050505",
  "e-surface": "background-color:#0c0c0d",
  "e-band": "background-color:#131316",
  "e-ink": "color:#fafafa",
  "e-fg": "color:#e4e4e7",
  "e-fg-2": "color:#a1a1aa",
  "e-muted": "color:#71717a",
  "e-stroke": "border-color:#26262a",
  "e-rule": "border-color:#1c1c20",
  /** The inverted button flips with everything else, or it disappears. */
  "e-invert": "background-color:#fafafa;color:#09090b",
};

/** One block of `!important` overrides, optionally scoped to a prefix. */
function rules(prefix: string): string {
  return Object.entries(DARK)
    .map(([name, decls]) => {
      const body = decls
        .split(";")
        .map((decl) => `${decl} !important`)
        .join(";");
      return `${prefix}.${name}{${body}}`;
    })
    .join("");
}

/**
 * Two selectors for the same thing. Apple Mail, iOS Mail, Outlook for Mac and
 * Thunderbird honour the media query; Outlook.com rewrites the document
 * instead and hangs `data-ogsc` on an ancestor, so the same rules are repeated
 * under that attribute.
 */
const DARK_CSS = `@media (prefers-color-scheme: dark){${rules("")}}${rules("[data-ogsc] ")}`;

/**
 * Goes inside each template's `<Head>`.
 *
 * The two metas are what stop a client inverting the email on its own: they
 * say the message brings its own dark mode, so leave it alone.
 */
export function EmailHead() {
  return (
    <>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <style dangerouslySetInnerHTML={{ __html: `${FACES}\n${DARK_CSS}` }} />
    </>
  );
}
