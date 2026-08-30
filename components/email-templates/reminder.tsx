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
 * Reminder — one fact, made unmissable.
 *
 * The date and time get the biggest type in the email because that is the only
 * thing anybody opens a reminder to find out.
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

export type ReminderProps = {
  recipientName: string;
  eventTitle: string;
  eventDate: string;
  eventTime?: string;
  eventLocation?: string;
  actionUrl?: string;
  actionLabel?: string;
  companyName?: string;
};

export default function Reminder({
  recipientName,
  eventTitle,
  eventDate,
  eventTime,
  eventLocation,
  actionUrl,
  actionLabel = "Ver detalles",
  companyName = "nuestro equipo",
}: ReminderProps) {
  return (
    <Tailwind config={config}>
      <Html lang="es">
        <Head>
          <EmailHead />
        </Head>
        <Body className="e-canvas bg-canvas m-0 p-0 font-sans">
          <Preview>
            {eventTitle} — {eventDate}
            {eventTime ? ` a las ${eventTime}` : ""}
          </Preview>
          <Container className="mx-auto max-w-[560px] px-4 py-10">
            <Section className="e-surface e-stroke bg-surface border-stroke overflow-hidden rounded-[10px] border border-solid">
              <Section className="px-7 pt-8 pb-6">
                <Text className="e-muted text-muted m-0 text-[11px] font-semibold tracking-[0.16em] uppercase">
                  Recordatorio
                </Text>
                <Text className="e-ink text-ink m-0 mt-3 font-heading text-[26px] leading-[1.2] font-bold tracking-[-0.025em]">
                  {eventTitle}
                </Text>
                <Text className="e-fg-2 text-fg-2 m-0 mt-3 text-[15px] leading-[1.6]">
                  Hola {recipientName}, te esperamos.
                </Text>
              </Section>

              <Section className="px-7 pb-7">
                <Section className="e-band e-stroke bg-band border-stroke rounded-[10px] border border-solid px-6 py-6">
                  <Text className="e-ink text-ink m-0 font-heading text-[24px] leading-[1.2] font-bold tracking-[-0.02em]">
                    {eventDate}
                  </Text>
                  {eventTime ? (
                    <Text className="e-ink text-ink m-0 mt-1 font-heading text-[34px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                      {eventTime}
                    </Text>
                  ) : null}
                  {eventLocation ? (
                    <Text className="e-fg-2 text-fg-2 m-0 mt-4 text-[14px] leading-[1.5]">
                      {eventLocation}
                    </Text>
                  ) : null}
                </Section>
              </Section>

              {actionUrl ? (
                <Section className="px-7 pb-8">
                  <Link
                    href={actionUrl}
                    className="e-invert bg-ink inline-block rounded-[7px] px-5 py-3 text-[14px] font-semibold text-white no-underline"
                  >
                    {actionLabel}
                  </Link>
                </Section>
              ) : null}

              <Section className="e-rule border-rule border-0 border-t border-solid px-7 py-5">
                <Row>
                  <Column className="align-middle">
                    <Text className="e-muted text-muted m-0 text-[12px] leading-[1.6]">
                      Si no podés asistir, respondé este email y lo reprogramamos.
                    </Text>
                  </Column>
                </Row>
              </Section>
            </Section>

            <Text className="e-muted text-muted m-0 mt-6 text-center text-[12px]">
              Enviado por {companyName}
            </Text>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

export const templateMeta: EmailTemplateDefinition = {
  label: "Recordatorio",
  description: "Recordatorio de evento o cita",
  subject: "Recordatorio: {{eventTitle}} el {{eventDate}}",
  variables: [
    "recipientName",
    "eventTitle",
    "eventDate",
    "eventTime",
    "eventLocation",
    "actionUrl",
    "actionLabel",
    "companyName",
  ],
  sample: {
    recipientName: "Lucía",
    eventTitle: "Consulta inicial",
    eventDate: "martes 9 de septiembre",
    eventTime: "15:30",
    eventLocation: "Av. Corrientes 1234, CABA",
    actionUrl: "https://ejemplo.com/turnos/123",
    actionLabel: "Ver detalles",
    companyName: "Estudio Norte",
  },
};
