import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Who is allowed to create an account on this installation.
 *
 * Why this exists: the app is mono-tenant. Every account signs into the *same*
 * business — the same inbox, the same contacts, the same Settings page holding
 * the WhatsApp token, the Stripe keys and every OAuth refresh token, all of
 * which `GET /api/settings/export` hands back in plain text to any session.
 * `POST /api/auth/register` is public (it has to be: the first person to open
 * a fresh install has no session yet), and the deploy is internet-facing —
 * Caddy on :443 in front of a marketing site. Those three facts together meant
 * a stranger who found the URL could register and own the whole installation.
 *
 * So registration is a decision, not a default. The modes:
 *
 *   claim (the default) — an unclaimed instance accepts the first account, so
 *     whoever installs it can take ownership without editing config first.
 *     After that, a new account needs an invite code or an allowlisted email.
 *
 *   open — the old behaviour, and only ever what someone explicitly asks for.
 *     Appropriate behind a VPN or an SSO proxy, nowhere else.
 *
 *   closed — nobody, not even the first. For an install whose accounts are
 *     provisioned out of band (`pnpm seed:accounts`).
 *
 * Both keys are read from the environment rather than from the credential
 * store on purpose: the store is editable from a signed-in session, and a
 * gate that the thing it gates can unlock is not a gate.
 */

export type SignupMode = "claim" | "open" | "closed";

export type SignupDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "closed" | "invite_required" | "unavailable" };

/** Mirrors `ClaimState` in ./store, kept local so this module stays pure and
 *  testable without a database anywhere near it. */
export type ClaimState = "claimed" | "unclaimed" | "unknown";

/** Only the three keys this module reads. An index signature so `process.env`
 *  — whose declared type has no properties in common with a closed object type
 *  — is assignable, and so a test can pass a plain literal. */
export type SignupEnv = {
  readonly STEVE_SIGNUP_MODE?: string;
  readonly STEVE_SIGNUP_INVITE_CODE?: string;
  readonly STEVE_SIGNUP_ALLOWED_EMAILS?: string;
  readonly [key: string]: string | undefined;
};

export function signupMode(env: SignupEnv = process.env): SignupMode {
  const raw = env.STEVE_SIGNUP_MODE?.trim().toLowerCase();
  return raw === "open" || raw === "closed" ? raw : "claim";
}

/** Compares without leaking where two values first differ. Hashing first is
 *  what lets it compare strings of different lengths at all. */
function secretEquals(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

function allowedEmails(env: SignupEnv): string[] {
  return (env.STEVE_SIGNUP_ALLOWED_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether the signup form should ask for an invite code.
 *
 * Only ever a UI hint — `decideSignup` is what actually refuses, and it runs
 * on the server for every route that can mint an account. A client that lies
 * about this gets the same 403 as one that doesn't ask.
 */
export function signupNeedsInvite(claim: ClaimState, env: SignupEnv = process.env): boolean {
  if (signupMode(env) !== "claim") return false;
  if (claim === "unclaimed") return false;
  return Boolean(env.STEVE_SIGNUP_INVITE_CODE?.trim());
}

export function decideSignup(input: {
  readonly email: string;
  readonly inviteCode?: string;
  /** Whether this installation already has an account — see `claimState` in
   *  ./store for why "could not tell" is one of the three answers. */
  readonly claim: ClaimState;
  readonly env?: SignupEnv;
}): SignupDecision {
  const env = input.env ?? process.env;
  const mode = signupMode(env);

  if (mode === "closed") return { allowed: false, reason: "closed" };
  if (mode === "open") return { allowed: true };

  // The whole reason `claim` is not a boolean. A database that did not answer
  // used to arrive here as `false` — indistinguishable from a genuinely empty
  // accounts table — and opened registration to whoever asked during the blip.
  // An unanswerable question fails closed.
  if (input.claim === "unknown") return { allowed: false, reason: "unavailable" };

  // claim: the first account on a fresh install is how someone takes it over.
  if (input.claim === "unclaimed") return { allowed: true };

  const email = input.email.trim().toLowerCase();
  if (email && allowedEmails(env).includes(email)) return { allowed: true };

  const code = env.STEVE_SIGNUP_INVITE_CODE?.trim();
  const provided = input.inviteCode?.trim();
  if (code && provided && secretEquals(provided, code)) return { allowed: true };

  return { allowed: false, reason: "invite_required" };
}
