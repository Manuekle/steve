import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * The four public pages, and nothing else — the same set `robots.ts` allows.
 * The app's own routes are excluded on purpose: they are private, and listing
 * them here would undo the allowlist next to it.
 */
const PAGES: readonly { readonly path: string; readonly priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/pricing", priority: 0.8 },
  { path: "/terms", priority: 0.3 },
  { path: "/privacy", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PAGES.map((page) => ({
    changeFrequency: "monthly" as const,
    lastModified,
    priority: page.priority,
    url: `${SITE_URL}${page.path}`,
  }));
}
