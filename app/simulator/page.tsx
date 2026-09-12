import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/site";
import { Simulator } from "./_components/simulator";

export const metadata: Metadata = marketingMetadata({
  path: "/simulator",
  title: "Simulador — ¿qué plan le queda a tu negocio? — senka",
  description:
    "Respondé 5 preguntas sobre tu volumen de mensajes, llamadas, canales y equipo, y el simulador te recomienda el plan ideal con métricas de 0 a 100.",
});

export default function SimulatorPage() {
  return <Simulator />;
}
