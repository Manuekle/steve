import { degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { PRINT_COLORS } from "./mermaid-svg";

/**
 * A Mermaid `xychart` SVG, drawn onto a PDF page.
 *
 * The report's charts are Mermaid on screen (`report-chart.tsx`), and a PDF
 * that redraws the same numbers with different arithmetic is a second chart
 * engine wearing the first one's clothes — different tick density, different
 * bar width, different answer to "does that bar reach the line". So the export
 * renders the *same source* through the *same renderer* and translates the SVG
 * it gets back.
 *
 * That is only tractable because the SVG is not arbitrary. `beautiful-mermaid`
 * emits exactly seven kinds of element for an xychart — a grid of dots, bar
 * paths, line paths, dots, text, and a legend swatch and rule — with a fixed
 * set of classes and no nesting, no gradients, no clip paths and no groups.
 * This handles those seven and ignores anything else, which is the honest
 * version of "an SVG renderer": it covers what the generator generates, and
 * `tests/report-pdf.test.ts` fails if the generator starts emitting something
 * new.
 *
 * Geometry, not layout: pdf-lib's `drawSvgPath` translates and then scales by
 * `(s, -s)`, so an SVG point `(px, py)` lands at `(x + s·px, y − s·py)` for an
 * anchor `(x, y)` placed at the SVG's top-left corner. Text is positioned by
 * the same map, by hand, because `drawText` does not take that transform.
 */

type Element = { readonly attrs: string; readonly tag: string; readonly text?: string };

export type ChartDrawing = {
  /** The SVG's own height, in its own units — multiply by `scale` for points. */
  readonly height: number;
  readonly width: number;
  readonly draw: (page: PDFPage, x: number, top: number, scale: number) => void;
};

const ELEMENT = /<(circle|path|text|rect|line)\b([^>]*?)(?:\/>|>([^<]*)<\/\1>)/g;
const COLOR_VAR = /--xychart-color-(\d+):\s*(#[0-9a-fA-F]{3,8})/g;

/**
 * Parse one xychart SVG into something that can be drawn repeatedly.
 *
 * Returns `null` for anything that is not an xychart — a flowchart in a report
 * section, say — so the caller can fall back to printing the title rather than
 * drawing half a diagram.
 */
export function parseChartSvg(svg: string, fonts: ChartFonts): ChartDrawing | null {
  const box = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!box || !svg.includes("xychart-")) return null;

  const width = Number(box[1]);
  const height = Number(box[2]);
  const series = seriesColors(svg);
  const elements = [...svg.matchAll(ELEMENT)].map(
    (match): Element => ({ attrs: match[2] ?? "", tag: match[1]!, text: match[3] }),
  );

  return {
    draw: (page, x, top, scale) => {
      drawGrid(page, elements, x, top, scale);
      for (const element of elements) drawElement(page, element, series, fonts, x, top, scale);
    },
    height,
    width,
  };
}

export type ChartFonts = { readonly bold: PDFFont; readonly regular: PDFFont };

// ── Elements ────────────────────────────────────────────────────────

/**
 * The dot grid, as one path.
 *
 * There are six hundred of these behind every chart. Six hundred `drawCircle`
 * calls is six hundred four-curve subpaths and about 120 KB of content stream
 * per chart; the same dots as square subpaths in a single filled path are a
 * tenth of that, and at the size a dot lands on an A4 page — under a point
 * across — a square and a circle are the same mark.
 */
function drawGrid(
  page: PDFPage,
  elements: readonly Element[],
  x: number,
  top: number,
  scale: number,
): void {
  const dots = elements.filter(
    (element) => element.tag === "circle" && element.attrs.includes("xychart-grid"),
  );
  if (dots.length === 0) return;

  const path = dots
    .map((dot) => {
      const cx = num(dot.attrs, "cx");
      const cy = num(dot.attrs, "cy");
      const r = num(dot.attrs, "r") || 1.5;
      return `M${cx - r} ${cy - r}h${r * 2}v${r * 2}h${-r * 2}Z`;
    })
    .join("");

  page.drawSvgPath(path, { color: mix(PRINT_COLORS.fg, PRINT_COLORS.bg, 0.12), scale, x, y: top });
}

function drawElement(
  page: PDFPage,
  element: Element,
  series: readonly RGB[],
  fonts: ChartFonts,
  x: number,
  top: number,
  scale: number,
): void {
  const { attrs, tag } = element;
  // The line's drop shadow is a 12 %-opacity copy of the line two pixels down.
  // On paper it is a smudge; pdf-lib would need a graphics-state dictionary to
  // draw it at all, so it is simply not drawn.
  if (attrs.includes("xychart-line-shadow")) return;

  const color = series[colorIndex(attrs)] ?? series[0] ?? rgb(0, 0, 0);

  if (tag === "path" && attrs.includes("xychart-bar")) {
    page.drawSvgPath(pathData(attrs), {
      borderColor: color,
      borderWidth: 1.5,
      color: barFill(color),
      scale,
      x,
      y: top,
    });
    return;
  }

  if (tag === "path" && attrs.includes("xychart-line")) {
    page.drawSvgPath(pathData(attrs), {
      borderColor: color,
      borderLineCap: 1,
      borderWidth: 2.5,
      scale,
      x,
      y: top,
    });
    return;
  }

  if (tag === "circle" && attrs.includes("xychart-dot")) {
    page.drawCircle({
      borderColor: hex(PRINT_COLORS.bg),
      borderWidth: 2 * scale,
      color,
      size: num(attrs, "r") * scale,
      x: x + num(attrs, "cx") * scale,
      y: top - num(attrs, "cy") * scale,
    });
    return;
  }

  // The legend swatch. `rx="3"` is dropped: at this scale the box is two
  // points across and the radius is smaller than the stroke.
  if (tag === "rect") {
    page.drawRectangle({
      borderColor: color,
      borderWidth: 1.5 * scale,
      color: barFill(color),
      height: num(attrs, "height") * scale,
      width: num(attrs, "width") * scale,
      x: x + num(attrs, "x") * scale,
      y: top - (num(attrs, "y") + num(attrs, "height")) * scale,
    });
    return;
  }

  if (tag === "line") {
    page.drawLine({
      color,
      end: { x: x + num(attrs, "x2") * scale, y: top - num(attrs, "y2") * scale },
      start: { x: x + num(attrs, "x1") * scale, y: top - num(attrs, "y1") * scale },
      thickness: (num(attrs, "stroke-width") || 2.5) * scale,
    });
    return;
  }

  if (tag === "text" && element.text) drawText(page, element, fonts, x, top, scale);
}

/**
 * SVG text, placed by hand.
 *
 * Three things have to be undone. `text-anchor` moves the string back along
 * its own direction by half or all of its width; `dy="0.35em"` is the trick
 * the renderer uses to centre a label on a coordinate, so the baseline goes
 * that far the other way; and the y-axis title carries `rotate(-90, x, y)`
 * about the same point it is anchored at, which in PDF's counter-clockwise
 * degrees is +90.
 *
 * Both offsets are applied along the rotated axes rather than the page's, so
 * one expression covers the flat labels and the turned one.
 */
function drawText(
  page: PDFPage,
  element: Element,
  fonts: ChartFonts,
  originX: number,
  top: number,
  scale: number,
): void {
  const { attrs } = element;
  const content = decode(element.text ?? "");
  if (!content) return;

  const size = (num(attrs, "font-size") || 14) * scale;
  const font = (num(attrs, "font-weight") || 400) >= 500 ? fonts.bold : fonts.regular;
  const rotated = /transform="rotate\(-90/.test(attrs);
  const angle = rotated ? 90 : 0;

  // Direction the text advances in, and the direction "up" from its baseline.
  const dir = rotated ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const up = rotated ? { x: -1, y: 0 } : { x: 0, y: 1 };

  const anchor = attrs.match(/text-anchor="(\w+)"/)?.[1] ?? "start";
  const width = safeWidth(font, content, size);
  const back = anchor === "middle" ? width / 2 : anchor === "end" ? width : 0;
  const shift = /dy="0\.35em"/.test(attrs) ? size * 0.35 : 0;

  const px = originX + num(attrs, "x") * scale;
  const py = top - num(attrs, "y") * scale;

  page.drawText(sanitizeFor(font, content), {
    color: textColor(attrs),
    font,
    rotate: degrees(angle),
    size,
    x: px - dir.x * back - up.x * shift,
    y: py - dir.y * back - up.y * shift,
  });
}

/**
 * The three text roles the chart uses, resolved from the class rather than
 * from the CSS variables they go through: `--_text-muted` is `var(--muted)`
 * and `--_text-sec` is too, because `PRINT_COLORS` fills in all seven roles.
 */
function textColor(attrs: string): RGB {
  if (attrs.includes("xychart-title")) return hex(PRINT_COLORS.fg);
  return hex(PRINT_COLORS.muted ?? PRINT_COLORS.fg);
}

// ── Colour ──────────────────────────────────────────────────────────

/**
 * `--xychart-color-N`, in index order.
 *
 * The caller bakes literal hex into the SVG (`PRINT_SERIES`), so this reads
 * values rather than resolving variables. A chart rendered for the screen has
 * `var(--diagram-series-0, …)` here instead and falls through to the default,
 * which is the case `renderChartSvg` in `report-pdf.ts` exists to avoid.
 */
function seriesColors(svg: string): readonly RGB[] {
  const found: RGB[] = [];
  for (const match of svg.matchAll(COLOR_VAR)) found[Number(match[1])] = hex(match[2]!);
  return found.length > 0 ? found : [hex("#3b82f6")];
}

/** `color-mix(in srgb, var(--bg) 75%, <series> 25%)`, which is what the CSS says. */
function barFill(color: RGB): RGB {
  return mixRgb(hex(PRINT_COLORS.bg), color, 0.25);
}

function colorIndex(attrs: string): number {
  return Number(attrs.match(/xychart-color-(\d+)/)?.[1] ?? 0);
}

function hex(value: string): RGB {
  const raw = value.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => char + char)
          .join("")
      : raw;
  return rgb(
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  );
}

