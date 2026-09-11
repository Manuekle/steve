import { ANALYTICS, CONSENT_MAX_AGE, PRODUCT_SESSION_KEY, analyticsPage, consentSnapshot, parseConsent, privacySignal } from "./analytics-consent";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};
let googleScript: HTMLScriptElement | undefined;
let googleReady = false;
let googleConfigured = false;

function allowed(provider: "google" | "product"): boolean {
  return !privacySignal() && Boolean(parseConsent(consentSnapshot())?.[provider]);
}

function googleEnabled(value: boolean) {
  if (ANALYTICS.gaId) Reflect.set(window, `ga-disable-${ANALYTICS.gaId}`, !value);
}

function clearGoogleCookies() {
  // Only this integration's GA cookies, never session/OAuth cookies.
  const names = document.cookie.split(";").map((part) => part.trim().split("=", 1)[0])
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
  const host = location.hostname.split(".");
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    for (let index = 0; index < host.length - 1; index++) {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${host.slice(index).join(".")}; SameSite=Lax`;
    }
  }
}

export function enforceAnalyticsChoice() {
  if (!allowed("google")) {
    googleEnabled(false);
    // Drop queued commands if consent is withdrawn while the script loads.
    if (!googleReady) {
      const target = window as AnalyticsWindow;
      if (target.dataLayer) target.dataLayer.length = 0;
      googleScript?.remove();
      googleScript = undefined;
    }
    clearGoogleCookies();
  }
  if (!allowed("product")) {
    try { sessionStorage.removeItem(PRODUCT_SESSION_KEY); } catch { /* Optional storage. */ }
  }
}

function googlePage(page: string, active: () => boolean) {
  const target = window as AnalyticsWindow;
  const send = () => {
    if (!active() || !allowed("google")) return;
    googleEnabled(true);
    const location = `${window.location.origin}${page}`;
    if (!googleConfigured) {
      target.gtag?.("consent", "default", {
        ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
        analytics_storage: "granted",
      });
      target.gtag?.("js", new Date());
      target.gtag?.("config", ANALYTICS.gaId, {
        send_page_view: false,
        page_location: location,
        page_referrer: "",
        page_title: "Senka",
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_expires: CONSENT_MAX_AGE / 1000,
        cookie_update: false,
        cookie_domain: window.location.hostname,
        cookie_flags: "SameSite=Lax;Secure",
      });
      googleConfigured = true;
    }
    target.gtag?.("event", "page_view", {
      send_to: ANALYTICS.gaId, page_location: location, page_referrer: "", page_title: `Senka ${page}`,
    });
  };
  if (googleReady) { send(); return () => {}; }
  target.dataLayer ??= [];
  // gtag's queue expects an Arguments object, not an array.
  // eslint-disable-next-line prefer-rest-params
  target.gtag ??= function () { target.dataLayer?.push(arguments); };
  // Keep disabled until a current, authorized page actually sends an event.
  googleEnabled(false);
  if (!googleScript) {
    googleScript = document.createElement("script");
    googleScript.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS.gaId}`;
    googleScript.async = true;
    googleScript.referrerPolicy = "no-referrer";
    googleScript.onload = () => { googleReady = true; };
    googleScript.onerror = () => { googleScript?.remove(); googleScript = undefined; };
    document.head.appendChild(googleScript);
  }
  const script = googleScript;
  script.addEventListener("load", send);
  return () => script.removeEventListener("load", send);
}

export function trackPage(pathname: string): () => void {
  const page = analyticsPage(pathname);
  let active = true;
  googleEnabled(false);
  enforceAnalyticsChoice();
  if (!page) return () => {};
  if (page.kind === "public" && ANALYTICS.gaId && allowed("google")) {
    const remove = googlePage(page.page, () => active);
    return () => { active = false; googleEnabled(false); remove(); };
  }
  if (page.kind !== "product" || !ANALYTICS.posthogKey || !allowed("product")) return () => {};
  let id: string;
  try {
    id = sessionStorage.getItem(PRODUCT_SESSION_KEY) ?? "";
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      id = crypto.randomUUID();
      sessionStorage.setItem(PRODUCT_SESSION_KEY, id);
    }
  } catch { return () => {}; }
  const controller = new AbortController();
  // Direct Capture API avoids loading autocapture, replay or remote settings.
  void fetch(`${ANALYTICS.posthogHost}/i/v0/e/`, {
    method: "POST",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      api_key: ANALYTICS.posthogKey,
      event: "screen_view",
      distinct_id: id,
      properties: { screen: page.page, $process_person_profile: false, $geoip_disable: true },
    }),
  }).catch(() => { /* Analytics must not interrupt the product. */ });
  return () => controller.abort();
}
