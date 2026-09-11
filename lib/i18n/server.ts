import { DEFAULT_LOCALE, loadDictionary, type Locale } from "./dictionaries";

// Translating inside an API route.
//
// Most routes never need this: an `apiError` code is translated in the browser
// by `translateApiError`, which is the right split — the server names the
// failure, the client words it. Two of the new surfaces need something the
// code alone cannot carry, though: "that number is already answered by
// *Recepción*" and "use https, a token over http travels in plaintext" are
// sentences with a subject, and there is no error code for either.
//
// So those routes take the caller's `locale` in the body, exactly as
// app/api/agents/route.ts already does for prompt composition, and word the
// failure here. `es` is statically in memory; `en` is one dynamic import that
// is then cached for the life of the process.

/** Read a locale off a request body without trusting its shape. */
export function readLocale(value: unknown): Locale {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

/**
 * One sentence, in the caller's language.
 *
 * Falls back to the key rather than to an empty string: a message that reads
 * `mcp.urlInsecure` is ugly and diagnosable, while a blank one is a dialog
 * that fails with no reason at all.
 */
export async function translate(
  locale: Locale,
  key: string,
  params?: Readonly<Record<string, string>>,
): Promise<string> {
  let dictionary;
  try {
    dictionary = await loadDictionary(locale);
  } catch {
    dictionary = undefined;
  }
  const template = dictionary?.[key];
  if (!template) return key;
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    template,
  );
}
