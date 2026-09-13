import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/site";
import { Landing } from "./_components/landing";

export const metadata: Metadata = marketingMetadata({
  path: "/",
  title: "senka — el sistema de atención para tu negocio y tus agentes",
  description:
    "Gestiona WhatsApp, Instagram y Meta Ads con agentes de IA y atención humana. Elige un plan alojado o instala Senka en tu infraestructura con Enterprise.",
});

export default function LandingPage() {
  return <>
    {/* Discover the above-the-fold fonts with the HTML, not after downloading
        and parsing the shared application stylesheet. */}
    <link rel="preload" href="/fonts/cooper/CooperLtBT_400-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    <link rel="preload" href="/fonts/inter/InterVariable-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Senka",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "Agentes de IA, conversaciones y automatizaciones para WhatsApp, Instagram y Meta Ads. Planes alojados y licencia Enterprise.",
    }).replace(/</g, "\\u003c") }} />
    <Landing />
  </>;
}
