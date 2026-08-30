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
 * Invoice — a receipt, laid out like one.
 *
 * Ruled rows, tabular figures and a total that is the only bold number on the
 * page. The fine print at the bottom is deliberately small and grey: it has to
 * be there, it doesn't have to compete.
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

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceProps = {
  invoiceNumber: string;
  recipientName: string;
  items: InvoiceItem[];
  total: number;
  currency?: string;
  dueDate?: string;
  payUrl?: string;
  companyName?: string;
};

export default function Invoice({
  invoiceNumber,
  recipientName,
  items,
  total,
  currency = "USD",
  dueDate,
  payUrl,
  companyName = "nuestra plataforma",
}: InvoiceProps) {
  // An automation can hand this a single item, or a string, or nothing —
  // rendering has to survive all three rather than throwing inside `.map`.
  const lines: InvoiceItem[] = Array.isArray(items) ? items : [];
  const money = (value: number) =>
    `${currency} ${Number(value).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <Tailwind config={config}>
      <Html lang="es">
        <Head>
          <EmailHead />
        </Head>
        <Body className="e-canvas bg-canvas m-0 p-0 font-sans">
          <Preview>
            Factura {invoiceNumber} — {money(total)}
          </Preview>
          <Container className="mx-auto max-w-[600px] px-4 py-10">
            <Section className="e-surface e-stroke bg-surface border-stroke overflow-hidden rounded-[12px] border border-solid">
              <Section className="e-rule border-rule border-0 border-b border-solid px-8 py-6">
                <Row>
                  <Column className="align-middle">
                    <Text className="e-muted text-muted m-0 text-[11px] font-semibold tracking-[0.18em] uppercase">
                      {companyName}
                    </Text>
                  </Column>
                  <Column align="right" className="align-middle">
                    <Text className="e-muted text-muted m-0 text-[11px] font-semibold tracking-[0.18em] uppercase">
                      Factura
                    </Text>
                  </Column>
                </Row>
              </Section>

              <Section className="px-8 pt-8 pb-6">
                <Text className="e-ink text-ink m-0 font-heading text-[30px] leading-[1.15] font-bold tracking-[-0.03em] tabular-nums">
                  #{invoiceNumber}
                </Text>
                <Text className="e-fg-2 text-fg-2 m-0 mt-3 text-[15px] leading-[1.6]">
                  Hola {recipientName}, acá está el detalle.
                </Text>
              </Section>

              <Section className="e-band e-rule bg-band border-rule border-0 border-y border-solid px-8 py-5">
                <Row>
                  <Column className="w-1/2 align-top">
                    <Text className="e-muted text-muted m-0 text-[10px] font-semibold tracking-[0.14em] uppercase">
                      Facturado a
                    </Text>
                    <Text className="e-fg text-fg m-0 mt-1 text-[13px]">{recipientName}</Text>
                  </Column>
                  <Column className="w-1/2 align-top">
                    <Text className="e-muted text-muted m-0 text-[10px] font-semibold tracking-[0.14em] uppercase">
                      Vencimiento
                    </Text>
                    <Text className="e-fg text-fg m-0 mt-1 text-[13px]">{dueDate ?? "—"}</Text>
                  </Column>
                </Row>
              </Section>

              <Section className="px-8 pt-6">
                <Row className="e-rule border-rule border-0 border-b border-solid">
                  <Column className="w-[58%] pb-2 align-bottom">
                    <Text className="e-muted text-muted m-0 text-[10px] font-semibold tracking-[0.14em] uppercase">
                      Descripción
                    </Text>
                  </Column>
                  <Column className="w-[12%] pb-2 text-right align-bottom">
                    <Text className="e-muted text-muted m-0 text-[10px] font-semibold tracking-[0.14em] uppercase">
                      Cant.
                    </Text>
                  </Column>
                  <Column className="w-[30%] pb-2 text-right align-bottom">
                    <Text className="e-muted text-muted m-0 text-[10px] font-semibold tracking-[0.14em] uppercase">
                      Importe
                    </Text>
                  </Column>
                </Row>

                {lines.map((item, index) => (
                  <Row key={index} className="e-rule border-rule border-0 border-b border-solid">
                    <Column className="w-[58%] py-4 align-top">
                      <Text className="e-fg text-fg m-0 text-[14px] leading-[1.45]">
                        {item.description}
                      </Text>
                    </Column>
                    <Column className="w-[12%] py-4 text-right align-top">
                      <Text className="e-fg-2 text-fg-2 m-0 text-[14px] tabular-nums">{item.quantity}</Text>
                    </Column>
                    <Column className="w-[30%] py-4 text-right align-top">
                      <Text className="e-fg text-fg m-0 text-[14px] tabular-nums">
                        {money(item.unitPrice * item.quantity)}
                      </Text>
                    </Column>
                  </Row>
                ))}

                <Row>
                  <Column className="w-[58%] py-5 align-middle">
                    <Text className="e-muted text-muted m-0 text-[10px] font-semibold tracking-[0.14em] uppercase">
                      Total
                    </Text>
                  </Column>
                  <Column className="w-[42%] py-5 text-right align-middle">
                    <Text className="e-ink text-ink m-0 font-heading text-[22px] font-bold tracking-[-0.02em] tabular-nums">
                      {money(total)}
                    </Text>
                  </Column>
                </Row>
              </Section>

              {payUrl ? (
                <Section className="px-8 pb-8">
                  <Link
                    href={payUrl}
                    className="e-invert bg-ink inline-block rounded-[7px] px-5 py-3.5 text-[14px] font-semibold text-white no-underline"
                  >
                    Pagar ahora
                  </Link>
                </Section>
              ) : null}

              <Section className="e-rule border-rule border-0 border-t border-solid px-8 py-8">
                <Text className="e-muted text-muted m-0 max-w-[400px] text-[11px] leading-[1.7]">
                  Si algo no cierra, respondé este email con el número de factura
                  y lo revisamos. Enviado por {companyName}.
                </Text>
              </Section>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

export const templateMeta: EmailTemplateDefinition = {
  label: "Factura",
  description: "Plantilla para facturas con desglose de items",
  subject: "Factura {{invoiceNumber}}",
  variables: [
    "invoiceNumber",
    "recipientName",
    "items",
    "total",
    "currency",
    "dueDate",
    "payUrl",
    "companyName",
  ],
  sample: {
    invoiceNumber: "A-0042",
    recipientName: "Martín Alvarez",
    items: [
      { description: "Consultoría — septiembre", quantity: 12, unitPrice: 85 },
      { description: "Soporte mensual", quantity: 1, unitPrice: 240 },
    ],
    total: 1260,
    currency: "USD",
    dueDate: "30 de septiembre",
    payUrl: "https://ejemplo.com/pagar/A-0042",
    companyName: "Estudio Norte",
  },
};
