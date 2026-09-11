import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";
import type { ReportKpi, ReportSection, ReportSpec, ReportTable } from "./artifacts";
import { chartSeriesNames, chartSpecToMermaid } from "./chart-mermaid";
import { PRINT_COLORS, PRINT_SERIES, relabelLegend, renderDiagramSvg } from "./mermaid-svg";
import { parseChartSvg, type ChartFonts } from "./report-pdf-chart";
import { embedReportFonts, type ReportFonts } from "./report-pdf-fonts";

/**
 * A `ReportSpec` as an A4 PDF, set the way the screen sets it.
 *
 * The download behind the report card the agent produces in the chat
 * (`agent/tools/report.ts`, rendered by
 * `app/_components/chat/artifacts/report-artifact.tsx`). Kept out of the route
 * that serves it so it is a plain function of its argument: no request, no
 * browser, nothing to stand up before you can look at the output.
 *
 * Three things make it the same document rather than a summary of it:
 *
 *   - **The same faces.** Cooper for anything that names something, Inter for
 *     prose, Geist Mono for the furniture and the figures — embedded from the
 *     files in `public/fonts/pdf` (`lib/report-pdf-fonts.ts`).
 *   - **The same charts.** The Mermaid source the card renders is rendered
 *     again here and translated to vectors (`lib/report-pdf-chart.ts`), so a
 *     bar reaches exactly as far on paper as it does on screen.
 *   - **The same restraint.** No rules, no boxes, no outlines. Space and type
 *     do the separating, which is what the layout below spends its arithmetic
 *     on.
 *
 * pdf-lib rather than a headless browser: an HTML-to-PDF pipeline would put
 * Chromium in the request path of a download to lay out text that is already
 * laid out here.
 */

/** A4 in points, which is what pdf-lib measures in. */
const PAGE = { height: 842, width: 595 } as const;
const MARGIN = 56;
const CONTENT_W = PAGE.width - MARGIN * 2;
/** Section bodies hang off their number, the way they do on screen. */
const INDENT = 26;

const INK = hex(PRINT_COLORS.fg);
const MUTED = hex(PRINT_COLORS.muted ?? PRINT_COLORS.fg);
/** The KPI band's flat tone — the one filled shape in the document. */
const WASH = rgb(0.957, 0.957, 0.965);

/** The eyebrow's letter-spacing, in ems, matching `.rp-eyebrow`. */
const TRACKING = 0.1;

/** Filename-safe slug for the `content-disposition` the route sends. */
export function reportFilename(title: string): string {
  return asciiFilename(title);
}

// ── Layout ──────────────────────────────────────────────────────────

/**
 * A cursor down a stack of pages.
 *
 * Everything below draws top-down and asks `space()` whether what it is about
 * to draw still fits, which is the whole page-break policy: a block that does
 * not fit starts a page rather than being split across one. Tables are the one
 * exception — they break by row, because a forty-row table that refuses to
 * split would just overflow.
 */
class Layout {
  readonly doc: PDFDocument;
  readonly fonts: ReportFonts;
  page: PDFPage;
  pages: PDFPage[];
  y: number;
  /** Left offset for the current block, so section bodies hang off the number. */
  indent = 0;

  constructor(doc: PDFDocument, fonts: ReportFonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.pages = [this.page];
    this.y = PAGE.height - MARGIN;
  }

  get left(): number {
    return MARGIN + this.indent;
  }

  get width(): number {
    return CONTENT_W - this.indent;
  }

  space(): number {
    return this.y - MARGIN - 24;
  }

  break(): void {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - MARGIN;
  }

  need(height: number): void {
    if (this.space() < height) this.break();
  }

  gap(height: number): void {
    this.y -= height;
  }

  text(
    value: string,
    options: {
      color?: RGB;
      font?: PDFFont;
      leading?: number;
      size: number;
      width?: number;
    },
  ): void {
    const font = options.font ?? this.fonts.sans;
    const leading = options.leading ?? options.size * 1.55;
    for (const line of wrap(value, font, options.size, options.width ?? this.width)) {
      this.need(leading);
      this.y -= leading;
      this.page.drawText(line, {
        color: options.color ?? INK,
        font,
        size: options.size,
        x: this.left,
        y: this.y,
      });
    }
  }

