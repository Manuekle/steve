import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/site";
import { Pricing } from "./_components/pricing";

export const metadata: Metadata = marketingMetadata({
  path: "/pricing",
  title: "Precios — steve",
  description:
    "steve corre en tu servidor con tus claves, así que no hay licencia ni asientos. Lo que se cobra es el soporte y el hosting, si los querés.",
});

export default function PricingPage() {
  return <Pricing />;
}
