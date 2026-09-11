import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/site";
import { Pricing } from "./_components/pricing";

export const metadata: Metadata = marketingMetadata({
  path: "/pricing",
  title: "Precios — senka",
  description:
    "Compara Pro y Managed, los planes alojados de Senka, y Enterprise, la licencia de pago único para tu infraestructura. Consulta precios y facturación anual.",
});

export default function PricingPage() {
  return <Pricing />;
}