  /**
   * The running head, the section numbers, the column headers.
   *
   * pdf-lib has no character-spacing option, so a tracked line is drawn one
   * glyph at a time. Only ever a few words long, and it is the difference
   * between a label that reads as a label and one that reads as small text.
   */
  eyebrow(value: string, options: { color?: RGB; size?: number; x?: number; y?: number } = {}): number {
    const size = options.size ?? 7.5;
    const font = this.fonts.mono;
    const text = sanitize(value.toUpperCase(), font);
    let x = options.x ?? this.left;
    const y = options.y ?? this.y;
    for (const char of text) {
      this.page.drawText(char, { color: options.color ?? MUTED, font, size, x, y });
      x += font.widthOfTextAtSize(char, size) + size * TRACKING;
    }
    return x - (options.x ?? this.left);
  }

  /** The same, advancing the cursor — the common case. */
  eyebrowLine(value: string, options: { color?: RGB; size?: number } = {}): void {
    const size = options.size ?? 7.5;
    this.need(size * 1.6);
    this.y -= size * 1.6;
    this.eyebrow(value, { ...options, size });
  }
}

// ── Document ────────────────────────────────────────────────────────

export async function renderReport(spec: ReportSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(spec.title);
  doc.setCreator("Senka");

  const fonts = await embedReportFonts(doc);
  const layout = new Layout(doc, fonts);

  layout.eyebrowLine([spec.period, "Informe"].filter(Boolean).join("  ·  "));
  layout.gap(14);
  layout.text(spec.title, { font: fonts.cooper, leading: 30, size: 25 });
  if (spec.subtitle) {
    layout.gap(4);
    layout.text(spec.subtitle, { color: MUTED, size: 10, width: Math.min(layout.width, 400) });
  }

  if (spec.kpis?.length) {
    layout.gap(22);
    drawKpiBento(layout, spec.kpis);
  }

  layout.gap(26);
  layout.eyebrowLine("Resumen");
  layout.gap(6);
  drawMarkdown(layout, spec.summary);

  for (const [index, section] of spec.sections.entries()) {
    layout.gap(24);
    await drawSection(layout, section, index);
  }

  if (spec.footnote) {
    layout.gap(26);
    layout.text(spec.footnote, { color: MUTED, font: fonts.mono, size: 7.5 });
  }

  stampRunningHeads(layout, spec);
  return doc.save();
}

async function drawSection(layout: Layout, section: ReportSection, index: number): Promise<void> {
  // A heading at the foot of a page with its body overleaf is the one break
  // worth spending a page on.
  layout.need(78);
  const headings = wrap(section.heading, layout.fonts.cooper, 15, CONTENT_W - INDENT);
  layout.y -= 20;
  layout.eyebrow(String(index + 1).padStart(2, "0"), { color: mixed(0.45), y: layout.y + 1 });
  headings.forEach((line, lineIndex) => {
    if (lineIndex > 0) layout.y -= 20;
    layout.page.drawText(sanitize(line, layout.fonts.cooper), {
      color: INK,
      font: layout.fonts.cooper,
      size: 15,
      x: MARGIN + INDENT,
      y: layout.y,
    });
  });

  layout.indent = INDENT;
  layout.gap(12);
  if (section.body) drawMarkdown(layout, section.body);
  if (section.table) {
    layout.gap(12);
    drawTable(layout, section.table);
  }
  if (section.chart) {
    layout.gap(16);
    await drawChart(layout, section.chart);
  }
  layout.indent = 0;
}

/**
 * The headline figures, as the same bento band the card draws.
 *
 * Six columns and a span per count, so the row always fills — an equal-column
 * grid with a hole where a fourth figure would go reads as a number that
 * failed to render. The first cell is set larger whatever the count, because
 * the model is asked to put the headline first.
 */
const KPI_SPANS: Readonly<Record<number, readonly number[]>> = {
  1: [6],
  2: [3, 3],
  3: [2, 2, 2],
  4: [3, 3, 3, 3],
  5: [2, 2, 2, 3, 3],
  6: [2, 2, 2, 2, 2, 2],
};

