/**
 * Where this installation is served from.
 *
 * Absolute URLs are needed for canonicals and for the Open Graph tags, and a
 * self-hosted app has no way to know its own origin at build time — so it is
 * configured, with the two places that do know it as fallbacks: `VERCEL_URL`
 * when deployed on Vercel, and localhost when nothing is set.
 *
 * Set `NEXT_PUBLIC_SITE_URL` in production. Getting it wrong does not break
 * the app; it makes shared links preview the wrong host.
 */
export const SITE_URL: string = (() => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
})();

/** True once the origin has actually been configured for a real deployment. */
export const SITE_URL_IS_CONFIGURED =
  Boolean(process.env.NEXT_PUBLIC_SITE_URL) || Boolean(process.env.VERCEL_URL);

export const SITE_NAME = "steve";

/**
 * The card rendered by `app/opengraph-image.tsx`.
 *
 * Named explicitly rather than left to the file convention. Next attaches
 * that file automatically only where no `openGraph` object of its own is
 * exported — and every marketing page exports one, for its own title and
 * canonical, so all four would ship without an image. Verified: `/` picks the
 * file up on its own, `/landing` did not until this was added.
 *
 * `metadataBase` below turns the relative path into an absolute URL, which is
 * what crawlers require.
 */
const OG_IMAGE = {
  alt: "steve — el sistema de atención para tu negocio y tus agentes",
  height: 630,
  url: "/opengraph-image",
  width: 1200,
} as const;

/**
 * The Open Graph block every marketing page shares. Each page passes its own
 * `title`, `description` and `path`; everything else — the site name, the
 * locale, the image — is the same across all of them.
 */
export function marketingMetadata({
  description,
  path,
  title,
}: {
  readonly description: string;
  readonly path: string;
  readonly title: string;
}) {
  const url = `${SITE_URL}${path}`;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      description,
      images: [OG_IMAGE],
      locale: "es_AR",
      siteName: SITE_NAME,
      title,
      type: "website" as const,
      url,
    },
    twitter: {
      card: "summary_large_image" as const,
      description,
      images: [OG_IMAGE.url],
      title,
    },
  };
}
