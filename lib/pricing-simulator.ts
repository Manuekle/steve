// Estimador del simulador de pricing: de respuestas del cuestionario a plan recomendado.
//
// Entrada = lo que el visitante sabe (mensajes/día, llamadas/mes, canales,
// tamaño de equipo). Salida = lo que necesita para decidir (mensajes/mes,
// créditos estimados, horas ahorradas, plan + 4 métricas 0-100 estilo Lighthouse).
//
// Sin precios aquí: el importe vive en `lib/plans.ts`. Este módulo solo dice
// qué plan encaja y por qué, no cuánto cuesta.

import type { PlanId } from "./plans";

export type BusinessSize = "small" | "medium" | "large";

export type SimulatorInput = {
  readonly dailyMessages: number;
  readonly monthlyCalls: number;
  readonly channels: number;
  readonly teamSize: number;
  readonly needsAutomation: boolean;
};

export type GaugeKey = "volume" | "automation" | "coverage" | "fit";

export type SimulatorResult = {
  readonly monthlyMessages: number;
  readonly estimatedCredits: number;
  readonly hoursSaved: number;
  readonly recommended: PlanId;
  readonly businessSize: BusinessSize;
  readonly gauges: Record<GaugeKey, number>;
};

const clamp100 = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

function sizeFor(monthlyMessages: number, teamSize: number, monthlyCalls: number): BusinessSize {
  const score = monthlyMessages + monthlyCalls * 8 + teamSize * 120;
  if (score >= 20000 || monthlyCalls >= 150 || teamSize > 20) return "large";
  if (score >= 6000 || monthlyCalls >= 40 || teamSize > 5) return "medium";
  return "small";
}

/**
 * Reglas de recomendación, calibradas contra los créditos incluidos:
 * Pro = 100K/mes, Managed = 500K/mes. ~12 créditos por mensaje con
 * contexto + ~180 por minuto de voz. Enterprise cuando el volumen supera
 * Managed, el equipo pasa de 20 o hay necesidad de infra propia.
 */
export function recommendPlan(input: SimulatorInput): SimulatorResult {
  const monthlyMessages = Math.round(input.dailyMessages * 30);
  const estimatedCredits = Math.round(monthlyMessages * 12 + input.monthlyCalls * 900);
  // ~3 min por mensaje manual, el agente resuelve ~75% solo.
  const hoursSaved = Math.round(((monthlyMessages * 3) / 60) * 0.75);

  const businessSize = sizeFor(monthlyMessages, input.teamSize, input.monthlyCalls);

  const recommended: PlanId =
    businessSize === "large" || estimatedCredits > 500_000
      ? "enterprise"
      : businessSize === "medium" || estimatedCredits > 100_000 || input.teamSize > 5
        ? "managed"
        : "pro";

  // Gauges 0-100 estilo Lighthouse: verde 90+, ámbar 50-89, rojo <50.
  const capacity = recommended === "pro" ? 100_000 : recommended === "managed" ? 500_000 : Number.MAX_SAFE_INTEGER;
  const volume =
    recommended === "enterprise"
      ? 96
      : clamp100(100 - Math.max(0, (estimatedCredits / capacity) * 55));
  const automation = clamp100(
    42 + input.channels * 8 + (input.needsAutomation ? 18 : 0) + Math.min(22, input.dailyMessages / 18),
  );
  const coverage = clamp100(
    55 + input.channels * 11 + (input.monthlyCalls > 0 ? 8 : 0) + (businessSize === "small" ? 6 : 2),
  );
  const fit = clamp100(
    recommended === "pro"
      ? 92 - Math.max(0, (estimatedCredits / 100_000) * 25)
      : recommended === "managed"
        ? 88 - Math.max(0, ((estimatedCredits - 100_000) / 400_000) * 20)
        : 94,
  );

  return {
    monthlyMessages,
    estimatedCredits,
    hoursSaved,
    recommended,
    businessSize,
    gauges: { volume, automation, coverage, fit },
  };
}

export function gaugeColor(score: number): string {
  if (score >= 90) return "var(--gauge-good, #0cce6b)";
  if (score >= 50) return "var(--gauge-ok, #ffa400)";
  return "var(--gauge-bad, #ff4e42)";
}
