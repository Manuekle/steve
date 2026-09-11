import type { ChartSpec } from "./artifacts";

/**
 * A `ChartSpec` as Mermaid `xychart-beta` source.
 *
 * The console used to draw its charts with a bespoke SVG component. Two chart
 * engines in one product is one too many — they disagree about type size, tick
 * density and what a bar looks like, and the disagreement is visible the
 * moment a chart sits under a reply that contains a diagram. So every chart is
 * Mermaid now, drawn by the same `beautiful-mermaid` call as every ```mermaid
 * fence (`lib/mermaid-svg.ts`), on screen and on paper both.
 *
 * The syntax is documented at https://agents.craft.do/mermaid, and the parser
 * that has to accept it is `beautiful-mermaid`'s, which is stricter than the
 * docs in two ways this file has to respect:
 *
 *   - Category labels are split on `,` and **not** unquoted. `[Q1, Q2]` gives
 *     `Q1`, `Q2`; `["Q1", "Q2"]` gives `"Q1"`, `"Q2"` — quotes and all. So
 *     labels go in bare, with the delimiters stripped out of them.
 *   - `title` and the axis titles are the opposite: quoted, and the quotes are
 *     part of the pattern. A `"` inside one ends the string early.
 *
 * `xychart` draws bars and lines. It has no pie, so a `pie`/`donut` spec is
 * ranked into horizontal bars — the same question ("what share is each of
 * these") answered in the form that reads better on a page anyway.
 */

/** Mermaid's own ceiling is higher; this is the point where a legend stops fitting. */
const MAX_SERIES = 4;
/** Past six slices a pie is a list, and this renders it as one. */
const MAX_SHARE_SLICES = 6;

export type ChartMermaidOptions = {
  /**
   * Draw the title inside the chart. Off in a report, where the title is set
   * in Cooper above the SVG — `xychart` sets its own in Inter at a fixed size,
   * and a document with two heading faces in it looks like two documents.
   */
  readonly title?: boolean;
};

export function chartSpecToMermaid(spec: ChartSpec, options: ChartMermaidOptions = {}): string {
  const horizontal = spec.kind === "bar" || isShare(spec);
  const mark = spec.kind === "line" || spec.kind === "area" ? "line" : "bar";
  const series = seriesFor(spec);
  const labels = unionLabels(series);
  const values = series.flatMap((one) => labels.map((label) => valueAt(one, label)));

  const scale = magnitudeOf(values);
  const [min, max] = niceRange(values.map((value) => value / scale.divisor));
  const axisTitle = [unitLabel(spec), scale.word].filter(Boolean).join(" · ");

  return [
    `xychart-beta${horizontal ? " horizontal" : ""}`,
    ...(options.title === false ? [] : [`  title "${quotable(spec.title)}"`]),
    `  x-axis [${thinLabels(labels, horizontal).join(", ")}]`,
    `  y-axis ${axisTitle ? `"${quotable(axisTitle)}" ` : ""}${min} --> ${max}`,
    ...series.map(
      (one) =>
        `  ${mark} [${labels
          .map((label) => round(valueAt(one, label) / scale.divisor))
          .join(", ")}]`,
    ),
  ].join("\n");
}

/**
 * The order of magnitude to plot in, named on the axis.
 *
 * `xychart` prints its tick labels raw: a chart of pesos comes out with
 * `1600000` down the left, which is a number nobody reads and a column of
 * digits wide enough to eat the plot. Dividing the data and saying so on the
 * axis is the same move a printed chart makes, and it is the only one
 * available — there is no format directive in the syntax.
 *
 * The floor is 10 000 rather than 1 000, so a chart that tops out at 5 200
 * keeps its real numbers instead of being redrawn as "5,2 miles".
 */
function magnitudeOf(values: readonly number[]): { divisor: number; word: string } {
  const peak = Math.max(0, ...values.map((value) => Math.abs(value)));
  if (peak >= 1e9) return { divisor: 1e9, word: "miles de millones" };
  if (peak >= 1e6) return { divisor: 1e6, word: "millones" };
  if (peak >= 1e4) return { divisor: 1e3, word: "miles" };
  return { divisor: 1, word: "" };
}

/**
 * What the legend should say, in the order `xychart` lays its items out.
 *
 * The renderer numbers them — "Bar 1", "Line 2" — because the syntax has
 * nowhere to put a series name. `relabelLegend` puts the real ones back.
 */
export function chartSeriesNames(spec: ChartSpec): readonly string[] {
  return seriesFor(spec).map((one) => one.name);
}

// ── Shape ───────────────────────────────────────────────────────────

function isShare(spec: ChartSpec): boolean {
  return spec.kind === "pie" || spec.kind === "donut";
}

