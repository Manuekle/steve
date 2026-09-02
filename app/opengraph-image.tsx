import { ImageResponse } from "next/og";

/**
 * The card that shows up when someone pastes a link to this installation.
 *
 * Built out of the same pieces as the landing — the app's near-black ground,
 * one hairline, the two-tone wordmark — so the preview and the page it opens
 * read as the same product.
 *
 * No `fonts` option, deliberately. The app's own faces cannot be used here:
 * satori reads TTF/OTF/WOFF and the Inter files are woff2, and it throws
 * outright parsing `SaansVF.ttf` ("Cannot read properties of undefined").
 * Left unset, `next/og` falls back to the Geist Regular it ships inside
 * `next/dist/compiled/@vercel/og` — a local file, so a self-hosted server
 * with no egress still renders the card. The trade is real and worth naming:
 * this is the one surface whose type is not the product's own.
 *
 * Only one weight exists in that fallback, so the hierarchy here is carried
 * by size and colour rather than by weight.
 */
export const alt = "steve — el sistema de atención para tu negocio y tus agentes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#161616",
          color: "#ededed",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px 80px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, letterSpacing: "-0.02em" }}>
          <span style={{ color: "#6b6b6b" }}>st</span>
          <span>eve</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 74,
              letterSpacing: "-0.035em",
              lineHeight: 1.06,
              maxWidth: 900,
            }}
          >
            El sistema de atención para tu negocio y tus agentes
          </div>
          <div
            style={{
              color: "#8a8a8a",
              display: "flex",
              fontSize: 27,
              lineHeight: 1.4,
              marginTop: 30,
              maxWidth: 820,
            }}
          >
            WhatsApp, Instagram y Meta Ads en una sola bandeja. Autoalojado, con tus claves.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ background: "rgba(255,255,255,0.1)", display: "flex", height: 1, width: "100%" }} />
          <div style={{ color: "#6b6b6b", display: "flex", fontSize: 22, marginTop: 22 }}>
            Corre en tu servidor · Tu PostgreSQL · Tus claves de modelo
          </div>
        </div>
      </div>
    ),
    size,
  );
}
