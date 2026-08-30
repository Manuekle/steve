// Relative time formatting for chat and activity displays.

export type Locale = "es" | "en";

/** Format a relative time string for display. */
export function relativeTime(iso: string, locale: Locale = "es"): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const now = locale === "en" ? "now" : "ahora";
  if (seconds < 60) return now;
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** Countdown to a future instant — "en 2h" / "in 2h". Anything already past
 *  falls through to `relativeTime`, since a due reminder should read as
 *  elapsed rather than as "ahora" (which is what the past-only maths in
 *  `relativeTime` returns for every future date). */
export function timeUntil(iso: string, locale: Locale = "es"): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return relativeTime(iso, locale);

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const prefix = locale === "en" ? "in " : "en ";

  if (minutes < 1) return locale === "en" ? "in under a minute" : "en menos de un minuto";
  if (minutes < 60) return `${prefix}${minutes}m`;
  if (hours < 24) return `${prefix}${hours}h`;
  if (days < 7) return `${prefix}${days}d`;
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function fullTime(iso: string, locale: Locale = "es"): string {
  return new Date(iso).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
