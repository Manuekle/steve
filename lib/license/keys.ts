// Public keys the app can verify Enterprise licenses against.
//
// Only public keys live here — the private key that signs a license never
// touches this repository (see scripts/license/README.md). `keyId` lets a
// future key rotation add a new entry without invalidating licenses already
// signed with an older one: `verify.ts` looks the token's `keyId` up here
// rather than assuming a single fixed key.

export const LICENSE_PUBLIC_KEYS: Readonly<Record<string, string>> = {
  "steve-2026": `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAkpupvZFqLQO37OPViL57ba+m4WteGxwWen/3rAcCAW8=
-----END PUBLIC KEY-----
`,
  // Local-dev keypair, generated on this machine to unlock the Enterprise
  // gate for testing Settings/Setup. The matching private key lives outside
  // the repo (never committed) — swap or drop this entry before shipping.
  "steve-dev": `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEArb58YTEQeYErG+CtqP0dc1HVWAewIj70U39dGbDcSgo=
-----END PUBLIC KEY-----
`,
};
