import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "@react-email/components";
import { EmailHead, emailColors, emailFontFamily } from "./theme";
import type { EmailTemplateDefinition } from "./types";

/**
 * Lead notification — an internal alert, so it's built like a record, not like
 * marketing: the name big at the top and everything else in labelled rows you
 * can scan in a second on a phone.
 */
const config = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: emailColors,
      fontFamily: emailFontFamily,
    },
  },
};

export type LeadNotificationProps = {
  leadName: string;
  leadEmail?: string;
  leadPhone?: string;
  leadSource?: string;
  companyName?: string;
};

export default function LeadNotification({
  leadName,
  leadEmail,
  leadPhone,
  leadSource,
  companyName = "tu sitio",
}: LeadNotificationProps) {
  // Built as a list rather than three tags so the last row present can drop
  // its rule. A lead without a phone is normal, and a hairline hanging under
  // the final value with nothing beneath it reads as a row that failed to
  // render.
  const fields = [
    { label: "Email", value: leadEmail, href: leadEmail ? `mailto:${leadEmail}` : undefined },
    { label: "Teléfono", value: leadPhone, href: leadPhone ? `tel:${leadPhone}` : undefined },
    { label: "Origen", value: leadSource },
  ].filter((field) => Boolean(field.value));

  return (
    <Tailwind config={config}>
      <Html lang="es">
        <Head>
          <EmailHead />
        </Head>
        <Body className="e-canvas bg-canvas m-0 p-0 font-sans">
          <Preview>
            Nuevo lead: {leadName}
            {leadSource ? ` — ${leadSource}` : ""}
          </Preview>
          <Container className="mx-auto max-w-[560px] px-4 py-10">
            <Section className="e-surface e-stroke bg-surface border-stroke overflow-hidden rounded-[10px] border border-solid">
              <Section className="e-rule border-rule border-0 border-b border-solid px-7 py-6">
                <Text className="e-muted text-muted m-0 text-[11px] font-semibold tracking-[0.16em] uppercase">
                  Nuevo lead
                </Text>
                <Text className="e-ink text-ink m-0 mt-2 font-heading text-[28px] leading-[1.15] font-bold tracking-[-0.025em]">
                  {leadName}
                </Text>
              </Section>

              <Section className="px-7 py-2">
                {fields.map((field, index) => (
                  <Field key={field.label} {...field} rule={index < fields.length - 1} />
                ))}
              </Section>

              {leadEmail ? (
                <Section className="px-7 pt-4 pb-7">
                  <Link
                    href={`mailto:${leadEmail}`}
                    className="e-invert bg-ink inline-block rounded-[7px] px-5 py-3 text-[14px] font-semibold text-white no-underline"
                  >
                    Responder
                  </Link>
                </Section>
              ) : null}
            </Section>

            <Text className="e-muted text-muted m-0 mt-6 text-center text-[12px] leading-[1.6]">
              Se registró desde {companyName}.
            </Text>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

/** One labelled row. `rule` is off for the last one, so the block ends on the
 *  value rather than on a line under it. */
function Field({
  label,
  value,
  href,
  rule,
}: {
  label: string;
  value?: string;
  href?: string;
  rule?: boolean;
}) {
  if (!value) return null;
  return (
    <Row className={rule ? "e-rule border-rule border-0 border-b border-solid" : undefined}>
      <Column className="w-[35%] py-4 align-top">
        <Text className="e-muted text-muted m-0 text-[11px] font-semibold tracking-[0.1em] uppercase">
          {label}
        </Text>
      </Column>
      <Column className="w-[65%] py-4 text-right align-top">
        {href ? (
          <Link href={href} className="e-fg text-fg text-[14px] no-underline">
            {value}
          </Link>
        ) : (
          <Text className="e-fg text-fg m-0 text-[14px]">{value}</Text>
        )}
      </Column>
    </Row>
  );
}

export const templateMeta: EmailTemplateDefinition = {
  label: "Notificación de Lead",
  description: "Alerta cuando se registra un nuevo lead",
  subject: "Nuevo lead: {{leadName}}",
  variables: ["leadName", "leadEmail", "leadPhone", "leadSource", "companyName"],
  sample: {
    leadName: "Martín Alvarez",
    leadEmail: "martin@ejemplo.com",
    leadPhone: "+54 9 11 5555 1234",
    leadSource: "Formulario web",
    companyName: "Estudio Norte",
  },
};
