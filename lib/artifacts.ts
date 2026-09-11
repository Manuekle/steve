import { z } from "zod";

/**
 * The two things the agent can draw in the console instead of describing.
 *
 * A tool that answers "how did sales go this year" with three paragraphs of
 * numbers has technically answered it. Nobody reads it. The same numbers as a
 * chart with a sentence underneath get read in two seconds, and that gap is
 * the whole reason these exist.
 *
 * The shape is deliberately declarative — a spec the model fills in, not
 * markup it writes. Two reasons:
 *
 *   1. A model that emits SVG or HTML emits *some* SVG, differently every
 *      time, and the console ends up with fifteen visual languages. A spec
 *      renders through one component, so every chart in the product looks like
 *      the same product.
 *   2. A spec is checkable. `chartSpec` refuses a fifth series and a hundredth
 *      data point at the tool boundary, where the failure is a sentence the
 *      model can act on, rather than in the browser as an unreadable chart.
 *
 * Both live here rather than beside their tools because the renderer needs the
 * same types (`app/_components/chat/artifacts/`) and the PDF route needs them
 * again. Client components import them with `import type`, so Zod never
 * reaches the browser bundle.
 */

// ── Charts ──────────────────────────────────────────────────────────

/**
 * Six forms, chosen so that each answers a different question and none of them
 * overlaps another. `bar` ranks (which is biggest), `column` compares across a
 * short ordered axis, `line`/`area` show movement over time, `pie`/`donut` show
 * a share of one whole. Anything else — a gantt, a funnel, a map — is a
 * diagram, and diagrams are Mermaid fences in the reply text, not this.
 *
 * These are questions, not drawings. What each one is actually rendered as is
 * `lib/chart-mermaid.ts`'s decision, and it has bars and lines to work with:
 * `bar` and the two share forms come out as ranked horizontal bars, `column`
 * as vertical ones, `line` and `area` as a line. The enum stays six wide
 * because "share of a whole" is a thing a model means, and a schema that only
 * offered the shapes would push it towards picking the wrong one.
 */
export const CHART_KINDS = ["bar", "column", "line", "area", "pie", "donut"] as const;

export const chartValueFormats = ["number", "currency", "percent", "compact"] as const;

const chartPoint = z.object({
  label: z.string().min(1).max(60).describe("The category or time bucket, as it should be printed."),
  value: z.number().describe("The magnitude. Negative values are supported on bar, column and line."),
});

const chartSeries = z.object({
  name: z.string().min(1).max(40).describe("What this series is. Printed in the legend."),
  points: z
    .array(chartPoint)
    .min(1)
    .max(60)
    .describe("Points in the order they should be read — chronological for a time axis."),
});

export const chartSpecSchema = z.object({
  kind: z
    .enum(CHART_KINDS)
    .describe(
      "bar: ranked horizontal bars, for 'which is biggest'. column: vertical bars over a " +
        "short ordered axis. line: a trend over time. area: one trend over time, filled. " +
        "pie/donut: share of a single whole, 6 slices at most — drawn as ranked bars, " +
        "which answers the same question and reads better than a wheel of wedges.",
    ),
  title: z.string().min(1).max(90).describe("What the chart shows. A statement, not 'Chart'."),
  subtitle: z
    .string()
    .max(140)
    .optional()
    .describe("The period, the filter, the unit — whatever qualifies the title."),
  series: z
    .array(chartSeries)
    .min(1)
    .max(4)
    .describe(
      "One series for a single measure. Up to four to compare measures. Past four, " +
        "chart the top three and fold the rest into one 'Otros' series.",
    ),
  format: z
    .enum(chartValueFormats)
    .optional()
    .describe(
      "How every value is printed. currency needs `currency`. compact abbreviates " +
        "(1.2M). Defaults to number.",
    ),
  currency: z.string().length(3).optional().describe("ISO 4217, required when format=currency."),
  note: z
    .string()
    .max(220)
    .optional()
    .describe("The one thing the chart shows, in a sentence. Printed under it."),
});

export type ChartPoint = z.infer<typeof chartPoint>;
export type ChartSeries = z.infer<typeof chartSeries>;
export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type ChartKind = (typeof CHART_KINDS)[number];

// ── Reports ─────────────────────────────────────────────────────────

const reportKpi = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(30).describe("Already formatted — '$4.2M', '38 %', '12 días'."),
  delta: z
    .string()
    .max(24)
    .optional()
    .describe("Change against the comparison period, with its sign: '+18 %', '-4'."),
  tone: z
    .enum(["neutral", "positive", "warning", "critical"])
    .optional()
    .describe("What the number means, not what it is. Defaults to neutral."),
});

const reportTable = z.object({
  columns: z.array(z.string().max(40)).min(1).max(8),
  rows: z.array(z.array(z.string().max(120)).min(1).max(8)).max(60),
});

const reportSection = z.object({
  heading: z.string().min(1).max(90),
  body: z
    .string()
    .max(4000)
    .optional()
    .describe("Markdown. Paragraphs, bullets and bold — no headings, the section has one."),
  table: reportTable.optional().describe("Rows already formatted for print."),
  chart: chartSpecSchema.optional().describe("One chart illustrating this section."),
});

export const reportSpecSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(160).optional(),
  period: z
    .string()
    .max(60)
    .optional()
    .describe("What the report covers — 'Enero–Septiembre 2026'. Printed under the title."),
  summary: z
    .string()
    .min(1)
    .max(2000)
    .describe("The conclusion first, in Markdown. Somebody who reads only this should be informed."),
  kpis: z.array(reportKpi).max(6).optional().describe("The headline numbers, across the top."),
  sections: z.array(reportSection).min(1).max(10),
  footnote: z
    .string()
    .max(300)
    .optional()
    .describe("Where the numbers came from, and anything they exclude."),
});

export type ReportKpi = z.infer<typeof reportKpi>;
export type ReportTable = z.infer<typeof reportTable>;
export type ReportSection = z.infer<typeof reportSection>;
export type ReportSpec = z.infer<typeof reportSpecSchema>;
