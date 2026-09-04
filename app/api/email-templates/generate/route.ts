import { generateObject } from "ai";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { modelIdForTask } from "@/lib/task-model";
import { resolveLanguageModel } from "@/lib/ai-provider";
import { getProviderReport } from "@/lib/provider-catalog";
import { extractTemplateVariables, renderTemplateSource, TemplateRenderError } from "@/lib/email-render";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import { guardAiRoute, recordRouteUsage } from "@/lib/ai-route-guard";

// POST /api/email-templates/generate
// Turns a plain-language description into a complete custom template — label,
// subject, sample data and the .tsx source itself. Never writes: the editor
// opens the result for review, same as a hand-typed template does before its
// first save.

const emailDraftSchema = z.object({
  label: z.string().describe("Short template name, 2-5 words, in the user's language"),
  description: z.string().describe("One-line summary of when to send this email"),
  subject: z
    .string()
    .describe("Email subject line. Use {{variableName}} for placeholders that mirror a component prop."),
  source: z
    .string()
    .describe("A complete, valid .tsx file — a React Email component, default export"),
  sampleValues: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .describe("One realistic sample value per prop the component destructures, for the live preview"),
});

const system = [
  "You write email templates for a business messaging platform, as React Email",
  "components in TSX. The user describes what kind of email they want, in",
  "plain language.",
  "",
  "## Output rules",
  "",
  "- label: short template name (2-5 words), in the same language as the",
  "  user's request.",
  "- description: one clear sentence — when this template gets used.",
  "- subject: the email subject line. Use {{variableName}} for a placeholder",
  "  that mirrors one of the component's props.",
  "- source: a COMPLETE, valid .tsx file. Default-export one function",
  "  component.",
  "- sampleValues: one realistic sample value per prop, for the preview.",
  "",
  "## Source code constraints",
  "",
  "The template runs in a sandbox that only exposes two modules:",
  "",
  '- Import ONLY from "react" and "@react-email/components". No other',
  "  import, ever — not a relative import, not a UI library, not a CSS file.",
  "- Style with inline `style={{ ... }}` objects (camelCase CSS-in-JS), the",
  "  way hand-written email HTML has to. Do not reference Tailwind classes",
  "  unless you also wrap the whole email in <Tailwind> yourself.",
  "- Props are destructured straight off the function's first argument, each",
  "  typed as `string`, e.g.",
  "  `export default function X({ nombre, empresa }: { nombre: string; empresa: string })`.",
  "  Never import a props type from elsewhere.",
  "- No remote <Img>: most inboxes block them by default, and a broken image",
  "  reads worse than none. Skip images unless the user's request gives you",
  "  a URL to use.",
  "- Keep the layout simple and readable: light background, one column,",
  "  generous spacing, clear hierarchy — a transactional/marketing email, not",
  "  a web page.",
  "- Write all user-facing copy (subject, body, button labels) in the same",
  "  language as the user's request.",
].join("\n");

// A full .tsx source plus sample data is a bigger completion than a short
// config object, so this gets more room than the other AI-assist routes.
export const maxDuration = 90;

export const POST = withApiErrors(async function POST(request: NextRequest) {
  const refused = await guardAiRoute(request, "email-generate");
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") {
    return apiError("invalid_body");
  }

  const input = body as { prompt?: string };
  const prompt = input.prompt?.trim();
  if (!prompt) {
    return missingField("prompt");
  }

  const health = await getProviderReport();
  if (health.status === "missing" || health.status === "invalid") {
    return apiError("no_credentials");
  }

  let draft: z.infer<typeof emailDraftSchema>;
  try {
    const modelId = await modelIdForTask("automation");
    const result = await generateObject({
      model: resolveLanguageModel(modelId),
      schema: emailDraftSchema,
      system,
      prompt: `The user wants an email template for: ${prompt}`,
      abortSignal: AbortSignal.timeout(80_000),
    });
    recordRouteUsage({ model: modelId, usage: result.usage, conversationId: "email-generate" });
    draft = result.object;
  } catch (error) {
    return apiError("generation_failed", {
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // Read the real prop list off the generated source rather than trusting the
  // model's own `sampleValues` list — the two can drift, and a stale sample
  // set is what leaves the inspector missing an input the template actually
  // needs.
  let variables: string[];
  try {
    variables = await extractTemplateVariables(draft.source);
  } catch (error) {
    return apiError("generation_failed", {
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const sample: Record<string, unknown> = {};
  for (const name of variables) {
    sample[name] = draft.sampleValues.find((v) => v.name === name)?.value ?? "";
  }

  // Prove the template actually renders before handing it back — a model slip
  // (a stray import, a syntax error) should surface as "try again", not as a
  // broken editor tab.
  try {
    await renderTemplateSource(draft.source, sample);
  } catch (error) {
    const detail =
      error instanceof TemplateRenderError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return apiError("generation_failed", { detail });
  }

  return NextResponse.json({
    label: draft.label,
    description: draft.description,
    subject: draft.subject,
    source: draft.source,
    variables,
    sample,
  });
});