function drawKpiBento(layout: Layout, kpis: readonly ReportKpi[]): void {
  const spans = KPI_SPANS[kpis.length] ?? kpis.map(() => 2);
  const gutter = 6;
  const unit = (CONTENT_W - gutter * 5) / 6;
  const cellH = 62;

  let column = 0;
  let rowTop = 0;
  kpis.forEach((kpi, index) => {
    const span = spans[index] ?? 2;
    if (column === 0 || column + span > 6) {
      if (column !== 0) layout.y -= cellH + gutter;
      else {
        layout.need(cellH + 8);
        layout.y -= cellH;
      }
      column = 0;
      rowTop = layout.y;
    }

    const width = unit * span + gutter * (span - 1);
    const x = MARGIN + column * (unit + gutter);
    layout.page.drawRectangle({ color: WASH, height: cellH, width, x, y: rowTop });
    layout.eyebrow(clip(kpi.label, layout.fonts.mono, 7, width - 22), {
      size: 7,
      x: x + 11,
      y: rowTop + cellH - 17,
    });

    const size = index === 0 ? 22 : 17;
    const value = clip(kpi.value, layout.fonts.cooper, size, width - 22);
    layout.page.drawText(value, {
      color: INK,
      font: layout.fonts.cooper,
      size,
      x: x + 11,
      y: rowTop + 15,
    });
    if (kpi.delta) {
      layout.page.drawText(clip(kpi.delta, layout.fonts.mono, 7.5, width - 22), {
        color: toneColor(kpi.tone),
        font: layout.fonts.mono,
        size: 7.5,
        x: x + 16 + layout.fonts.cooper.widthOfTextAtSize(value, size),
        y: rowTop + 16,
      });
    }

    column += span;
  });

  layout.y = rowTop;
}

/**
 * Tone says what the number means, not what it is — a rising cost is a warning
 * even though it is a bigger number. Defaults to muted, so an unlabelled delta
 * reads as information rather than as good news.
 */
function toneColor(tone: ReportKpi["tone"]): RGB {
  switch (tone) {
    case "positive":
      return rgb(0.02, 0.4, 0.27);
    case "warning":
      return rgb(0.62, 0.42, 0);
    case "critical":
      return rgb(0.7, 0.16, 0.16);
    default:
      return MUTED;
  }
}

/**
 * Markdown, flattened.
 *
 * The bodies are prose the model wrote, so they carry bullets, the odd bold
 * run and the occasional stray heading. A full Markdown renderer on top of
 * pdf-lib means an inline text layout engine; what actually appears in these
 * reports is paragraphs and lists, so this handles those and strips the rest
 * rather than printing `**` at the reader.
 */
function drawMarkdown(layout: Layout, markdown: string): void {
  for (const block of markdown.split(/\n{2,}/)) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    for (const line of lines) {
      const bullet = /^[-*+]\s+/.test(line);
      const numbered = /^\d+[.)]\s+/.test(line);
      const heading = /^#{1,6}\s+/.test(line);
      const text = stripInline(line.replace(/^([-*+]|\d+[.)]|#{1,6})\s+/, ""));
      if (!text) continue;

      if (heading) {
        layout.gap(6);
        layout.text(text, { font: layout.fonts.cooper, size: 12 });
        continue;
      }
      if (bullet || numbered) {
        drawBullet(layout, bullet ? "—" : `${line.match(/^\d+/)?.[0] ?? ""}.`, text);
        continue;
      }
      layout.text(text, { size: 9.5, width: Math.min(layout.width, 420) });
    }
    layout.gap(7);
  }
}

/** An em dash rather than a bullet: it is the mark a document uses for a list. */
function drawBullet(layout: Layout, marker: string, text: string): void {
  const hang = 14;
  const width = Math.min(layout.width, 420) - hang;
  const lines = wrap(text, layout.fonts.sans, 9.5, width);
  lines.forEach((line, index) => {
    layout.need(15);
    layout.y -= 15;
    if (index === 0) {
      layout.page.drawText(marker, {
        color: MUTED,
        font: layout.fonts.sans,
        size: 9.5,
        x: layout.left,
        y: layout.y,
      });
    }
    layout.page.drawText(line, {
      color: INK,
      font: layout.fonts.sans,
      size: 9.5,
      x: layout.left + hang,
      y: layout.y,
    });
  });
}

/**
 * A table with no rules in it.
 *
 * What keeps a lineless table readable is the columns actually lining up, so
 * any column whose cells all read as figures is set in Geist Mono and pushed
 * right; the rest stay in Inter, left. On a continued table the headers repeat
 * — otherwise page two is a grid of numbers with nothing naming the columns.
 */
