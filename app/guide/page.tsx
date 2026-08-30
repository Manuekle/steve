import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/site";
import { Guide } from "./_components/guide";

export const metadata: Metadata = marketingMetadata({
  path: "/guide",
  title: "Instalación y configuración — steve",
  description:
    "Qué hace falta para instalar steve, cómo arrancarlo en tu máquina, y dónde configurar cada canal, agente, base de conocimiento y automatización una vez que está corriendo.",
});

export default function GuidePage() {
  return <Guide />;
}
