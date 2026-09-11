import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsPage, CONSENT_MAX_AGE, CONSENT_SCOPE, CONSENT_VERSION, parseConsent } from "./analytics-consent";

describe("consent validation", () => {
  const now = Date.now();
  const choice = { version: CONSENT_VERSION, scope: CONSENT_SCOPE, savedAt: now, google: true, product: false };
  it("requires explicit, typed choices within the validity period", () => {
    expect(parseConsent(JSON.stringify(choice), now)).toEqual(choice);
    for (const raw of [null, "", "{", "null", "true", JSON.stringify({ ...choice, google: "true" }), JSON.stringify({ ...choice, product: undefined })]) {
      expect(parseConsent(raw, now)).toBeNull();
    }
  });
  it("rejects expired, future, changed-version and changed-provider consent", () => {
    for (const overrides of [
      { savedAt: now - CONSENT_MAX_AGE }, { savedAt: now + 1 },
      { version: 0 }, { scope: "different-provider" },
    ]) expect(parseConsent(JSON.stringify({ ...choice, ...overrides }), now)).toBeNull();
  });
  it("never includes customer identifiers, query strings or auth routes", () => {
    expect(analyticsPage("/agents/customer-private-id/voice?email=private@example.com#secret")).toEqual({ kind: "product", page: "agents" });
    expect(analyticsPage("/pricing?email=private@example.com")).toEqual({ kind: "public", page: "/pricing" });
    expect(analyticsPage("/landing")).toEqual({ kind: "public", page: "/" });
    for (const path of ["/login", "/reset-password?token=secret", "/f/customer", "/api/account", "/unknown-secret", "/dev/components"]) {
      expect(analyticsPage(path)).toBeNull();
    }
  });
});

describe("browser analytics consent boundary", () => {
  let local: Map<string, string>;
  let session: Map<string, string>;
  let scripts: (EventTarget & { onload?: () => void; remove: ReturnType<typeof vi.fn> })[];
  let browser: EventTarget & { location: { origin: string }; dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  const storage = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  });
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test123");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    local = new Map(); session = new Map(); scripts = [];
    browser = Object.assign(new EventTarget(), { location: { origin: "https://senka.test" } });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("navigator", { globalPrivacyControl: false });
    vi.stubGlobal("location", { hostname: "senka.test" });
    vi.stubGlobal("localStorage", storage(local));
    vi.stubGlobal("sessionStorage", storage(session));
    vi.stubGlobal("document", {
      cookie: "",
      createElement: () => Object.assign(new EventTarget(), { remove: vi.fn() }),
      head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("makes no optional requests before consent or after rejection", async () => {
    const consent = await import("./analytics-consent");
    const analytics = await import("./browser-analytics");
    analytics.trackPage("/pricing"); analytics.trackPage("/dashboard");
    consent.saveConsent(false, false);
    analytics.trackPage("/pricing"); analytics.trackPage("/dashboard");
    expect(scripts).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });

  it("sends only opted-in product events with a sanitized screen name", async () => {
    const consent = await import("./analytics-consent");
    const analytics = await import("./browser-analytics");
    consent.saveConsent(false, true);
    analytics.trackPage("/pricing");
    analytics.trackPage("/agents/private-client/voice?email=person@example.com");
    expect(scripts).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
    const payload = JSON.parse(options?.body as string);
    expect(payload.properties).toEqual({ screen: "agents", $process_person_profile: false, $geoip_disable: true });
    expect(options?.body).not.toContain("private-client");
    expect(options?.referrerPolicy).toBe("no-referrer");
    consent.saveConsent(false, false);
    analytics.enforceAnalyticsChoice();
    expect(session.has(consent.PRODUCT_SESSION_KEY)).toBe(false);
    analytics.trackPage("/dashboard");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sanitizes GA events and disables GA on private routes", async () => {
    const consent = await import("./analytics-consent");
    const analytics = await import("./browser-analytics");
    consent.saveConsent(true, false);
    const cleanup = analytics.trackPage("/pricing?email=secret@example.com");
    expect(scripts).toHaveLength(1);
    scripts[0].onload?.(); scripts[0].dispatchEvent(new Event("load"));
    const queue = browser.dataLayer?.map((args) => Array.from(args as ArrayLike<unknown>));
    expect(JSON.stringify(queue)).not.toContain("secret");
    expect(queue?.find((args) => args[0] === "config")?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false });
    expect(queue?.at(-1)?.[2]).toMatchObject({ page_location: "https://senka.test/pricing", page_referrer: "" });
    cleanup(); analytics.trackPage("/chat/private-id");
    expect(Reflect.get(browser, "ga-disable-G-TEST123")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not initialize GA when consent is withdrawn during script loading", async () => {
    const consent = await import("./analytics-consent");
    const analytics = await import("./browser-analytics");
    consent.saveConsent(true, false); analytics.trackPage("/pricing");
    consent.saveConsent(false, false); analytics.enforceAnalyticsChoice();
    scripts[0].onload?.(); scripts[0].dispatchEvent(new Event("load"));
    expect(browser.dataLayer).toEqual([]);
    expect(Reflect.get(browser, "ga-disable-G-TEST123")).toBe(true);
  });

  it("honors GPC even when previously accepted", async () => {
    const consent = await import("./analytics-consent");
    const analytics = await import("./browser-analytics");
    consent.saveConsent(true, true);
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    analytics.trackPage("/pricing"); analytics.trackPage("/dashboard");
    expect(scripts).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a stale persisted grant when withdrawal cannot be saved", async () => {
    const consent = await import("./analytics-consent");
    const analytics = await import("./browser-analytics");
    consent.saveConsent(true, true);
    vi.stubGlobal("localStorage", { ...storage(local), setItem: () => { throw new Error("blocked"); } });
    expect(consent.saveConsent(false, false)).toBe(false);
    analytics.trackPage("/pricing"); analytics.trackPage("/dashboard");
    expect(scripts).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
});
