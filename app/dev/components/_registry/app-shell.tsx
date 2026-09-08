"use client";

// app/_components — las piezas que solo existen dentro de la app firmada: la
// tarjeta del panel, los tiles de métrica, las gráficas y las pastillas que
// dependen de tipos del dominio.

import { BubbleChatIcon, CallIcon, UserMultipleIcon } from "@hugeicons/core-free-icons";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardSeparator,
  CardTitle,
} from "@/app/_components/dashboard-card";
import { RankedBars, TimeSeries } from "@/app/_components/chart";
import { ChannelBadge, ChannelIcon } from "@/app/_components/channel-badge";
import { KpiBars, KpiCard, KpiSparkline, KpiSplit } from "@/app/_components/kpi-card";
import { ProspectBadge } from "@/app/_components/prospect-badge";
import type { ContactChannel } from "@/lib/types";
import type { Section } from "../_lib/types";

const CHANNELS: readonly ContactChannel[] = ["whatsapp", "instagram", "web", "form", "voice"];

const SERIES = [
  { key: "l", label: "Lun", value: 128 },
  { key: "m", label: "Mar", value: 164 },
  { key: "x", label: "Mié", value: 96 },
  { key: "j", label: "Jue", value: 212 },
  { key: "v", label: "Vie", value: 188 },
  { key: "s", label: "Sáb", value: 74 },
  { key: "d", label: "Dom", value: 41 },
] as const;

