import { listAgents } from "@/lib/business-store";

export type MentionableAgent = {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  readonly description: string;
  readonly type: "subagent" | "custom";
  readonly role?: string;
  readonly systemPrompt?: string;
};

export const BUILTIN_SUBAGENTS: readonly MentionableAgent[] = [
  {
    id: "analista",
    handle: "analista",
    name: "Analista",
    description: "Analiza números del negocio: pipeline, conversión, márgenes y métricas.",
    type: "subagent",
    role: "Analista de Negocio y Datos",
  },
  {
    id: "redactor",
    handle: "redactor",
    name: "Redactor",
    description: "Escribe textos cuidados: propuestas comerciales, secuencias y copies.",
    type: "subagent",
    role: "Redactor Comercial",
  },
  {
    id: "revisor",
    handle: "revisor",
    name: "Revisor",
    description: "Revisa textos y verifica precios, políticas y coherencia antes de enviar.",
    type: "subagent",
    role: "Control de Calidad",
  },
];

export async function getMentionableAgents(): Promise<MentionableAgent[]> {
  try {
    const businessAgents = await listAgents();
    const customAgents: MentionableAgent[] = businessAgents
      .filter((a) => a.status === "active" || !a.status)
      .map((a) => ({
        id: a.id,
        handle: a.name.toLowerCase().replace(/[^a-z0-9_]/gi, "_"),
        name: a.name,
        description: a.description || "Agente del negocio",
        type: "custom" as const,
        role: a.name,
        systemPrompt: a.systemPrompt,
      }));

    return [...BUILTIN_SUBAGENTS, ...customAgents];
  } catch {
    return [...BUILTIN_SUBAGENTS];
  }
}
