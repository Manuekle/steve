import { describe, expect, it } from "vitest";
import { renderMermaidSVGAsync } from "beautiful-mermaid";
import { MERMAID_SAMPLES, MERMAID_SAMPLE_GROUPS } from "@/app/dev/mermaid/_samples";

/**
 * The contract between a ```mermaid fence in a reply and the fast renderer.
 *
 * `components/ai-elements/mermaid-plugin.ts` draws diagrams with
 * `beautiful-mermaid` and falls back to mermaid.js — ~500KB, and a theme that
 * ignores our tokens — for anything it throws on. The fallback is silent: the
 * diagram still appears, so a construct sliding out of the fast path is
 * invisible in the product and shows up only as a slower, differently-coloured
 * chat.
 *
 * So every construct the renderer covers gets a sample in
 * `app/dev/mermaid/_samples.ts`, and this renders all of them. `/dev/mermaid`
 * draws the same list for the half a test cannot judge — whether the picture is
 * any good.
 */

/** The renderer drops relationship lines it cannot parse instead of throwing,
 *  and a diagram of nothing still comes back as a valid `<svg>`. Anything this
 *  small is empty, whatever it says on the tin. */
const MIN_SIDE = 40;

/**
 * A marker per sample whose point is a construct the parser can silently skip:
 * a cardinality, a block keyword, an inline style, a label. If the text made it
 * into the SVG, the line it came from parsed.
 */
const MUST_CONTAIN: Readonly<Record<number, readonly string[]>> = {
  5: ["Trapezoid Alt", "Double Circle"],
  10: ["Log", "Worker"],
  12: ["#22c55e", "#ef4444"],
  13: ["#3b82f6"],
  19: ["#dcfce7"],
  20: ["#1d4ed8"],
  28: ["待機中", "処理中"],
  32: ["con cruz"],
  35: ["cada 30s"],
  36: ["tarjeta válida"],
  37: ["tiene foto nueva"],
  38: ["Analytics"],
  39: ["credenciales inválidas"],
  40: ["lee el mensaje", "sesión persistida"],
  46: ["saldo"],
  47: ["interface"],
  49: ["enumeration"],
  57: ["realiza"],
  63: ["PK", "FK", "UK"],
  68: ["uno_a_uno", "cero_muchos_a_cero_uno"],
  70: ["colabora_en"],
  74: ["INSCRIPCION"],
  78: ["Negociación"],
  81: ["Percentil"],
  83: ["Referidos"],
};

describe("mermaid samples", () => {
  it("covers every family the renderer supports", () => {
    expect(MERMAID_SAMPLE_GROUPS.map((group) => group.family)).toEqual([
      "Flowchart",
      "State",
      "Sequence",
      "Class",
      "ER",
      "XY Chart",
    ]);
    expect(MERMAID_SAMPLES).toHaveLength(84);
  });

  it.each(MERMAID_SAMPLES.map((sample) => [sample.n, sample.title, sample] as const))(
    "%i. %s",
    async (_n, _title, sample) => {
      const svg = await renderMermaidSVGAsync(normalize(sample.code), {
        bg: "#ffffff",
        fg: "#27272a",
        transparent: true,
      });

      expect(svg.startsWith("<svg")).toBe(true);

      const box = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      expect(box, "no viewBox").not.toBeNull();
      expect(Number(box![1]), "empty diagram").toBeGreaterThan(MIN_SIDE);
      expect(Number(box![2]), "empty diagram").toBeGreaterThan(MIN_SIDE);

      for (const needle of MUST_CONTAIN[sample.n] ?? []) {
        expect(svg, `dropped "${needle}"`).toContain(needle);
      }
    },
  );
});

/**
 * The one rewrite the plugin does before handing source to the renderer, kept
 * in step here. See `normalizeErCardinality` for why `}o` needs it.
 */
function normalize(source: string): string {
  return /^\s*erDiagram\b/.test(source) ? source.replace(/\}o(--|\.\.)/g, "o{$1") : source;
}
