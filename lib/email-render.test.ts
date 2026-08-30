import { describe, expect, it } from "vitest";
import {
  extractTemplateVariables,
  renderTemplateById,
  renderTemplateSource,
  TemplateRenderError,
} from "./email-render";

const SIMPLE_TEMPLATE = `import { Html, Head, Body, Container, Text } from "@react-email/components";

export default function CustomTemplate({ nombre, mensaje }: { nombre: string; mensaje: string }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Text>Hola {nombre},</Text>
          <Text>{mensaje}</Text>
        </Container>
      </Body>
    </Html>
  );
}
`;

describe("renderTemplateSource", () => {
  it("compiles TSX and renders it with the variables it was given", async () => {
    const { html, text } = await renderTemplateSource(SIMPLE_TEMPLATE, {
      nombre: "Lucía",
      mensaje: "Tu turno quedó confirmado.",
    });

    // React splits adjacent text nodes with `<!-- -->`, so the interpolated
    // name is asserted on its own rather than as part of the sentence.
    expect(html).toContain("Lucía");
    expect(html).toContain("Tu turno quedó confirmado.");
    expect(html).toMatch(/^<!DOCTYPE html/i);
    // The plain-text part carries the same words without the markup.
    expect(text).toContain("Hola Lucía,");
    expect(text).not.toContain("<div");
  });

  it("reports a syntax error instead of throwing something opaque", async () => {
    await expect(renderTemplateSource("export default function Broken( {")).rejects.toBeInstanceOf(
      TemplateRenderError,
    );
  });

  it("refuses a template that reaches for a module outside the allowed set", async () => {
    const source = `import { readFileSync } from "node:fs";
export default function Sneaky() {
  return readFileSync("/etc/passwd", "utf-8");
}
`;
    await expect(renderTemplateSource(source)).rejects.toThrow(/can only import/);
  });

  it("refuses a template with no default export", async () => {
    const source = `export function NotDefault() { return null; }`;
    await expect(renderTemplateSource(source)).rejects.toThrow(/default export/);
  });
});

describe("renderTemplateById", () => {
  it("renders a built-in from its own sample values", async () => {
    const { html } = await renderTemplateById("welcome");
    expect(html).toContain("Lucía");
    expect(html).toContain("Estudio Norte");
  });

  it("lets the caller override individual sample values", async () => {
    const { html } = await renderTemplateById("welcome", { firstName: "Martín" });
    expect(html).toContain("Martín");
    // Untouched variables keep their sample value rather than going blank.
    expect(html).toContain("Estudio Norte");
  });

  it("renders a built-in whose variables include structured data", async () => {
    const { html } = await renderTemplateById("invoice");
    expect(html).toContain("A-0042");
    expect(html).toContain("Consultoría");
  });

  it("says which template is missing", async () => {
    await expect(renderTemplateById("no-such-template")).rejects.toThrow(/no-such-template/);
  });
});

describe("extractTemplateVariables", () => {
  it("reads the props off a destructured function declaration", async () => {
    expect(await extractTemplateVariables(SIMPLE_TEMPLATE)).toEqual(["nombre", "mensaje"]);
  });

  it("reads them off an arrow function too", async () => {
    const source = `export default ({ a, b, c }: { a: string; b: string; c: string }) => null;`;
    expect(await extractTemplateVariables(source)).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for a template that takes no props", async () => {
    expect(await extractTemplateVariables(`export default function T() { return null; }`)).toEqual([]);
  });
});
