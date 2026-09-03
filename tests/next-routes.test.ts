import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { NextConfig } from "next";

// Next compila estas reglas con su copia de path-to-regexp, que no publica
// tipos. Usarla igual es el punto: comprobar el invariante contra el mismo
// motor que produce los regexes de routes-manifest.json, no contra una
// reimplementación que podría diferir justo en el caso que importa.
const { pathToRegexp } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as { pathToRegexp: (source: string) => RegExp };

/**
 * The rule this file exists to keep: a redirect's `source` must never match
 * the `destination` of a `beforeFiles` rewrite.
 *
 * `next dev` runs the redirect phase once, before the rewrites, so a pair like
 * `rewrite / -> /landing` plus `redirect /landing -> /` behaves there. Vercel's
 * router does not work that way — a `beforeFiles` rewrite updates the path and
 * the remaining rules are matched against the *new* path, so that pair turned
 * the deployed home page into an infinite 308 loop while localhost served it
 * fine. Nothing failed at build time and nothing appeared in the logs; the
 * only tell was a response carrying both `x-nextjs-rewritten-path: /landing`
 * and `location: /`.
 *
 * A "works locally, 308 forever in production" bug is expensive to find twice,
 * and the config reads as though the pair is fine, so the invariant is checked
 * here instead of trusted. Uses Next's own path-to-regexp, which is what
 * compiles these sources into the regexes that end up in routes-manifest.json.
 */

// The plain object, without `withEve` wrapping it — same branch the Docker and
// Ansible deployments take, and the rewrites/redirects are identical either way.
process.env.EVE_SELF_HOSTED = "1";
const config = (await import("../next.config")).default as NextConfig;

type Rule = { readonly source: string; readonly destination: string };

async function localRewrites(): Promise<readonly Rule[]> {
  const rewrites = await config.rewrites!();
  const beforeFiles = Array.isArray(rewrites) ? rewrites : (rewrites.beforeFiles ?? []);
  // Proxy rewrites leave Next entirely, so no later rule can match them.
  return beforeFiles.filter((rule): rule is Rule => rule.destination.startsWith("/"));
}

describe("next.config route rules", () => {
  it("has no redirect that matches the destination of a beforeFiles rewrite", async () => {
    const redirects = (await config.redirects!()) as readonly Rule[];
    const rewrites = await localRewrites();

    const loops = rewrites.flatMap((rewrite) =>
      redirects
        // A rewrite destination is a pattern too (`/chats/:path*`); a concrete
        // request produces a concrete path, so compare on the literal prefix
        // that every expansion of it shares.
        .filter((redirect) => pathToRegexp(redirect.source).test(rewrite.destination.split("/:")[0]))
        .map((redirect) => `${rewrite.source} -> ${rewrite.destination} -> ${redirect.destination}`),
    );

    expect(loops).toEqual([]);
  });

  it("still redirects the legacy /landing subpaths", async () => {
    const redirects = (await config.redirects!()) as readonly Rule[];
    const landing = redirects.find((rule) => rule.source.startsWith("/landing"));

    expect(landing).toBeDefined();
    // `:path+` and not `:path*`: the star form also matches bare `/landing`,
    // which is the rewrite destination that caused the loop.
    expect(pathToRegexp(landing!.source).test("/landing/pricing")).toBe(true);
    expect(pathToRegexp(landing!.source).test("/landing")).toBe(false);
  });
});
