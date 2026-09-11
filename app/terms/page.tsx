import type { Metadata } from "next";
import { legalMetadata } from "@/lib/legal";
import { Terms } from "./_components/terms";

export const metadata: Metadata = legalMetadata("/terms", "Términos y condiciones",
  "Condiciones de Senka: planes Pro y Managed, licencia Enterprise, pagos, renovación, cancelación, uso de IA y responsabilidades.");

export default function TermsPage() {
  return <Terms />;
}
