import { LegalDocument } from "@/app/landing/_components/legal-document";
import { legalMetadata } from "@/lib/legal";

export const metadata = legalMetadata("/privacy-rights", "Tus derechos de privacidad",
  "Cómo ejercer tus derechos sobre datos personales en Senka: consultas, rectificación, supresión y plazos en Colombia y otros territorios aplicables.");

export default function PrivacyRightsPage() {
  return <LegalDocument document="rights" />;
}
