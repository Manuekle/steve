import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/site";
import { Landing } from "./_components/landing";

export const metadata: Metadata = marketingMetadata({
  path: "/",
  title: "steve — el sistema de atención para tu negocio y tus agentes",
  description:
    "WhatsApp, Instagram, Messenger y Meta Ads en una sola bandeja. Los agentes responden lo que saben y te pasan el resto. Autoalojado, con tus claves y tu base de datos.",
});

export default function LandingPage() {
  return <Landing />;
}