export const appShell: Section = {
  id: "app",
  title: "Piezas de la app",
  desc:
    "app/_components — la tarjeta, los tiles y las gráficas del panel. Dependen "
    + "de tipos de lib/types.ts, así que no se sacan a una librería sin arrastrar "
    + "el dominio con ellas.",
  entries: [
    {
      id: "dashboard-card",
      name: "Card",
      source: "app/_components/dashboard-card.tsx",
      importLine: 'import { Card, CardBody, CardDescription, CardHeader, CardSeparator, CardTitle } from "@/app/_components/dashboard-card";',
      desc:
        "La superficie elevada del panel. `interactive` añade el hover que sube la "
        + "sombra — solo para las tarjetas que llevan a algún sitio.",
      exports: ["Card", "CardHeader", "CardBody", "CardTitle", "CardDescription", "CardSeparator"],
      props: [
        { name: "interactive", type: "boolean", desc: "Hover elevado y cursor de puntero." },
        { name: "onClick", type: "() => void", desc: "" },
        { name: "style", type: "CSSProperties", desc: "Para el retardo de entrada escalonado." },
      ],
      demos: [
        {
          id: "dashboard-card-basic",
          title: "Estática e interactiva",
          surface: "page",
          code: `<Card interactive>
  <CardHeader>
    <CardTitle>Conversaciones</CardTitle>
    <CardDescription>Últimos 7 días</CardDescription>
  </CardHeader>
  <CardSeparator />
  <CardBody>…</CardBody>
</Card>`,
          render: (
            <div className="grid w-full gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Conversaciones</CardTitle>
                  <CardDescription>Últimos 7 días</CardDescription>
                </CardHeader>
                <CardSeparator />
                <CardBody>
                  <p className="text-sm text-muted-foreground">903 mensajes en 5 canales.</p>
                </CardBody>
              </Card>
              <Card interactive>
                <CardHeader>
                  <CardTitle>Automatizaciones</CardTitle>
                  <CardDescription>interactive</CardDescription>
                </CardHeader>
                <CardSeparator />
                <CardBody>
                  <p className="text-sm text-muted-foreground">Pasa el ratón por encima.</p>
                </CardBody>
              </Card>
            </div>
          ),
        },
      ],
    },
    {
      id: "kpi-card",
      name: "KpiCard",
      source: "app/_components/kpi-card.tsx",
      importLine: 'import { KpiCard, KpiBars, KpiSparkline, KpiSplit } from "@/app/_components/kpi-card";',
      desc:
        "El tile de una métrica: cifra, etiqueta, delta y su propio dibujo. Los tres "
        + "dibujos comparten los roles de color con las gráficas, porque «warning» "
        + "tiene que significar lo mismo en un tile y en un chart.",
      exports: ["KpiCard", "KpiBars", "KpiSparkline", "KpiSplit"],
      props: [
        { name: "value", type: "number | string", required: true, desc: "Ya formateada si lleva unidad." },
        { name: "label", type: "string", required: true, desc: "" },
        { name: "icon", type: "IconSvgElement", required: true, desc: "De @hugeicons/core-free-icons." },
        { name: "delta", type: "KpiDelta", desc: "{ direction, value, label?, tone? }. Ocupa la línea de sub." },
        { name: "sub", type: "string", desc: "Contexto en prosa, cuando no hay delta." },
        { name: "visual", type: "ReactNode", desc: "KpiBars, KpiSparkline, KpiSplit o cualquier nodo." },
        { name: "ratio (Bars)", type: "number", desc: "0–1, recortado." },
        { name: "points (Sparkline)", type: "readonly number[]", desc: "Mínimo dos; se escala a su propio rango." },
        { name: "parts (Split)", type: "{ tone, value }[]", desc: "Una barra dividida por tono." },
      ],
      notes: [
        "Una latencia que baja es direction: \"down\" con tone: \"positive\" — sin el tono, el tile colorea por dirección, que es lo correcto para un contador pero no para un tiempo.",
      ],
      demos: [
        {
          id: "kpi-card-basic",
          title: "Los tres dibujos",
          surface: "page",
          code: `<KpiCard
  icon={BubbleChatIcon}
  label="Conversaciones"
  value="1.284"
  delta={{ direction: "up", value: "+8,4 %", label: "vs. semana pasada" }}
  visual={<KpiSparkline points={[4, 9, 6, 12, 10, 16]} tone="positive" />}
/>`,
          render: (
            <div className="grid w-full gap-4 sm:grid-cols-3">
              <KpiCard
                icon={BubbleChatIcon}
                label="Conversaciones"
                value="1.284"
                delta={{ direction: "up", value: "+8,4 %", label: "vs. semana pasada" }}
                visual={<KpiSparkline points={[4, 9, 6, 12, 10, 16]} tone="positive" />}
              />
              <KpiCard
                icon={CallIcon}
                label="Latencia media"
                value="1,9 s"
                delta={{ direction: "down", value: "−0,4 s", tone: "positive" }}
                visual={<KpiBars ratio={0.36} tone="positive" />}
              />
              <KpiCard
                icon={UserMultipleIcon}
                label="Prospectos"
                value="312"
                sub="Repartidos por etapa"
                visual={
                  <KpiSplit
                    parts={[
                      { tone: "positive", value: 140 },
                      { tone: "warning", value: 96 },
                      { tone: "critical", value: 76 },
                    ]}
                  />
                }
              />
            </div>
          ),
        },
      ],
    },
    {
      id: "chart",
      name: "Gráficas",
      source: "app/_components/chart.tsx",
      importLine: 'import { RankedBars, TimeSeries } from "@/app/_components/chart";',
      desc:
        "Dos gráficas hechas a mano, sin librería: barras ordenadas y una serie "
        + "temporal. Cada columna de la serie es un botón real, así que los valores "
        + "no viven solo en el hover.",
      exports: ["RankedBars", "TimeSeries", "ChartTone", "RankedBar", "TimePoint"],
      props: [
        { name: "bars", type: "readonly RankedBar[]", required: true, desc: "{ key, label, formatted, value, tone? }." },
        { name: "limit (RankedBars)", type: "number", def: "6", desc: "A partir de ahí una lista ordenada deja de leerse." },
        { name: "data (TimeSeries)", type: "readonly TimePoint[]", required: true, desc: "{ key, label, value }." },
        { name: "formatValue (TimeSeries)", type: "(point: TimePoint) => ReactNode", required: true, desc: "El cuerpo del tooltip de cada cubo." },
        { name: "height (TimeSeries)", type: "number", def: "148", desc: "" },
        { name: "markers (TimeSeries)", type: "ReadonlySet<string>", desc: "Claves de cubos a señalar con un punto — el día que se tocó algo. Lo que dice el marcador va en el tooltip del cubo." },
        { name: "tone", type: '"critical" | "neutral" | "positive" | "warning"', def: '"neutral"', desc: "Respaldo para las filas que no traen el suyo." },
        { name: "emptyLabel", type: "string", required: true, desc: "Qué se dice cuando no hay filas." },
      ],
      demos: [
        {
          id: "chart-ranked",
          title: "RankedBars",
          code: `<RankedBars
  emptyLabel="Sin datos"
  bars={[{ key: "wa", label: "WhatsApp", formatted: "612", value: 612 }]}
/>`,
          render: (
            <div className="w-full max-w-md">
              <RankedBars
                emptyLabel="Sin datos todavía"
                bars={[
                  { key: "wa", label: "WhatsApp", formatted: "612", value: 612 },
                  { key: "ig", label: "Instagram", formatted: "218", value: 218 },
                  { key: "web", label: "Web", formatted: "144", value: 144, tone: "positive" },
                  { key: "form", label: "Formulario", formatted: "29", value: 29 },
                ]}
              />
            </div>
          ),
        },
        {
          id: "chart-series",
          title: "TimeSeries",
          desc: "Pasa el ratón o tabula por las columnas.",
          code: `<TimeSeries
  data={data}
  emptyLabel="Sin actividad"
  formatValue={(point) => \`\${point.value} mensajes · \${point.label}\`}
/>`,
          render: (
            <div className="w-full max-w-lg">
              <TimeSeries
                data={SERIES}
                emptyLabel="Sin actividad"
                formatValue={(point) => `${point.value} mensajes · ${point.label}`}
              />
            </div>
          ),
        },
      ],
    },
    {
      id: "channel-badge",
      name: "ChannelBadge",
      source: "app/_components/channel-badge.tsx",
      importLine: 'import { ChannelBadge, ChannelIcon, ChannelStatusBadge } from "@/app/_components/channel-badge";',
      desc:
        "Por dónde entró un contacto. WhatsApp e Instagram son productos y "
        + "conservan su nombre en todos los idiomas; «formulario» y «voz» son "
        + "nombres comunes y sí se traducen.",
      exports: ["ChannelBadge", "ChannelIcon", "ChannelStatusBadge", "CHANNEL_LABELS"],
      props: [
        { name: "channel", type: '"web" | "whatsapp" | "instagram" | "form" | "voice"', required: true, desc: "Un valor fuera de la unión cae al icono de globo en vez de romper la página." },
        { name: "status (StatusBadge)", type: '"connected" | "disconnected" | "error"', desc: "" },
      ],
      demos: [
        {
          id: "channel-badge-all",
          title: "Los cinco canales",
          code: '<ChannelBadge channel="whatsapp" />',
          render: (
            <>
              {CHANNELS.map((channel) => (
                <ChannelBadge key={channel} channel={channel} />
              ))}
            </>
          ),
        },
        {
          id: "channel-icon",
          title: "Solo el icono",
          code: '<ChannelIcon channel="instagram" />',
          render: (
            <>
              {CHANNELS.map((channel) => (
                <ChannelIcon key={channel} channel={channel} className="text-muted-foreground" />
              ))}
            </>
          ),
        },
      ],
    },
    {
      id: "prospect-badge",
      name: "ProspectBadge",
      source: "app/_components/prospect-badge.tsx",
      importLine: 'import { ProspectBadge } from "@/app/_components/prospect-badge";',
      desc:
        "Dónde quedó comercialmente una conversación. Es un StatusBadge con el "
        + "mapeo etapa → variante ya hecho, y el motivo en el title porque una "
        + "frase no cabe en una pastilla.",
      props: [
        { name: "prospect", type: "ProspectAssessment | undefined", required: true, desc: "Sin valoración pinta «sin valorar» en vez de nada." },
      ],
      demos: [
        {
          id: "prospect-badge-stages",
          title: "Etapas",
          code: '<ProspectBadge prospect={conversation.prospect} />',
          render: (
            <>
              {(["won", "negotiating", "interested", "lost", "support"] as const).map((stage) => (
                <ProspectBadge
                  key={stage}
                  prospect={{
                    stage,
                    reason: "Pidió precio y dejó teléfono.",
                    assessedAt: "2026-09-05T10:00:00.000Z",
                    turnCount: 12,
                    source: "ai",
                  }}
                />
              ))}
              <ProspectBadge prospect={undefined} />
            </>
          ),
        },
      ],
    },
    {
      id: "page-container",
      name: "PageContainer",
      source: "app/_components/page-container.tsx",
      importLine: 'import { PageContainer } from "@/app/_components/page-container";',
      desc:
        "El envoltorio de toda página dentro de AppShell: ancho máximo, padding, "
        + "patrón de fondo y la animación de entrada, en un solo sitio.",
      props: [
        { name: "maxWidth", type: "string", def: '"max-w-5xl"', desc: "Clase de Tailwind. Ajustes usa max-w-xl." },
        { name: "pattern", type: '"grid" | "crosses" | "diagonals" | "brackets" | "none"', def: '"grid"', desc: "El patrón fijo detrás del contenido, al 30 %." },
      ],
      demos: [
        {
          id: "page-container-patterns",
          title: "Los cuatro patrones",
          desc: "Aquí recortados en una caja; en una página real ocupan el viewport entero.",
          surface: "page",
          code: '<PageContainer pattern="crosses" maxWidth="max-w-xl">…</PageContainer>',
          render: (
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              {(["grid", "crosses", "diagonals", "brackets"] as const).map((pattern) => (
                <div
                  key={pattern}
                  className="relative h-24 overflow-hidden rounded-xl border border-border bg-background"
                >
                  <div
                    className={`pointer-events-none absolute inset-0 opacity-30 bg-pattern bg-pattern-${pattern} bg-pattern-fade`}
                  />
                  <span className="absolute bottom-2 left-2 font-mono text-[10.5px] text-muted-foreground">
                    {pattern}
                  </span>
                </div>
              ))}
            </div>
          ),
        },
      ],
    },
    {
      id: "misc-app",
      name: "Otras piezas de la app",
      source: "app/_components/",
      importLine: 'import { … } from "@/app/_components/…";',
      desc:
        "Componentes que solo se leen dentro de su pantalla: piden datos, una "
        + "sesión o un negocio seleccionado, así que un demo suelto aquí mentiría "
        + "sobre lo que hacen. Se listan para que se sepa que existen.",
      exports: [
        "AppShell",
        "AgentChat",
        "AgentMessage",
        "BusinessSwitcher",
        "BusinessesCard",
        "ContactDialog",
        "CredentialField",
        "FeaturesDialog",
        "SoundSettings",
        "TutorialVideoDialog",
        "WebhookUrlNote",
        "AdsRows",
        "DockReopenButton",
      ],
      demos: [
        {
          id: "misc-app-note",
          title: "Dónde mirarlos",
          code: "ls app/_components/",
          render: (
            <p className="text-sm text-muted-foreground">
              Cada uno se ve en su pantalla: el chat en{" "}
              <code className="font-mono text-xs">/agents/[id]</code>, el selector de negocio en la
              barra lateral, CredentialField en{" "}
              <code className="font-mono text-xs">/settings</code>.
            </p>
          ),
        },
      ],
    },
  ],
};
