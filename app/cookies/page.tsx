import { LegalDocument } from "@/app/landing/_components/legal-document";
import { legalMetadata } from "@/lib/legal";

export const metadata = legalMetadata("/cookies", "Cookies y preferencias",
  "Consulta el almacenamiento necesario de Senka y configura o rechaza la analítica opcional de Google Analytics y PostHog en tu navegador.");

export default function CookiesPage() {
  return <LegalDocument document="cookies" />;
}
