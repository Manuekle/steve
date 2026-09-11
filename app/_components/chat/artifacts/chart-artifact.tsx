"use client";

import { useEffect, useState } from "react";
import type { ChartSpec } from "@/lib/artifacts";
import { chartSeriesNames, chartSpecToMermaid } from "@/lib/chart-mermaid";
import { relabelLegend, renderDiagramSvg } from "@/lib/mermaid-svg";
import { cn } from "@/lib/utils";

/**
 * Every chart in the console, drawn by Mermaid.
 *
 * This used to be seven hundred lines of hand-built SVG: its own axis ticks,
 * its own bar radius, its own pie wedges assembled from triangles, its own
 * hover state and a "ver tabla" toggle. It worked, and it was a second chart
 * language sitting a few centimetres below replies whose diagrams came out of
 * `beautiful-mermaid` — different type size, different tick density, different
 * answer to "does that bar reach the line". You notice it without being able
 * to say why.
 *
 * So there is one renderer now. `xychart-beta`
 * (https://agents.craft.do/mermaid) through the same call as every ```mermaid
 * fence, which also means `lib/report-pdf.ts` can draw the identical chart on
 * paper from the identical source.
 *
 * Two consequences worth naming:
 *
 *   - **No pie.** `xychart` has bars and lines. A `pie`/`donut` spec is ranked
 *     into horizontal bars by `chartSpecToMermaid` — the same question, in the
 *     form that reads better anyway.
 *   - **Hover replaces the table toggle.** The exact values used to live
 *     behind a button; `interactive` is the renderer's own tooltip, so they
 *     live on the bar.
 *
 * The title is set here rather than by `title` in the Mermaid source: headings
 * in this app are Cooper, and `xychart` would set its own in Inter.
 */
export function ChartArtifact({
  className,
  spec,
}: {
  readonly className?: string;
  readonly spec: ChartSpec;
}) {
  const svg = useChartSvg(spec);

  return (
    <figure className={cn("my-3 space-y-3", className)}>
      <figcaption className="space-y-0.5">
        <div className="font-cooper text-[15px] text-foreground leading-snug">{spec.title}</div>
        {spec.subtitle ? (
          <div className="text-[12px] text-muted-foreground">{spec.subtitle}</div>
        ) : null}
      </figcaption>

      {/* The box is reserved at the aspect the renderer produces, so the prose
          below it does not jump when the SVG arrives. */}
      <div
        aria-label={spec.title}
        className="w-full [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        role="img"
        style={svg ? undefined : { aspectRatio: "16 / 10" }}
      />

      {spec.note ? (
        <p className="max-w-[62ch] text-[12.5px] text-muted-foreground leading-relaxed">
          {spec.note}
        </p>
      ) : null}
    </figure>
  );
}

/**
 * Rendered in an effect rather than in `useMemo`.
 *
 * The renderer is synchronous underneath and fast enough to call during
 * render, but it is also the module that carries elkjs — the flowchart layout
 * engine no chart ever reaches. Keeping the call in an effect keeps it off the
 * first paint of a conversation that may contain several of these.
 */
function useChartSvg(spec: ChartSpec): string | null {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const source = chartSpecToMermaid(spec, { title: false });
    renderDiagramSvg(source, { interactive: true, padding: 4 })
      .then((rendered) => {
        if (live) setSvg(relabelLegend(rendered, chartSeriesNames(spec)));
      })
      .catch(() => {
        if (live) setSvg(null);
      });
    return () => {
      live = false;
    };
  }, [spec]);

  return svg;
}
