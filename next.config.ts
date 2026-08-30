import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // Self-contained server bundle under .next/standalone — what the `web`
  // target in Dockerfile copies into its runtime image. Additive: `next
  // start` and the existing systemd path still work unchanged, this only
  // adds the extra output alongside the normal build.
  output: "standalone",
  async redirects() {
    return [
      { source: "/landing", destination: "/", permanent: true },
      { source: "/landing/:path*", destination: "/:path*", permanent: true },
      { source: "/chats", destination: "/history", permanent: true },
      { source: "/chats/:path*", destination: "/history/:path*", permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: "/history", destination: "/chats" },
      { source: "/history/:path*", destination: "/chats/:path*" },
      { source: "/chat", destination: "/" },
      { source: "/", destination: "/landing" },
    ];
  },
};

export default process.env.EVE_SELF_HOSTED === "1" ? nextConfig : withEve(nextConfig);