function mix(front: string, back: string, ratio: number): RGB {
  return mixRgb(hex(back), hex(front), ratio);
}

function mixRgb(back: RGB, front: RGB, ratio: number): RGB {
  const blend = (a: number, b: number) => a * (1 - ratio) + b * ratio;
  return rgb(blend(back.red, front.red), blend(back.green, front.green), blend(back.blue, front.blue));
}

// ── Attributes ──────────────────────────────────────────────────────

function num(attrs: string, name: string): number {
  const value = attrs.match(new RegExp(`\\b${name}="(-?[\\d.]+)"`))?.[1];
  return value ? Number(value) : 0;
}

function pathData(attrs: string): string {
  return attrs.match(/\sd="([^"]*)"/)?.[1] ?? "";
}

function decode(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * pdf-lib throws on a character the embedded font cannot encode rather than
 * substituting one, and the fonts are cut to a latin range. A stray glyph in
 * an axis label must not fail the whole download.
 */
function sanitizeFor(font: PDFFont, value: string): string {
  try {
    font.widthOfTextAtSize(value, 10);
    return value;
  } catch {
    let out = "";
    for (const char of value) {
      try {
        font.widthOfTextAtSize(char, 10);
        out += char;
      } catch {
        out += "";
      }
    }
    return out;
  }
}

function safeWidth(font: PDFFont, value: string, size: number): number {
  try {
    return font.widthOfTextAtSize(value, size);
  } catch {
    return font.widthOfTextAtSize(sanitizeFor(font, value), size);
  }
}
