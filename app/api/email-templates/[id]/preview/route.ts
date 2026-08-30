import { NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import {
  renderTemplateById,
  renderTemplateSource,
  TemplateRenderError,
} from "@/lib/email-render";
import { getTemplateMeta, isBuiltinTemplate, renderSubject } from "@/lib/email-templates";

/**
 * POST /api/email-templates/[id]/preview — render a template to the HTML the
 * preview pane shows.
 *
 * The editor posts the source it currently has, unsaved edits and all, so the
 * preview tracks the buffer rather than the file. Built-ins ignore that: they
 * render from the imported component, which is also what gets sent.
 */
export const POST = withApiErrors(async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    source?: string;
    variables?: Record<string, unknown>;
  };

  const meta = await getTemplateMeta(id);
  if (!meta) return apiError("not_found", { message: `No template named "${id}".` });

  const variables = { ...meta.sample, ...(body.variables ?? {}) };

  try {
    const rendered =
      body.source && !isBuiltinTemplate(id)
        ? await renderTemplateSource(body.source, variables)
        : await renderTemplateById(id, variables);

    return NextResponse.json({
      html: rendered.html,
      text: rendered.text,
      subject: renderSubject(meta.subject || meta.label, variables),
    });
  } catch (error) {
    if (error instanceof TemplateRenderError) {
      // 200, not 4xx: a template that doesn't compile yet is the normal state
      // of one being typed, and the pane shows the message in place of the
      // email rather than treating it as a request failure.
      return NextResponse.json({ html: null, renderError: error.message });
    }
    throw error;
  }
});