function drawTable(layout: Layout, table: ReportTable): void {
  const numeric = numericColumns(table);
  const columns = table.columns.length;
  const colW = layout.width / columns;
  const rowH = 17;

  const columnX = (index: number) => layout.left + colW * index;
  const cellText = (value: string, index: number, font: PDFFont, size: number) => {
    const text = clip(value, font, size, colW - 8);
    const width = font.widthOfTextAtSize(text, size);
    return { text, x: numeric[index] ? columnX(index) + colW - 8 - width : columnX(index) };
  };

  const header = () => {
    layout.need(rowH * 3);
    layout.y -= 12;
    table.columns.forEach((label, index) => {
      const text = clip(label.toUpperCase(), layout.fonts.mono, 6.5, colW - 8);
      const tracked = trackedWidth(layout.fonts.mono, text, 6.5);
      layout.eyebrow(text, {
        size: 6.5,
        x: numeric[index] ? columnX(index) + colW - 8 - tracked : columnX(index),
        y: layout.y,
      });
    });
    layout.y -= 6;
  };

  header();
  for (const row of table.rows) {
    if (layout.space() < rowH) {
      layout.break();
      header();
    }
    layout.y -= rowH;
    row.slice(0, columns).forEach((cell, index) => {
      const font = numeric[index] ? layout.fonts.mono : layout.fonts.sans;
      const size = numeric[index] ? 8.5 : 9;
      const { text, x } = cellText(cell, index, font, size);
      layout.page.drawText(text, { color: INK, font, size, x, y: layout.y });
    });
  }
}

/**
 * A figure, for alignment purposes — the same test the card uses, so a column
 * that is right-aligned on screen is right-aligned on paper.
 */
const FIGURE = /^[+\-−]?\s*[$€£¥]?\s*\d[\d.,\s]*\s*(?:%|[a-zA-Z]{1,6})?$/;

function numericColumns(table: ReportTable): readonly boolean[] {
  return table.columns.map((_column, index) => {
    const cells = table.rows.map((row) => row[index]?.trim()).filter(Boolean);
    return cells.length > 0 && cells.every((cell) => FIGURE.test(cell!));
  });
}

// ── Charts on paper ─────────────────────────────────────────────────

/**
 * The chart the card is showing, as vectors.
 *
 * Same Mermaid source, same renderer, same geometry — only the colours differ,
 * because paper has no theme to follow and no engine to resolve a `var()`, so
 * the light values go in as literal hex.
 *
 * A chart the translator cannot read is skipped rather than half-drawn: the
 * title and note still print, so the page says what is missing.
 */
async function drawChart(layout: Layout, spec: ReportSection["chart"]): Promise<void> {
  if (!spec) return;

  const fonts: ChartFonts = { bold: layout.fonts.sansBold, regular: layout.fonts.sans };
  const drawing = parseChartSvg(await renderChartSvg(spec), fonts);
  const scale = drawing ? layout.width / drawing.width : 0;
  const plotH = drawing ? drawing.height * scale : 0;

  // The whole figure is measured before any of it is drawn. A caption stranded
  // at the foot of a page with its chart overleaf is the one thing a reader
  // notices about a generated PDF, and it is the default behaviour of drawing
  // top-down without asking.
  const captionH =
    17 +
    (spec.subtitle ? wrap(spec.subtitle, layout.fonts.sans, 8.5, layout.width).length * 13 : 0);
  const noteH = spec.note
    ? 10 + wrap(spec.note, layout.fonts.sans, 8.5, Math.min(layout.width, 420)).length * 13
    : 0;
  layout.need(captionH + 8 + plotH + noteH);

  layout.text(spec.title, { font: layout.fonts.cooper, size: 11 });
  if (spec.subtitle) layout.text(spec.subtitle, { color: MUTED, size: 8.5 });
  layout.gap(8);

  if (drawing) {
    layout.y -= plotH;
    drawing.draw(layout.page, layout.left, layout.y + plotH, scale);
  }

  if (spec.note) {
    layout.gap(10);
    layout.text(spec.note, { color: MUTED, size: 8.5, width: Math.min(layout.width, 420) });
  }
}

/** Exported for `tests/report-pdf.test.ts`, which asserts the SVG stays translatable. */
export async function renderChartSvg(spec: NonNullable<ReportSection["chart"]>): Promise<string> {
  const svg = await renderDiagramSvg(chartSpecToMermaid(spec, { title: false }), {
    colors: PRINT_COLORS,
    padding: 4,
    responsive: false,
    series: PRINT_SERIES,
  });
  return relabelLegend(svg, chartSeriesNames(spec));
}

