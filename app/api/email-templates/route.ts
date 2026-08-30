import { NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { extractTemplateVariables } from "@/lib/email-render";
import { isSmtpConfigured } from "@/lib/email";
import {
  getResendFromEmail,
  isResendConfigured,
  RESEND_SANDBOX_FROM,
} from "@/lib/resend";
import {
  isBuiltinTemplate,
  listTemplates,
  saveCustomTemplate,
  type CustomTemplateMeta,
} from "@/lib/email-templates";

/** The starting point a brand-new template opens on: small enough to read in
 *  one screen, complete enough to render and send as-is. */
const STARTER_SOURCE = `import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
} from "@react-email/components";

export default function CustomTemplate({
  nombre,
  mensaje,
  accionUrl,
}: {
  nombre: string;
  mensaje: string;
  accionUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "sans-serif", margin: 0 }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 12,
            margin: "32px auto",
            maxWidth: 560,
            padding: 32,
          }}
        >
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: 700 }}>
            Hola {nombre},
          </Text>
          <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: 1.6 }}>
            {mensaje}
          </Text>
          <Button
            href={accionUrl}
            style={{
              backgroundColor: "#111827",
              borderRadius: 8,
              color: "#ffffff",
              display: "inline-block",
              fontSize: 14,
              fontWeight: 600,
              padding: "12px 22px",
              textDecoration: "none",
            }}
          >
            Ver más
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
`;

const STARTER_SAMPLE: Record<string, unknown> = {
  nombre: "Lucía",
  mensaje: "Este es tu email personalizado. Editá el código de la izquierda y mirá cómo cambia acá al lado.",
  accionUrl: "https://ejemplo.com",
};

// GET /api/email-templates — every template, plus who would send them.
export const GET = withApiErrors(async function GET() {
  const [templates, resend, smtp, from] = await Promise.all([
    listTemplates(),
    isResendConfigured(),
    isSmtpConfigured(),
    getResendFromEmail(),
  ]);
  return NextResponse.json({
    templates,
    // The test panel needs this to say who's about to send, and to warn about
    // Resend's sandbox sender before someone waits for an email that only ever
    // reaches the account owner.
    provider: { resend, smtp, from, sandbox: resend && from === RESEND_SANDBOX_FROM },
  });
});

// POST /api/email-templates — create a custom template.
export const POST = withApiErrors(async function POST(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    label?: string;
    description?: string;
    subject?: string;
    source?: string;
    sample?: Record<string, unknown>;
  };

  const id = body.id?.trim() || `custom-${Date.now()}`;
  if (isBuiltinTemplate(id)) {
    return apiError("conflict", {
      message: `"${id}" is a built-in template — pick another id.`,
      field: "id",
    });
  }

  const source = body.source ?? STARTER_SOURCE;
  const label = body.label?.trim() || "Nueva plantilla";

  // Read off the source rather than trusting the caller: the variable list is
  // what the editor renders inputs from, and a wrong one is invisible until an
  // email goes out with a hole in it.
  const variables = await extractTemplateVariables(source);
  const sample = body.sample ?? (body.source ? {} : STARTER_SAMPLE);

  const meta: CustomTemplateMeta = {
    label,
    description: body.description ?? "",
    subject: body.subject?.trim() || label,
    variables,
    sample,
  };

  const saved = await saveCustomTemplate(id, source, meta);
  return NextResponse.json({ template: saved, source }, { status: 201 });
});
