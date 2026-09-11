"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  type Dictionary,
  getDictionary,
  loadDictionary,
  type Locale,
} from "./dictionaries";

type TranslationParams = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** `fallback` is for the handful of strings that come from a layer with its
   *  own vocabulary — a validator's issue codes, an API error code — where the
   *  set is open enough that a missing entry is a real possibility. Without it
   *  a key with no line in the dictionary renders as the key itself, which is
   *  worse than the English sentence the caller already has. */
  t: (key: string, params?: TranslationParams, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

/**
 * The visitor's actual language preference, separate from whatever locale a
 * subtree is being rendered in.
 *
 * `I18nLocale` overrides `I18nContext` so a pinned subtree renders in one
 * language. That is right for content and wrong for a control that *sets* the
 * preference: inside the pin, `useI18n().locale` is the pin's value, so a
 * language switch reads "es" no matter what the visitor has chosen, always
 * offers "en" as the next value, and can never toggle back. This context is
 * the one a preference control has to read.
 */
const I18nRootContext = createContext<Pick<I18nContextValue, "locale" | "setLocale"> | undefined>(
  undefined,
);

const LOCALE_STORAGE_KEY = "senka-locale";

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch {
    // localStorage might be blocked
  }
  // Detect browser language
  const browserLang = navigator.language.split("-")[0];
  return browserLang === "en" ? "en" : DEFAULT_LOCALE;
}

/** Interpolate {param} placeholders in a translation string. */
function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  // Handle {key, plural} — for now just strip the plural marker
  // and use the singular form (sufficient for "paso"/"step")
  result = result.replace(/\{(\w+),\s*plural\}/g, (_match, key) => {
    const count = params[key];
    return count === 1 ? "" : "s";
  });
  return result;
}

/**
 * The dictionary for `locale`, loading its chunk if this is the first time the
 * app has rendered in it.
 *
 * Only `es` is bundled with the app — see the note in `dictionaries.ts`. While
 * another locale's chunk is in flight this returns the default one, so the
 * interface shows Spanish for those few hundred milliseconds rather than a
 * screenful of raw translation keys. The state bump is what re-renders the
 * subtree once the real dictionary is in memory.
 */
function useDictionary(locale: Locale): Dictionary {
  // The dictionary is read during render, not held in state — `getDictionary`
  // is synchronous and the module owns the cache. The reducer exists only to
  // schedule a re-render once a chunk lands, so nothing is set synchronously
  // inside the effect.
  const [, onLoaded] = useReducer((tick: number) => tick + 1, 0);

  useEffect(() => {
    if (getDictionary(locale)) return;

    let cancelled = false;
    loadDictionary(locale).then(() => {
      if (!cancelled) onLoaded();
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // `getDictionary(DEFAULT_LOCALE)` is the static import and is always there.
  return getDictionary(locale) ?? (getDictionary(DEFAULT_LOCALE) as Dictionary);
}

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const dictionary = useDictionary(locale);

  useEffect(() => {
    setLocaleState(getInitialLocale());
  }, []);

  // Keep `<html lang>` honest. The root layout ships `es` because that is the
  // default locale the server renders with; once the visitor's stored or
  // browser preference resolves to something else, the attribute has to follow
  // it, or assistive tech and in-page translation keep reading the document as
  // Spanish while the interface is in English.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Best-effort
    }
  }, []);

  const t = useCallback(
    (key: string, params?: TranslationParams, fallback?: string): string => {
      const template = dictionary[key] ?? fallback ?? key;
      return interpolate(template, params);
    },
    [dictionary],
  );

  const root = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <I18nRootContext.Provider value={root}>
      <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
    </I18nRootContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

/** Shorthand hook — returns just the translation function. */
export function useT() {
  return useI18n().t;
}

/**
 * The visitor's own language preference and the setter for it, read past any
 * `I18nLocale` pin. Use this in a control that changes the language; use
 * `useI18n` for anything that renders in it.
 */
export function useAppLocale(): Pick<I18nContextValue, "locale" | "setLocale"> {
  const context = useContext(I18nRootContext);
  if (!context) {
    throw new Error("useAppLocale must be used within an I18nProvider");
  }
  return context;
}

/**
 * Pins a subtree to one locale, whatever the visitor last chose.
 *
 * The marketing pages are written in Spanish end to end, so the app
 * components they reuse — the sidebar, the flow canvas, the ads tabs — have to
 * be Spanish too. A visitor who switched the product to English and then came
 * back to the landing would otherwise get Spanish prose wrapped around an
 * English screenshot.
 *
 * `setLocale` is the outer provider's, so a control inside the pin changes the
 * app's real preference rather than a copy of it — but `locale` is the pin's,
 * which is why a language control must read `useAppLocale` instead. Reading
 * this context left the footer switch stuck offering English forever.
 */
export function I18nLocale({
  children,
  locale,
}: {
  readonly children: ReactNode;
  readonly locale: Locale;
}) {
  const { setLocale } = useI18n();
  const dictionary = useDictionary(locale);
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => interpolate(dictionary[key] ?? key, params),
    }),
    [dictionary, locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
