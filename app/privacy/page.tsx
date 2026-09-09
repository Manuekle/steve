import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/site";
import { Privacy } from "./_components/privacy";

export const metadata: Metadata = marketingMetadata({
  path: "/privacy",
  title: "Privacidad — senka",
  description:
    "Qué datos guarda senka, dónde viven y qué sale de tu servidor. La aplicación es autoalojada: las conversaciones quedan en tu propia base de datos.",
});

export default function PrivacyPage() {
  return <Privacy />;
}