/**
 * The series as they should be plotted.
 *
 * A share chart is one series ranked biggest-first, because that is the
 * reading a pie was standing in for. Past six the tail is summed into one
 * "Otros" bar rather than cut: a share chart whose slices no longer add up to
 * the whole is a chart that lies, and it lies quietly — the bars all still
 * look right.
 *
 * Everything else is passed through, capped at four series — a fifth line is
 * not a chart anybody reads.
 */
const TAIL_LABEL = "Otros";

function seriesFor(spec: ChartSpec): ChartSpec["series"] {
  if (!isShare(spec)) return spec.series.slice(0, MAX_SERIES);
  const first = spec.series[0];
  if (!first) return [];

  const ranked = [...first.points].sort((a, b) => b.value - a.value);
  if (ranked.length <= MAX_SHARE_SLICES) return [{ name: first.name, points: ranked }];

  const head = ranked.slice(0, MAX_SHARE_SLICES - 1);
  const tail = ranked.slice(MAX_SHARE_SLICES - 1);
  return [
    {
      name: first.name,
      points: [
        ...head,
        { label: TAIL_LABEL, value: tail.reduce((sum, point) => sum + point.value, 0) },
      ],
    },
  ];
}

function unionLabels(series: ChartSpec["series"]): string[] {
  const seen = new Set<string>();
  for (const one of series) for (const point of one.points) seen.add(point.label);
  return [...seen];
}

function valueAt(series: ChartSpec["series"][number], label: string): number {
  return series.points.find((point) => point.label === label)?.value ?? 0;
}

/**
 * The axis carries the unit, because the tick labels cannot.
 *
 * `xychart` prints raw numbers on the value axis — there is no format
 * directive and no hook to add one. Naming the unit once on the axis is what
 * keeps `1200` from being read as pesos when it is percent.
 */
function unitLabel(spec: ChartSpec): string | undefined {
  if (spec.format === "currency" && spec.currency) return spec.currency;
  if (spec.format === "percent") return "%";
  return undefined;
}

// ── Numbers ─────────────────────────────────────────────────────────

/**
 * An axis range with round numbers at both ends.
 *
 * Left alone, the parser derives one by padding the data by 10 %, which puts
 * the top tick at 122.4 and prints it. Rounding out to a 1/2/5 step means the
 * renderer's own tick pass lands on whole numbers, and the bars still reach
 * most of the way up the plot.
 */
function niceRange(values: readonly number[]): readonly [number, number] {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const step = niceStep(span / 5);
  return [round(Math.floor(min / step) * step), round(Math.ceil(max / step) * step || step)];
}

function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
  const residual = raw / magnitude;
  if (residual <= 1.5) return magnitude;
  if (residual <= 3) return 2 * magnitude;
  if (residual <= 7) return 5 * magnitude;
  return 10 * magnitude;
}

/** `parseFloat` on the other side, so no separators and no exponent. */
function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

// ── Text ────────────────────────────────────────────────────────────

/**
 * Roughly the most tick labels that fit across an A4 column without touching.
 */
const MAX_AXIS_LABELS = 9;

/**
 * Every category, with the ones that will not fit blanked out.
 *
 * `xychart` prints every label it is given and does no thinning of its own, so
 * twenty-six weeks came out as `S21S22S23S24S25S26` — a smear along the axis.
 * Blanking rather than dropping keeps one slot per data point, which is what
 * the bars and the line are positioned against.
 *
 * Only on a vertical chart. There the axis is time or an ordering, and a
 * reader interpolates the gaps without being told. A horizontal chart's
 * categories are *names* — thinning those leaves bars nobody can identify — and
 * each one has its own band, so they have room anyway.
 */
function thinLabels(labels: readonly string[], horizontal: boolean): string[] {
  const every =
    horizontal || labels.length <= MAX_AXIS_LABELS
      ? 1
      : Math.ceil(labels.length / MAX_AXIS_LABELS);
  const last = labels.length - 1;
  return labels.map((label, index) => {
    // The last one always prints — an axis that stops naming things two ticks
    // before the end looks truncated — and whatever would have landed next to
    // it gives way, or the two collide (`S25S26`).
    const shown = index === last || (index % every === 0 && last - index >= every);
    return shown ? bareLabel(label) : " ";
  });
}

/**
 * A category label the parser will hand back whole.
 *
 * `,` ends the label, `]` ends the list, and a `"` survives into the drawn
 * text because nothing unquotes it. Newlines would split the statement.
 */
function bareLabel(label: string): string {
  return (
    label
      .replace(/[,[\]"\n\r]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24) || "—"
  );
}

/** A quoted string the pattern will not end early. */
function quotable(value: string): string {
  return value.replace(/["\n\r]+/g, " ").replace(/\s+/g, " ").trim();
}
