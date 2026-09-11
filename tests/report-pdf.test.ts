import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { ChartSpec, ReportSpec } from "@/lib/artifacts";
import { chartSeriesNames, chartSpecToMermaid } from "@/lib/chart-mermaid";
import { PRINT_COLORS, PRINT_SERIES } from "@/lib/mermaid-svg";
import { renderChartSvg, renderReport } from "@/lib/report-pdf";

/**
 * The report's two exports, held to the things that break silently.
 *
 * A PDF that comes back in the wrong font, or with a chart missing, still
 * comes back — the download succeeds and nobody finds out until somebody
 * forwards it. So the checks here are about the joins between the pieces
 * rather than about the drawing: that the Mermaid source is shaped the way
 * `beautiful-mermaid`'s parser expects, that the SVG it produces is still the
 * handful of elements `report-pdf-chart.ts` knows how to translate, and that
 * the embedded fonts are the three the document is designed in.
 */

const CHART: ChartSpec = {
  currency: "ARS",
  format: "currency",
  kind: "column",
  note: "Marzo concentra el 41 % del año.",
  series: [
    {
      name: "Ganado",
      points: [
        { label: "Ene", value: 820_000 },
        { label: "Feb", value: 640_000 },
        { label: "Mar", value: 1_480_000 },
      ],
    },
  ],
  title: "Ventas cerradas por mes",
};

const SPEC: ReportSpec = {
  footnote: "Fuente: CRM interno.",
  kpis: [
    { delta: "+18 %", label: "Facturación", tone: "positive", value: "$8,4 M" },
    { delta: "-4", label: "Deals ganados", tone: "warning", value: "51" },
    { label: "Ciclo", value: "42 días" },
  ],
  period: "Enero–Septiembre 2026",
  sections: [
    {
      body: "El año viene **18 % arriba**.\n\n- Marzo explica el 41 %\n- Agosto cayó a la mitad",
      chart: CHART,
      heading: "Ventas por mes",
    },
    {
      heading: "Pipeline",
      table: {
        columns: ["Etapa", "Entraron", "Conversión"],
        rows: [
          ["Lead", "418", "72 %"],
          ["Propuesta", "112", "46 %"],
        ],
      },
    },
  ],
  summary: "El año está 18 % arriba en facturación.",
  title: "Informe comercial 2026",
};

describe("chartSpecToMermaid", () => {
  it("emits categories the parser hands back whole", () => {
    const source = chartSpecToMermaid({
      ...CHART,
      series: [
        {
          name: "Ganado",
          points: [
            { label: 'Ads, Meta ["retargeting"]', value: 10 },
            { label: "Orgánico", value: 4 },
          ],
        },
      ],
    });
    // `beautiful-mermaid` splits on "," and never unquotes, so a comma or a
    // bracket inside a label would silently become another category.
    const categories = source.match(/x-axis \[([^\]]+)\]/)?.[1];
    expect(categories).toBe("Ads Meta retargeting, Orgánico");
    expect(source).not.toContain('["');
  });

  it("plots large figures in a named magnitude", () => {
    const source = chartSpecToMermaid(CHART);
    // Raw pesos would print `1600000` down the axis.
    expect(source).toContain('y-axis "ARS · millones"');
    expect(source).toContain("bar [0.82, 0.64, 1.48]");
  });

  it("folds a long tail into one Otros bar", () => {
    const source = chartSpecToMermaid({
      ...CHART,
      currency: undefined,
      format: "percent",
      kind: "pie",
      series: [
        {
          name: "Share",
          points: [40, 20, 14, 10, 8, 5, 3].map((value, index) => ({
            label: `C${index}`,
            value,
          })),
        },
      ],
    });
    // Seven slices, six bars, and they still add up to 100.
    expect(source).toContain("x-axis [C0, C1, C2, C3, C4, Otros]");
    expect(source).toContain("bar [40, 20, 14, 10, 8, 8]");
  });

  it("ranks a share chart into horizontal bars", () => {
    const source = chartSpecToMermaid({
      ...CHART,
      currency: undefined,
      format: "percent",
      kind: "donut",
      series: [
        {
          name: "Share",
          points: [
            { label: "B", value: 10 },
            { label: "A", value: 40 },
            { label: "C", value: 5 },
          ],
        },
      ],
    });
    expect(source.startsWith("xychart-beta horizontal")).toBe(true);
    expect(source).toContain("x-axis [A, B, C]");
    expect(source).toContain("bar [40, 10, 5]");
  });

  it("drops the title when the caller sets it themselves", () => {
    expect(chartSpecToMermaid(CHART, { title: false })).not.toContain("title ");
  });

  it("names the series in legend order", () => {
    expect(chartSeriesNames(CHART)).toEqual(["Ganado"]);
  });
});

describe("renderChartSvg", () => {
  it("bakes colours the PDF can read", async () => {
    const svg = await renderChartSvg(CHART);
    // A `var()` here would reach the translator as an unresolvable colour.
    expect(svg).toContain(`--xychart-color-0: ${PRINT_SERIES[0]}`);
    expect(svg).not.toContain("var(--diagram-series-0");
    expect(svg).toContain(PRINT_COLORS.fg);
  });

  it("emits only the elements the translator knows", async () => {
    const svg = await renderChartSvg(CHART);
    const body = svg.replace(/<style>[\s\S]*?<\/style>/g, "");
    const tags = new Set([...body.matchAll(/<([a-zA-Z][\w-]*)\b/g)].map((match) => match[1]!));
    expect([...tags].sort()).toEqual(["circle", "path", "svg", "text"]);
  });

  it("puts the real series names in the legend", async () => {
    const svg = await renderChartSvg({
      ...CHART,
      series: [
        { name: "Abiertos", points: [{ label: "Ene", value: 12 }] },
        { name: "Perdidos", points: [{ label: "Ene", value: 4 }] },
      ],
    });
    expect(svg).toContain(">Abiertos<");
    expect(svg).toContain(">Perdidos<");
    expect(svg).not.toMatch(/>Bar \d</);
  });
});

describe("renderReport", () => {
  it("embeds Cooper, Inter and Geist Mono, and nothing else", async () => {
    const faces = await baseFonts(await renderReport(SPEC));
    // A face missing here is an export that silently fell back to a standard
    // font, which is the one failure a successful download hides.
    expect(faces.some((name) => name.includes("Cooper"))).toBe(true);
    expect(faces.some((name) => name.includes("Inter"))).toBe(true);
    expect(faces.some((name) => name.includes("GeistMono"))).toBe(true);
    expect(faces.some((name) => name.includes("Helvetica"))).toBe(false);
  });

  it("produces a multi-page document", async () => {
    const bytes = await renderReport(SPEC);
    expect(bytes.byteLength).toBeGreaterThan(20_000);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
});

/** Every `/BaseFont` in the produced file — the names the reader will resolve. */
async function baseFonts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const names: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const base = object.get(PDFName.of("BaseFont"));
    if (base instanceof PDFName) names.push(base.asString());
  }
  return names;
}
