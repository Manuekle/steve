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
 * Welcome — the dark, editorial one.
 *
 * Type does the work: a condensed uppercase display line, a lot of air, and
 * rules instead of boxes. No remote images anywhere in these templates, on
 * purpose — an image that 404s in someone's inbox looks far worse than no
 * image at all, and half of all clients block them by default regardless.
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

export type WelcomeTemplateProps = {
  firstName: string;
  companyName?: string;
  loginUrl?: string;
};

export default function WelcomeTemplate({
  firstName,
  companyName = "nuestra plataforma",
  loginUrl = "#",
}: WelcomeTemplateProps) {
  return (
    <Tailwind config={config}>
      <Html lang="es">
        <Head>
          <EmailHead />
        </Head>
        <Body className="e-canvas bg-canvas m-0 p-0 font-sans">
          <Preview>
            {firstName}, tu cuenta de {companyName} ya está lista
          </Preview>
          <Container className="e-surface bg-surface mx-auto max-w-[640px] p-0">
            <Section className="px-8 py-7">
              <Text className="e-muted text-muted m-0 text-[11px] font-semibold tracking-[0.18em] uppercase">
                {companyName}
              </Text>
            </Section>

            <Section className="px-8 pt-10 pb-12">
              <Text className="e-fg text-fg m-0 max-w-[460px] font-display text-[46px] leading-[1.05] font-medium tracking-[0.005em] uppercase">
                Bienvenido a {companyName}
              </Text>
              <Text className="e-fg-2 text-fg-2 m-0 mt-8 max-w-[440px] text-[15px] leading-[1.65]">
                Hola {firstName}. Tu cuenta ya está lista. Podés empezar a usarla
                ahora mismo, dejar tu espacio configurado y sumar a tu equipo
                cuando quieras.
              </Text>
              <Text className="m-0 mt-8">
                <Link
                  href={loginUrl}
                  className="e-invert bg-ink inline-block text-white px-6 py-3.5 text-[14px] font-semibold no-underline"
                >
                  Entrar a mi cuenta
                </Link>
              </Text>
            </Section>

            <Section className="e-stroke border-stroke border-0 border-t border-solid px-8 pt-14 pb-12">
              <Text className="e-fg text-fg m-0 font-display text-[28px] leading-[1.1] font-medium tracking-[0.01em] uppercase">
                Primeros pasos
              </Text>

              <Section className="e-stroke border-stroke border-0 border-b border-solid py-9">
                <Text className="e-fg text-fg m-0 text-[18px] font-semibold">
                  Configurá tu espacio
                </Text>
                <Text className="e-fg-2 text-fg-2 m-0 mt-2 max-w-[420px] text-[14px] leading-[1.6]">
                  Cargá tus datos y dejá todo listo para trabajar. Son dos
                  minutos y se hace una sola vez.
                </Text>
                <Text className="m-0 mt-4">
                  <Link href={loginUrl} className="e-fg text-fg text-[14px] font-medium underline">
                    Completar configuración
                  </Link>
                </Text>
              </Section>

              <Section className="e-stroke border-stroke border-0 border-b border-solid py-9">
                <Text className="e-fg text-fg m-0 text-[18px] font-semibold">
                  Sumá a tu equipo
                </Text>
                <Text className="e-fg-2 text-fg-2 m-0 mt-2 max-w-[420px] text-[14px] leading-[1.6]">
                  Todo funciona mejor cuando cada uno ve lo suyo sin tener que
                  preguntarlo.
                </Text>
                <Text className="m-0 mt-4">
                  <Link href={loginUrl} className="e-fg text-fg text-[14px] font-medium underline">
                    Invitar compañeros
                  </Link>
                </Text>
              </Section>

              <Section className="pt-12">
                <Text className="e-fg text-fg m-0 text-[15px] font-semibold">¿Necesitás una mano?</Text>
                <Text className="e-fg-2 text-fg-2 m-0 mt-1 max-w-[420px] text-[13px] leading-[1.6]">
                  Respondé este email y te contestamos nosotros, no un bot.
                </Text>
              </Section>
            </Section>

            <Section className="e-stroke border-stroke border-0 border-t border-solid px-8 py-14">
              <Text className="e-fg-2 text-fg-2 m-0 max-w-[320px] text-[13px] leading-[1.6]">
                {companyName} — todo tu trabajo en un solo lugar, de la primera
                idea al resultado.
              </Text>
              <Row align="left">
                <Column className="w-full pt-8 align-top">
                  <Text className="e-muted text-muted m-0 text-[11px] leading-[1.6]">
                    Recibís este email porque creaste una cuenta en {companyName}.
                  </Text>
                </Column>
              </Row>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

export const templateMeta: EmailTemplateDefinition = {
  label: "Bienvenida",
  description: "Email de bienvenida para nuevos usuarios",
  subject: "Bienvenido a {{companyName}}",
  variables: ["firstName", "companyName", "loginUrl"],
  sample: {
    firstName: "Lucía",
    companyName: "Estudio Norte",
    loginUrl: "https://ejemplo.com/entrar",
  },
};
