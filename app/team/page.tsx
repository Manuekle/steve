import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/site";
import { Team } from "./_components/team";

export const metadata: Metadata = marketingMetadata({
  path: "/team",
  title: "Equipo — senka",
  description:
    "Conoce al equipo que está construyendo senka para hacer más claro y humano el trabajo de atención.",
});

export default function TeamPage() {
  return <Team />;
}
