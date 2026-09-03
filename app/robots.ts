import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Only the marketing surface is meant to be indexed. Everything else in this
 * app is someone's inbox, their contacts, their campaign spend and their model
 * keys — pages that are behind whatever auth the operator puts in front of the
 * deployment, and that have no business being crawled even when they are not.
 *
 * So the rule is deny-by-default with an explicit allowlist, rather than a
 * disallow list that has to be remembered every time a page is added.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // `/$` and not `/`: the home page is the landing page (rewritten to
      // `/landing` internally), and a bare `/` here would re-allow the whole
      // app the `disallow` below exists to keep out. The anchored form matches
      // the root and nothing under it.
      allow: ["/$", "/pricing", "/terms", "/privacy"],
      disallow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