// ── Page furniture ──────────────────────────────────────────────────

/**
 * The running head, stamped once every page exists.
 *
 * The title on the left and the page count on the right, both in the mono
 * eyebrow. No rule under it — there are none anywhere else in the document
 * and one here would be the thing the eye went to first.
 */
function stampRunningHeads(layout: Layout, spec: ReportSpec): void {
  const size = 6.5;
  const font = layout.fonts.mono;
  layout.pages.forEach((page, index) => {
    if (index > 0) {
      drawTracked(page, font, clip(spec.title, font, size, CONTENT_W - 60).toUpperCase(), {
        color: mixed(0.5),
        size,
        x: MARGIN,
        y: PAGE.height - MARGIN + 18,
      });
    }
    const label = `${index + 1} / ${layout.pages.length}`;
    const width = trackedWidth(font, label, size);
    drawTracked(page, font, label, {
      color: mixed(0.5),
      size,
      x: PAGE.width - MARGIN - width,
      y: MARGIN - 24,
    });
  });
}

function drawTracked(
  page: PDFPage,
  font: PDFFont,
  value: string,
  options: { color: RGB; size: number; x: number; y: number },
): void {
  let x = options.x;
  for (const char of sanitize(value, font)) {
    page.drawText(char, { color: options.color, font, size: options.size, x, y: options.y });
    x += font.widthOfTextAtSize(char, options.size) + options.size * TRACKING;
  }
}

function trackedWidth(font: PDFFont, value: string, size: number): number {
  const text = sanitize(value, font);
  return font.widthOfTextAtSize(text, size) + text.length * size * TRACKING;
}

// ── Colour helpers ──────────────────────────────────────────────────

function hex(value: string): RGB {
  const raw = value.replace("#", "");
  return rgb(
    Number.parseInt(raw.slice(0, 2), 16) / 255,
    Number.parseInt(raw.slice(2, 4), 16) / 255,
    Number.parseInt(raw.slice(4, 6), 16) / 255,
  );
}

/** Ink at a given strength on white — the document's only tonal scale. */
function mixed(strength: number): RGB {
  return rgb(
    1 - (1 - INK.red) * strength,
    1 - (1 - INK.green) * strength,
    1 - (1 - INK.blue) * strength,
  );
}

// ── Text helpers ────────────────────────────────────────────────────

/**
 * Characters the embedded fonts have no glyph for, mapped to the nearest one
 * they do.
 *
 * Only for the cases where dropping the character would lose meaning: an arrow
 * in a flow ("propuesta → cierre") becomes nothing at all otherwise, and the
 * exotic spaces come out as missing letters rather than as gaps. Everything
 * else the LATIN cut already covers — em dashes, curly quotes, ellipses,
 * bullets, accents, ¿ and ¡ are all in it, so none of them is "fixed" here.
 */
const EQUIVALENTS: Readonly<Record<string, string>> = {
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  "→": "->",
  "←": "<-",
  "⇒": "=>",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "−": "-",
};

/**
 * Text the embedded font can actually draw.
 *
 * pdf-lib throws on an unencodable character rather than substituting one, and
 * a single emoji anywhere in a ten-page report would fail the whole download
 * with a stack trace instead of dropping one glyph. So the font itself decides:
 * anything it can measure, it can draw.
 *
 * Whole string first, character by character only when that fails — which is
 * almost never, and keeps a per-character try/catch off the common path.
 */
function sanitize(value: string, font: PDFFont): string {
  try {
    font.widthOfTextAtSize(value, 10);
    return value;
  } catch {
    let out = "";
    for (const char of value) {
      const mapped = EQUIVALENTS[char] ?? char;
      try {
        font.widthOfTextAtSize(mapped, 10);
        out += mapped;
      } catch {
        // No glyph and no equivalent worth inventing — drop it.
      }
    }
    return out;
  }
}

/** Markdown's inline marks, removed — see `drawMarkdown` for why this is enough. */
function stripInline(value: string): string {
  return value
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const words = sanitize(value, font).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word wider than the column (a URL, an id) is cut rather than
    // allowed to run into the margin.
    line = font.widthOfTextAtSize(word, size) > width ? clip(word, font, size, width) : word;
  }
  if (line) lines.push(line);
  return lines;
}

function clip(value: string, font: PDFFont, size: number, width: number): string {
  const text = sanitize(value, font);
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function asciiFilename(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug.slice(0, 60) || "informe";
}
