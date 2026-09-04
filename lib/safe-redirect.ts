/**
 * The `?next=` parameter, made safe to redirect to.
 *
 * `value.startsWith("/")` is the check this used to carry, and it is not
 * enough: `//evil.com` and `/\evil.com` both start with a slash, and both are
 * absolute URLs to a different origin once a browser — or `new URL(value,
 * origin)` — resolves them. A sign-in flow that forwards to an attacker's page
 * after authenticating is the classic setup for a convincing credential-replay
 * phish, and this app hands one to anybody who can get a link clicked.
 *
 * So: a single leading slash, nothing that could start an authority component,
 * and no scheme. Anything else falls back to the caller's own default.
 */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  // Must be a root-relative path.
  if (!value.startsWith("/")) return fallback;
  // `//host` and `/\host` are protocol-relative; browsers treat the backslash
  // as a slash here even though the RFC does not.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // A control character can be used to split the `Location` header, or to hide
  // the rest of the value from a check that stops reading at the first one.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
