import { createContext, runInContext } from "node:vm";
import type * as TS from "typescript";
import * as React from "react";
import { createElement, type ComponentType } from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as JsxDevRuntime from "react/jsx-dev-runtime";
import * as ReactEmailComponents from "@react-email/components";
import { render } from "@react-email/render";
import { getBuiltinTemplate } from "@/components/email-templates";
import { getTemplateSource } from "./email-templates";

/**
 * Turning an email template into the two strings Resend actually wants.
 *
 * Built-in templates are real modules in this repo, so they are imported and
 * rendered directly — no compilation, no evaluation. Custom templates are
 * `.tsx` files the operator writes in the editor and that live under
 * `~/.steve/email-templates/`, so those have to be compiled and run here.
 *
 * The trust boundary: that source is already code on the operator's own
 * machine, written by the one account that can reach this app (every route
 * outside the public list in `middleware.ts` needs a session). Running it is
 * not a new capability — but it is still someone's code being executed by a
 * request, so it gets a fresh `node:vm` context whose only reachable modules
 * are React and React Email, and a wall-clock budget. `fs`, `child_process`
 * and the network are simply not in the module map.
 */

export type RenderedEmail = {
  readonly html: string;
  readonly text: string;
};

/** Values a template is rendered with. Strings from the editor's inspector,
 *  anything JSON-shaped from an automation's context. */
export type TemplateVariables = Record<string, unknown>;

/** Milliseconds a template gets to evaluate and to render. Long enough for a
 *  real template on a cold module cache, short enough that a `while (true)`
 *  in the editor doesn't take the server with it. */
const EVAL_TIMEOUT_MS = 2_000;
const RENDER_TIMEOUT_MS = 5_000;

/** Everything a template is allowed to import. Anything else throws with the
 *  module name in the message, so the editor can say which line is wrong
 *  rather than failing as a blank preview. */
const TEMPLATE_MODULES: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": JsxRuntime,
  "react/jsx-dev-runtime": JsxDevRuntime,
  "@react-email/components": ReactEmailComponents,
};

export class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateRenderError";
  }
}

// ── Compilation ─────────────────────────────────────────────────────

/**
 * TSX to CommonJS. `typescript` is loaded lazily: it's several megabytes and
 * only the custom-template path ever needs it, so a built-in preview never
 * pays for it.
 */
async function transpile(source: string): Promise<string> {
  const ts = await import("typescript");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      // The automatic runtime, so a template that never writes `import React`
      // — which is every template the editor scaffolds — still compiles.
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      allowJs: true,
    },
    reportDiagnostics: true,
  });

  // Only syntax errors are reported — `transpileModule` never type-checks, so
  // an unresolved import or a wrong prop type is not an error here. That's the
  // right trade for a live preview: the template still renders while you type.
  const fatal = (result.diagnostics ?? []).filter((d) => d.category === 1);
  if (fatal.length > 0) {
    const first = fatal[0];
    const text =
      typeof first.messageText === "string" ? first.messageText : first.messageText.messageText;
    throw new TemplateRenderError(text);
  }
  return result.outputText;
}

/**
 * The prop names a template actually takes, read off its default export's
 * destructuring pattern.
 *
 * The alternative is trusting whatever variable list was saved alongside the
 * file, which goes stale the moment someone adds a prop in the editor — and a
 * stale list means the inspector silently stops offering the input that
 * decides what the email says.
 */
export async function extractTemplateVariables(source: string): Promise<string[]> {
  const ts = await import("typescript");
  const file = ts.createSourceFile("template.tsx", source, ts.ScriptTarget.ES2021, true, ts.ScriptKind.TSX);

  let params: TS.NodeArray<TS.ParameterDeclaration> | undefined;
  for (const statement of file.statements) {
    const isDefaultExport = ts
      .getModifiers(statement as TS.HasModifiers)
      ?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(statement) && isDefaultExport) {
      params = statement.parameters;
      break;
    }
    // `export default function () {}` and `export default (props) => …` both
    // arrive as an ExportAssignment rather than a declaration.
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expression = statement.expression;
      if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
        params = expression.parameters;
        break;
      }
    }
  }

  const first = params?.[0];
  if (!first || !ts.isObjectBindingPattern(first.name)) return [];
  return first.name.elements
    .map((element) => (ts.isIdentifier(element.name) ? element.name.text : null))
    .filter((name): name is string => name !== null);
}

