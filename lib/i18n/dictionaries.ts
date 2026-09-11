// Simple i18n system for senka. Two locales: es (default) and en.
// Usage: const t = useTranslations(); t("dashboard.title")

export type Locale = "es" | "en";

// ── Dictionary ──────────────────────────────────────────────────────

export type Dictionary = Record<string, string>;

export const DEFAULT_LOCALE: Locale = "es";

/**
 * The strings themselves live in `dictionary-es.ts` and `dictionary-en.ts`.
 *
 * They used to be two object literals in this file, and this file was 427 KB
 * of source that every page loaded in full. On the landing that was the single
 * largest chunk after the fonts — 116 KB over the wire — and half of it was a
 * language the visitor had not asked for, for surfaces (the CRM, forms,
 * settings) a marketing page does not contain.
 *
 * `es` stays a static import: it is the default the server renders with, so it
 * has to be in memory synchronously on first paint or the page renders raw
 * translation keys. `en` is fetched on demand — by `I18nProvider`, when the
 * stored or browser preference resolves to it, and by `I18nLocale` when a
 * subtree is pinned to it. Until it lands, `getDictionary` returns nothing and
 * callers fall back to `es`, which is the same thing that already happened for
 * the frame before `getInitialLocale` ran.
 */
import { es } from "./dictionary-es";

const loaded: Partial<Record<Locale, Dictionary>> = { es };
const inflight: Partial<Record<Locale, Promise<Dictionary>>> = {};

/** The dictionary for `locale`, if its chunk is already in memory. */
export function getDictionary(locale: Locale): Dictionary | undefined {
  return loaded[locale];
}

/**
 * Ensures `locale`'s dictionary is in memory, fetching its chunk once.
 *
 * Concurrent callers share one request — two components mounting under the
 * same locale in the same tick must not start two imports.
 */
export function loadDictionary(locale: Locale): Promise<Dictionary> {
  const already = loaded[locale];
  if (already) return Promise.resolve(already);

  const pending =
    inflight[locale] ??
    import("./dictionary-en").then(({ en }) => {
      loaded.en = en;
      delete inflight.en;
      return en;
    });
  inflight[locale] = pending;
  return pending;
}
