// Phone-number formatting, with no server imports.
//
// Split out of lib/number-store.ts and not merged back. That module reaches
// `doc-store` → `postgres-pool` → `pg`, and importing one pure function from
// it in a client component drags the whole Postgres driver into the browser
// bundle — which fails the build outright on `Can't resolve 'tls'`.
//
// So: anything a form needs while you type lives here; anything that reads or
// writes the directory stays in the store.

/**
 * E.164, or `null` when the input cannot be one.
 *
 * Strict on purpose. The directory's uniqueness check compares stored strings,
 * so "+54 9 11 5555 5555" and "+5491155555555" have to normalize to the same
 * bytes or it will hold both and think they are two different lines.
 */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Keep a leading +, drop every other non-digit: spaces, dashes, dots and
  // the parentheses people paste out of a provider dashboard.
  const digits = trimmed.replace(/[^\d+]/g, "");
  const plus = digits.startsWith("+");
  const bare = plus ? digits.slice(1) : digits;
  if (!/^\d{6,15}$/.test(bare)) return null;
  return `+${bare}`;
}

/**
 * The display form of a stored number — which is the stored number.
 *
 * There was a grouping pass here that split the last six digits off
 * ("+5491155 55 1111"). It read worse than the raw E.164, and every attempt to
 * fix it ran into the same wall: correct grouping is per country, this app has
 * no country metadata for a line, and a plausible-looking wrong grouping is
 * more confusing than none — somebody reading "+5 491 155 551 111" cannot tell
 * whether the country code is 5 or 54.
 *
 * So the number is shown exactly as stored, and the human-readable half of a
 * directory row is the `label` the owner typed. Kept as a function because the
 * call sites are the right place for formatting to land the day this app knows
 * a number's country.
 */
export function formatE164(e164: string): string {
  return e164;
}
