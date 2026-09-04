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
  /**
   * The response headers every page and route gets.
   *
   * There were none. Caddy adds none of these either (it does not send HSTS
   * on its own), so the deployed app shipped without clickjacking protection,
   * without MIME-sniffing protection, without a referrer policy, and with the
   * browser free to fall back to plaintext on a later visit.
   *
   * No `Content-Security-Policy` here on purpose, and it is the one worth
   * explaining. A useful CSP for this app needs a nonce threaded through the
   * Next runtime's inline scripts, plus allowances for the model providers,
   * ElevenLabs' WebRTC, Monaco's workers and the R3F scenes on the landing
   * page. Shipping `default-src 'self' 'unsafe-inline' 'unsafe-eval'` to be
   * able to say the app "has a CSP" buys nothing and reads as though it does.
   * The two routes that serve operator-uploaded bytes — the logo and the media
   * library — set their own strict per-response CSP, which is where the actual
   * injection risk lives; a document-wide policy is tracked as follow-up work.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Two years, on the domain and its subdomains. Caddy terminates TLS
          // for every environment that has a domain at all; the pre-domain
          // `:80` smoke-test block in the Caddyfile never sees this because a
          // browser ignores HSTS over plain HTTP.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // The media and logo routes serve bytes someone uploaded. Declared
          // type only, no sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // `frame-ancestors` is the modern half; X-Frame-Options is what
          // older browsers read. Nothing here is meant to be embedded.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Paths carry ids (a form slug, a media id, a contact); a full URL
          // does not need to travel to whatever a customer's message links to.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app asks for the microphone on the voice pages, same-origin.
          // Everything else is off, including for embedded frames.
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), interest-cohort=(), microphone=(self), payment=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },

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
