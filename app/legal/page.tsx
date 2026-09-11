import { LegalDocument } from "@/app/landing/_components/legal-document";
import { legalMetadata } from "@/lib/legal";

export const metadata = legalMetadata("/legal", "Aviso legal",
  "Identificación del titular de Senka, servicio operado por una persona natural en Colombia, contacto, propiedad intelectual y documentos aplicables.");

export default function LegalNoticePage() {
  return <LegalDocument document="legal" />;
}
