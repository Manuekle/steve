import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

/**
 * The three faces the report is set in, embedded in the PDF.
 *
 * A download that comes back in Helvetica is not the document somebody was
 * looking at — the whole character of the report is Cooper against Inter with
 * the figures in Geist Mono, and losing that loses the reason for exporting it
 * rather than screenshotting it.
 *
 * pdf-lib cannot read the woff2 the browser gets: it has no decoder for the
 * container, and a variable font would embed at its default instance, so
 * InterVariable would come out at wght 400 with no bold anywhere. So
 * `scripts/build-pdf-fonts.sh` cuts a static TTF per weight from the same
 * masters the web faces come from, and this loads those.
 *
 * Read from disk rather than imported, because a `.ttf` is not a module.
 * `next.config.ts` lists the directory in `outputFileTracingIncludes` so the
 * files travel with the route that needs them.
 */

const DIR = path.join(process.cwd(), "public", "fonts", "pdf");

/** The six files `scripts/build-pdf-fonts.sh` writes. */
const FILES = {
  cooper: "Cooper-400.ttf",
  cooperMedium: "Cooper-500.ttf",
  mono: "GeistMono-400.ttf",
  monoMedium: "GeistMono-500.ttf",
  sans: "Inter-400.ttf",
  sansBold: "Inter-600.ttf",
} as const;

export type ReportFontName = keyof typeof FILES;

export type ReportFonts = Readonly<Record<ReportFontName, PDFFont>>;

/**
 * The file bytes, read once per process.
 *
 * A report is a handful of pages and the six faces come to about 280 KB
 * together; re-reading them on every download would be six syscalls to produce
 * bytes that never change. The promise itself is cached, so concurrent
 * downloads share one read rather than racing.
 */
let bytesOnce: Promise<Readonly<Record<ReportFontName, Uint8Array>>> | null = null;

function loadBytes(): Promise<Readonly<Record<ReportFontName, Uint8Array>>> {
  bytesOnce ??= (async () => {
    const names = Object.keys(FILES) as ReportFontName[];
    const loaded = await Promise.all(
      names.map(async (name) => [name, new Uint8Array(await readFile(path.join(DIR, FILES[name])))] as const),
    );
    return Object.fromEntries(loaded) as Record<ReportFontName, Uint8Array>;
  })().catch((error: unknown) => {
    // A failed read must not poison the cache — the next download should try
    // again rather than inherit a rejected promise for the life of the process.
    bytesOnce = null;
    throw error;
  });
  return bytesOnce;
}

export async function embedReportFonts(doc: PDFDocument): Promise<ReportFonts> {
  doc.registerFontkit(fontkit);
  const bytes = await loadBytes();
  const names = Object.keys(FILES) as ReportFontName[];
  const embedded = await Promise.all(
    names.map(
      async (name) =>
        // `subset: false` — pdf-lib's subsetter re-encodes the glyf table, and
        // these files are already cut to the LATIN range by the build script.
        [name, await doc.embedFont(bytes[name], { subset: false })] as const,
    ),
  );
  return Object.fromEntries(embedded) as ReportFonts;
}