/** Runs compiled template code and hands back its default export. */
function evaluate(code: string): ComponentType<TemplateVariables> {
  const moduleObject = { exports: {} as Record<string, unknown> };

  const sandbox: Record<string, unknown> = {
    module: moduleObject,
    exports: moduleObject.exports,
    require: (name: string) => {
      const found = TEMPLATE_MODULES[name];
      if (!found) {
        throw new TemplateRenderError(
          `A template can only import "react" and "@react-email/components" — not "${name}".`,
        );
      }
      return found;
    },
    console,
    // React Email's components read neither, but a template that formats a
    // date or an amount does.
    Intl,
    Math,
    Date,
    JSON,
  };

  runInContext(code, createContext(sandbox), {
    timeout: EVAL_TIMEOUT_MS,
    displayErrors: false,
  });

  const exported = moduleObject.exports;
  const component = (exported.default ?? exported) as unknown;
  if (typeof component !== "function") {
    throw new TemplateRenderError(
      "The template has no default export — add `export default function MyTemplate(props) { … }`.",
    );
  }
  return component as ComponentType<TemplateVariables>;
}

/** Compiled components, keyed by their exact source. Editing a character
 *  misses the cache and recompiles; re-previewing the same source doesn't. */
const compiled = new Map<string, ComponentType<TemplateVariables>>();
const COMPILE_CACHE_MAX = 32;

async function compile(source: string): Promise<ComponentType<TemplateVariables>> {
  const hit = compiled.get(source);
  if (hit) return hit;
  const component = evaluate(await transpile(source));
  if (compiled.size >= COMPILE_CACHE_MAX) {
    // Oldest first — Map keeps insertion order, and the source being edited
    // right now is always the most recent entry.
    const oldest = compiled.keys().next().value;
    if (oldest !== undefined) compiled.delete(oldest);
  }
  compiled.set(source, component);
  return component;
}

// ── Rendering ───────────────────────────────────────────────────────

async function renderComponent(
  component: ComponentType<TemplateVariables>,
  variables: TemplateVariables,
): Promise<RenderedEmail> {
  const element = createElement(component, variables);

  const withTimeout = <T,>(work: Promise<T>): Promise<T> =>
    Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new TemplateRenderError("The template took too long to render.")),
          RENDER_TIMEOUT_MS,
        ),
      ),
    ]);

  try {
    const [html, text] = await Promise.all([
      withTimeout(render(element)),
      // The plain-text part is what a mail client without HTML shows, and what
      // spam filters look for when the HTML part stands alone.
      withTimeout(render(element, { plainText: true })),
    ]);
    return { html, text };
  } catch (error) {
    if (error instanceof TemplateRenderError) throw error;
    throw new TemplateRenderError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Render arbitrary template source — what the editor's live preview calls on
 * every keystroke, before anything has been saved.
 */
export async function renderTemplateSource(
  source: string,
  variables: TemplateVariables = {},
): Promise<RenderedEmail> {
  return renderComponent(await compile(source), variables);
}

/**
 * Render a template by id. Built-ins skip compilation entirely: the component
 * is already in this bundle, so it is imported rather than re-derived from its
 * own source text.
 */
export async function renderTemplateById(
  id: string,
  variables: TemplateVariables = {},
): Promise<RenderedEmail> {
  const builtin = getBuiltinTemplate(id);
  if (builtin) {
    return renderComponent(
      builtin.component as ComponentType<TemplateVariables>,
      { ...builtin.sample, ...variables },
    );
  }
  const source = await getTemplateSource(id);
  if (!source) throw new TemplateRenderError(`No template named "${id}".`);
  return renderTemplateSource(source, variables);
}
