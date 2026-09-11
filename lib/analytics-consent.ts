export const CONSENT_KEY = "senka-consent";
export const CONSENT_EVENT = "senka:consent-change";
export const PREFERENCES_EVENT = "senka:privacy-preferences";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
export const PRODUCT_SESSION_KEY = "senka-product-session";

const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "";
// Explicit supported regions prevent accidentally sending events to a UI host.
export const ANALYTICS = {
  gaId: /^G-[A-Z0-9]+$/.test(gaId) ? gaId : "",
  posthogKey: /^phc_[A-Za-z0-9_-]+$/.test(posthogKey) &&
    ["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(posthogHost)
    ? posthogKey : "",
  posthogHost,
};
export const CONSENT_SCOPE = JSON.stringify(ANALYTICS);

export type Consent = {
  version: number;
  scope: string;
  savedAt: number;
  google: boolean;
  product: boolean;
};

export function parseConsent(raw: string | null, now = Date.now(), scope = CONSENT_SCOPE): Consent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Consent;
    if (!value || value.version !== CONSENT_VERSION || value.scope !== scope ||
      typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt) ||
      value.savedAt > now || now - value.savedAt >= CONSENT_MAX_AGE ||
      typeof value.google !== "boolean" || typeof value.product !== "boolean") return null;
    return value;
  } catch {
    return null;
  }
}

let memoryChoice: string | null | undefined;
export function consentSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  let raw = memoryChoice ?? null;
  if (memoryChoice === undefined) {
    try { raw = localStorage.getItem(CONSENT_KEY); } catch { /* Storage can be blocked. */ }
  }
  return parseConsent(raw) ? raw : null;
}

export function privacySignal(): boolean {
  return typeof navigator !== "undefined" &&
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function subscribeConsent(onChange: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === CONSENT_KEY || event.key === null) {
      memoryChoice = undefined;
      onChange();
    }
  };
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  // Expire choices even in a long-running tab.
  const timer = window.setInterval(onChange, 1000);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
    window.clearInterval(timer);
  };
}

export function saveConsent(google: boolean, product: boolean): boolean {
  const blocked = privacySignal();
  const value: Consent = {
    version: CONSENT_VERSION,
    scope: CONSENT_SCOPE,
    savedAt: Date.now(),
    google: google && Boolean(ANALYTICS.gaId) && !blocked,
    product: product && Boolean(ANALYTICS.posthogKey) && !blocked,
  };
  const raw = JSON.stringify(value);
  // Memory overrides stale persisted consent if a write fails.
  memoryChoice = raw;
  let persisted = false;
  try {
    localStorage.setItem(CONSENT_KEY, raw);
    memoryChoice = undefined;
    persisted = true;
  } catch { /* Current-tab choice still applies. */ }
  window.dispatchEvent(new Event(CONSENT_EVENT));
  return persisted;
}

export const PUBLIC_ANALYTICS_PAGES = ["/", "/pricing", "/guide", "/legal", "/terms", "/privacy", "/privacy-rights", "/cookies"];
const PRODUCT_SCREENS = new Set([
  "dashboard", "chat", "chats", "history", "agents", "inbox", "crm", "leads",
  "pipeline", "knowledge", "forms", "automations", "calendar", "reminders",
  "connections", "numbers", "skills", "email-templates", "ads", "seo", "account", "settings",
]);

/** A closed screen vocabulary; never return dynamic paths or arbitrary text. */
export function analyticsPage(pathname: string): { kind: "public" | "product"; page: string } | null {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  if (path === "/landing") return { kind: "public", page: "/" };
  if (PUBLIC_ANALYTICS_PAGES.includes(path)) return { kind: "public", page: path };
  const screen = path.split("/")[1];
  return PRODUCT_SCREENS.has(screen) ? { kind: "product", page: screen } : null;
}
