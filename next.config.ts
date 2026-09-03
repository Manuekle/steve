import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // Self-contained server bundle under .next/standalone — what the `web`
  // target in Dockerfile copies into its runtime image. Additive: `next
  // start` and the existing systemd path still work unchanged, this only
  // adds the extra output alongside the normal build.
  output: "standalone",
  // A redirect must never name the destination of one of the rewrites below.
  //
  // `next dev` runs redirects once, before the rewrites, so a redirect from
  // `/landing` and a rewrite to `/landing` coexist there. Vercel's router does
  // not: a `beforeFiles` rewrite updates the path and the remaining rules are
  // matched against the *new* path, so `/` was rewritten to `/landing` and
  // then redirected back to `/` — the deployed home page was an infinite
  // redirect loop while localhost served it fine.
  //
  // So the two mirrored pairs are gone. `/landing` and `/chats` still answer,
  // as the internal paths behind `/` and `/history`; the landing page's
  // canonical already points at `/` (marketingMetadata in lib/site.ts) and
  // `/chats` is behind the session gate, so neither is a URL anyone reaches.
  async redirects() {
    return [
      // `:path+`, not `:path*`: the star form also matches bare `/landing`,
      // which is exactly the rewrite destination that caused the loop.
      { source: "/landing/:path+", destination: "/:path+", permanent: true },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/landing" },
        { source: "/chat", destination: "/" },
        { source: "/history", destination: "/chats" },
        { source: "/history/:path*", destination: "/chats/:path*" },
      ],
    };
  },
};

export default process.env.EVE_SELF_HOSTED === "1" ? nextConfig : withEve(nextConfig);
