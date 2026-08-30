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
 * Newsletter — the card one.
 *
 * A single bordered sheet on a tinted canvas, a display headline that can
 * carry a long title without collapsing, and a footer that puts the
 * unsubscribe link where people expect it instead of hiding it.
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

export type NewsletterProps = {
  title: string;
  subtitle?: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  companyName?: string;
  unsubscribeUrl?: string;
};

export default function Newsletter({
  title,
  subtitle,
  body,
  ctaText,
  ctaUrl,
  companyName = "nuestra plataforma",
  unsubscribeUrl,
}: NewsletterProps) {
  return (
    <Tailwind config={config}>
      <Html lang="es">
        <Head>
          <EmailHead />
        </Head>
        <Body className="e-canvas bg-canvas m-0 p-0 font-sans">
          <Preview>{subtitle || title}</Preview>
          <Container className="mx-auto max-w-[600px] px-4 py-10">
            <Section className="e-surface e-stroke bg-surface border-stroke overflow-hidden rounded-[12px] border border-solid">
              <Section className="e-rule border-rule border-0 border-b border-solid px-8 py-5">
                <Text className="e-muted text-muted m-0 text-[11px] font-semibold tracking-[0.18em] uppercase">
                  {companyName}
                </Text>
              </Section>

              <Section className="px-8 pt-12 pb-10">
                <Text className="e-ink text-ink m-0 max-w-[420px] font-heading text-[38px] leading-[1.08] font-bold tracking-[-0.035em]">
                  {title}
                </Text>
                {subtitle ? (
                  <Text className="e-fg-2 text-fg-2 m-0 mt-4 max-w-[440px] text-[16px] leading-[1.55]">
                    {subtitle}
                  </Text>
                ) : null}
              </Section>

              <Section className="e-band e-rule bg-band border-rule border-0 border-y border-solid px-8 py-10">
                <Text className="e-fg text-fg m-0 max-w-[460px] text-[15px] leading-[1.75]">{body}</Text>
                {ctaText && ctaUrl ? (
                  <Text className="m-0 mt-8">
                    <Link
                      href={ctaUrl}
                      className="e-invert bg-ink inline-block rounded-[7px] px-5 py-3.5 text-[14px] font-semibold text-white no-underline"
                    >
                      {ctaText}
                    </Link>
                  </Text>
                ) : null}
              </Section>

              <Section className="px-8 py-10">
                <Text className="e-fg-2 text-fg-2 m-0 max-w-[380px] text-[13px] leading-[1.65]">
                  ¿Tenés algo para contarnos? Respondé este email — lo leemos
                  todo.
                </Text>
                <Row align="left">
                  <Column className="w-full pt-6 align-top">
                    <Text className="e-muted text-muted m-0 text-[11px] leading-[1.7]">
                      Recibís este email porque te suscribiste a las novedades de{" "}
                      {companyName}.
                      {unsubscribeUrl ? " " : ""}
                      {unsubscribeUrl ? (
                        <Link href={unsubscribeUrl} className="e-muted text-muted underline">
                          Darse de baja
                        </Link>
                      ) : null}
                    </Text>
                  </Column>
                </Row>
              </Section>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

export const templateMeta: EmailTemplateDefinition = {
  label: "Newsletter",
  description: "Plantilla base para newsletters y emails de marketing",
  subject: "{{title}}",
  variables: ["title", "subtitle", "body", "ctaText", "ctaUrl", "companyName", "unsubscribeUrl"],
  sample: {
    title: "Novedades de septiembre",
    subtitle: "Lo que estuvimos construyendo este mes",
    body: "Sumamos recordatorios automáticos por WhatsApp, un editor de formularios nuevo y reportes que ya no hay que exportar a mano.",
    ctaText: "Ver las novedades",
    ctaUrl: "https://ejemplo.com/novedades",
    companyName: "Estudio Norte",
    unsubscribeUrl: "https://ejemplo.com/baja",
  },
};
