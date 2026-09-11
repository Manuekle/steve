"use client";

import type { EveDynamicToolPart } from "eve/react";
import type { ChartSpec, ReportSpec } from "@/lib/artifacts";
import { ChartArtifact } from "./chart-artifact";
import { ReportArtifact } from "./report-artifact";

/**
 * The two tool calls the chat draws instead of printing.
 *
 * Every other tool renders as the collapsed terminal disclosure in
 * `agent-message.tsx`: a name, a status, and its JSON. That is the right shape
 * for `upsert_contact` — evidence that something happened, folded away once it
 * has. It is the wrong shape for a chart, where the payload *is* the answer,
 * and a chart shown as `{"series":[{"points":[{"label":"Ene"...` is a chart
 * nobody drew.
 *
 * ## Why the spec comes from `part.input`
 *
 * `chart` and `report` are renderers: the model passes the finished spec as
 * arguments and the tool returns one line of acknowledgement. Reading the spec
 * back out of the *input* rather than echoing it through the output halves what
 * a drawn chart costs in the model's context, which is the difference between
 * a conversation that can hold six charts and one that can hold three.
 *
 * The input is safe to read because Eve validates tool arguments against
 * `inputSchema` before `execute` runs, and this only renders once the call has
 * returned `ok: true` — so a spec that reached here has been through
 * `chartSpecSchema`. The guards below are shape checks against a malformed
 * *stream*, not a second validation pass; re-running Zod in the browser would
 * ship the whole validator to render a bar chart.
 */

const ARTIFACT_TOOLS = new Set(["chart", "report"]);

/** Whether this part will render as an artifact, so the caller can skip its terminal block. */
export function isArtifactPart(part: EveDynamicToolPart): boolean {
  return (
    ARTIFACT_TOOLS.has(part.toolName) &&
    part.state === "output-available" &&
    succeeded(part.output) &&
    (part.toolName === "chart" ? asChartSpec(part.input) : asReportSpec(part.input)) !== null
  );
}

export function ToolArtifact({ part }: { readonly part: EveDynamicToolPart }) {
  if (part.state !== "output-available" || !succeeded(part.output)) return null;

  if (part.toolName === "chart") {
    const spec = asChartSpec(part.input);
    return spec ? <ChartArtifact spec={spec} /> : null;
  }
  if (part.toolName === "report") {
    const spec = asReportSpec(part.input);
    return spec ? <ReportArtifact spec={spec} /> : null;
  }
  return null;
}

/**
 * A tool that refuses off the console answers `{ ok: false, error }`, and that
 * refusal is a message for the model, not a document for the operator.
 */
function succeeded(output: unknown): boolean {
  return isRecord(output) && output.ok === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asChartSpec(input: unknown): ChartSpec | null {
  if (!isRecord(input)) return null;
  if (typeof input.kind !== "string" || typeof input.title !== "string") return null;
  if (!Array.isArray(input.series) || input.series.length === 0) return null;
  const seriesOk = input.series.every(
    (series) => isRecord(series) && typeof series.name === "string" && Array.isArray(series.points),
  );
  return seriesOk ? (input as unknown as ChartSpec) : null;
}

function asReportSpec(input: unknown): ReportSpec | null {
  if (!isRecord(input)) return null;
  if (typeof input.title !== "string" || typeof input.summary !== "string") return null;
  if (!Array.isArray(input.sections) || input.sections.length === 0) return null;
  const sectionsOk = input.sections.every(
    (section) => isRecord(section) && typeof section.heading === "string",
  );
  return sectionsOk ? (input as unknown as ReportSpec) : null;
}
