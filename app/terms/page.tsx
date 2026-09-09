import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/site";
import { Terms } from "./_components/terms";

export const metadata: Metadata = marketingMetadata({
  path: "/terms",
  title: "Términos — senka",
  description:
    "Condiciones de uso de senka: qué se te licencia, qué responsabilidades quedan de tu lado al autoalojarlo, y qué cubre el soporte.",
});

export default function TermsPage() {
  return <Terms />;
}
