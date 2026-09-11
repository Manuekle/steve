import type { Metadata } from "next";
import { legalMetadata } from "@/lib/legal";
import { Privacy } from "./_components/privacy";

export const metadata: Metadata = legalMetadata("/privacy", "Política de privacidad",
  "Cómo trata Senka los datos personales en sus planes alojados y Enterprise: finalidades, proveedores, conservación y derechos de privacidad.");

export default function PrivacyPage() {
  return <Privacy />;
}
