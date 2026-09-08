"use client";

// components/ai-elements — las piezas de la superficie de chat: estados de
// espera, bloques de razonamiento, llamadas a herramientas y la navegación
// que las rodea.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NotificationBadge } from "@/components/ai-elements/notification-badge";
import { Pagination } from "@/components/ai-elements/pagination";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { LicenseCreditCard } from "@/components/ai-elements/license-credit-card";
import { Skeleton, SkeletonAvatar, SkeletonBar } from "@/components/ai-elements/skeleton";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { SuccessCheck } from "@/components/ai-elements/success-check";
import type { LicenseInfo } from "@/lib/license/types";
import type { Section } from "../_lib/types";

// ── Hosts con estado ────────────────────────────────────────────────

function TabsDemo() {
  const [tab, setTab] = useState("todos");
  return (
    <SlidingTabs
      value={tab}
      onValueChange={setTab}
      tabs={[
        { id: "todos", label: "Todos" },
        { id: "abiertos", label: "Abiertos" },
        { id: "humano", label: "Con humano" },
      ]}
    />
  );
}

function PaginationDemo() {
  const [page, setPage] = useState(3);
  const [size, setSize] = useState(25);
  return (
    <Pagination
      page={page}
      pageCount={12}
      pageSize={size}
      onPageChange={setPage}
      onPageSizeChange={setSize}
    />
  );
}

function SkeletonDemo() {
  const [loading, setLoading] = useState(true);
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <Skeleton
        isLoading={loading}
        skeleton={
          <div className="flex items-center gap-3">
            <SkeletonAvatar />
            <div className="flex flex-1 flex-col gap-2">
              <SkeletonBar className="h-3" width="60%" />
              <SkeletonBar className="h-3" width="85%" />
            </div>
          </div>
        }
      >
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
            MG
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">María G.</p>
            <p className="truncate text-xs text-muted-foreground">
              ¿Tenéis cita para el jueves por la tarde?
            </p>
          </div>
        </div>
      </Skeleton>
      <Button variant="outline" size="sm" className="w-fit" onClick={() => setLoading((v) => !v)}>
        {loading ? "Cargar" : "Volver a esqueleto"}
      </Button>
    </div>
  );
}

function SuccessCheckDemo() {
  const [active, setActive] = useState(false);
  return (
    <div className="flex items-center gap-4">
      <SuccessCheck active={active} />
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setActive(true);
          window.setTimeout(() => setActive(false), 1800);
        }}
      >
        Dibujar
      </Button>
    </div>
  );
}

// ── Licencia ────────────────────────────────────────────────────────
//
// La tarjeta se dibuja sola con lo que le pasás, así que el catálogo no
// necesita `/api/license`: acá van una licencia viva y una vencida.

function licenseFixture(overrides: Partial<LicenseInfo> = {}): LicenseInfo {
  return {
    status: "valid",
    maintenanceActive: true,
    daysUntilMaintenanceEnds: 214,
    installationMatches: true,
    payload: {
      licenseId: "9f14c2a7-63be-4d10-9d2f-5b81c0e4a733",
      company: "Estudio Bellagamba",
      customerEmail: "hola@bellagamba.ar",
      edition: "enterprise",
      deploymentType: "self-hosted",
      features: [],
      issuedAt: "2026-02-11T00:00:00.000Z",
      maintenanceUntil: "2027-03-01T00:00:00.000Z",
      schemaVersion: 1,
    },
    ...overrides,
  };
}

export const aiElements: Section = {
  id: "ai-elements",
  title: "Elementos de agente",
  desc:
    "components/ai-elements — lo que dibuja la conversación: esperas, "
    + "razonamiento, herramientas y la navegación de las listas largas.",
  entries: [
    {
      id: "sliding-tabs",
      name: "SlidingTabs",
      source: "components/ai-elements/sliding-tabs.tsx",
      importLine: 'import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";',
      desc: "Pestañas con la píldora activa deslizándose entre ellas con un layout compartido.",
      props: [
        { name: "tabs", type: "readonly SlidingTab[]", required: true, desc: "{ id, label }." },
        { name: "value", type: "string", required: true, desc: "El id activo." },
        { name: "onValueChange", type: "(id: string) => void", required: true, desc: "" },
        { name: "trailing", type: "ReactNode", desc: "Contenido a la derecha, dentro de la barra." },
      ],
      demos: [
        {
          id: "sliding-tabs-basic",
          title: "Tres pestañas",
          code: `<SlidingTabs
  value={tab}
  onValueChange={setTab}
  tabs={[{ id: "todos", label: "Todos" }, { id: "abiertos", label: "Abiertos" }]}
/>`,
          render: <TabsDemo />,
        },
      ],
    },
    {
      id: "pagination",
      name: "Pagination",
      source: "components/ai-elements/pagination.tsx",
      importLine: 'import { Pagination } from "@/components/ai-elements/pagination";',
      desc: "Anterior/siguiente, número de página y, si se pide, tamaño de página.",
      props: [
        { name: "page", type: "number", required: true, desc: "Página actual, base 1." },
        { name: "pageCount", type: "number", required: true, desc: "Total de páginas." },
        { name: "onPageChange", type: "(page: number) => void", required: true, desc: "" },
        { name: "pageSize", type: "number", desc: "Muestra el selector de tamaño." },
        { name: "onPageSizeChange", type: "(size: number) => void", desc: "" },
        { name: "pageSizeOptions", type: "readonly number[]", desc: "Opciones del selector." },
      ],
      demos: [
        {
          id: "pagination-basic",
          title: "Con tamaño de página",
          code: `<Pagination page={page} pageCount={12} pageSize={size}
  onPageChange={setPage} onPageSizeChange={setSize} />`,
          render: <PaginationDemo />,
        },
      ],
    },
    {
      id: "skeleton",
      name: "Skeleton",
      source: "components/ai-elements/skeleton.tsx",
      importLine: 'import { Skeleton, SkeletonBar, SkeletonAvatar } from "@/components/ai-elements/skeleton";',
      desc:
        "Cruza el esqueleto con el contenido real en vez de intercambiarlos: el "
        + "hueco no salta cuando llegan los datos. Los esqueletos de página enteros "
        + "también viven aquí.",
      exports: [
        "Skeleton",
        "SkeletonBar",
        "SkeletonAvatar",
        "DashboardSkeleton",
        "ChatsSkeleton",
        "AutomationsSkeleton",
        "SettingsSkeleton",
      ],
      props: [
        { name: "isLoading", type: "boolean", required: true, desc: "" },
        { name: "skeleton", type: "ReactNode", required: true, desc: "El marcador de posición." },
        { name: "children", type: "ReactNode", required: true, desc: "El contenido real." },
        { name: "width (Bar)", type: "string", desc: "Cualquier medida CSS." },
        { name: "size (Avatar)", type: "string", def: '"size-9"', desc: "Clase de Tailwind, no un número." },
      ],
      demos: [
        {
          id: "skeleton-basic",
          title: "Carga y disolución",
          code: `<Skeleton isLoading={loading} skeleton={<SkeletonBar className="h-3" width="60%" />}>
  <p>María G.</p>
</Skeleton>`,
          render: <SkeletonDemo />,
        },
      ],
    },
    {
      id: "success-check",
      name: "SuccessCheck",
      source: "components/ai-elements/success-check.tsx",
      importLine: 'import { SuccessCheck } from "@/components/ai-elements/success-check";',
      desc: "El check dibujándose de un trazo cuando algo sale bien.",
      props: [
        { name: "active", type: "boolean", required: true, desc: "Pasar de false a true dispara el trazo." },
      ],
      demos: [
        {
          id: "success-check-basic",
          title: "Dispáralo",
          code: '<SuccessCheck active={saved} />',
          render: <SuccessCheckDemo />,
        },
      ],
    },
    {
      id: "notification-badge",
      name: "NotificationBadge",
      source: "components/ai-elements/notification-badge.tsx",
      importLine: 'import { NotificationBadge } from "@/components/ai-elements/notification-badge";',
      desc: "El contador rojo del sidebar. Con 0 o sin valor no se dibuja.",
      props: [
        { name: "count", type: "number", desc: "0 o undefined esconden la pastilla." },
      ],
      demos: [
        {
          id: "notification-badge-basic",
          title: "Con y sin cuenta",
          code: '<NotificationBadge count={3} />',
          render: (
            <div className="flex items-center gap-6">
              <div className="relative">
                <Button variant="outline" size="icon-sm" aria-label="Conversaciones">
                  ●
                </Button>
                <NotificationBadge count={3} />
              </div>
              <div className="relative">
                <Button variant="outline" size="icon-sm" aria-label="Conversaciones">
                  ●
                </Button>
                <NotificationBadge count={128} />
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "reasoning",
      name: "Reasoning",
      source: "components/ai-elements/reasoning.tsx",
      importLine: 'import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";',
      desc:
        "El bloque de «pensó durante N s». Se abre solo mientras llega el flujo y se "
        + "cierra un segundo después de terminar, salvo que lo hayan abierto a mano.",
      exports: ["Reasoning", "ReasoningTrigger", "ReasoningContent", "useReasoning"],
      props: [
        { name: "isStreaming", type: "boolean", def: "false", desc: "Mientras es true cuenta el tiempo y mantiene abierto." },
        { name: "open / defaultOpen", type: "boolean", desc: "defaultOpen={false} impide la apertura automática." },
        { name: "duration", type: "number", desc: "Segundos, si ya los tienes medidos." },
        { name: "children (Content)", type: "string", required: true, desc: "Markdown: lo renderiza Streamdown." },
      ],
      demos: [
        {
          id: "reasoning-basic",
          title: "Cerrado, ábrelo",
          code: `<Reasoning duration={4}>
  <ReasoningTrigger />
  <ReasoningContent>El cliente pregunta por horarios…</ReasoningContent>
</Reasoning>`,
          render: (
            <div className="w-full max-w-lg">
              <Reasoning duration={4}>
                <ReasoningTrigger />
                <ReasoningContent>
                  {"El cliente pregunta por horarios. Miro el calendario del jueves y veo dos huecos libres, así que ofrezco los dos en vez de proponer uno."}
                </ReasoningContent>
              </Reasoning>
            </div>
          ),
        },
      ],
    },
    {
      id: "license-credit-card",
      name: "LicenseCreditCard",
      source: "components/ai-elements/license-credit-card.tsx",
      importLine: 'import { LicenseCreditCard } from "@/components/ai-elements/license-credit-card";',
      desc:
        "La licencia Enterprise dibujada como la tarjeta que es. Se arrastra, se "
        + "inclina siguiendo al puntero y gira para mostrar los dos ids del dorso.",
      exports: ["LicenseCreditCard", "licenseTone"],
      props: [
        { name: "info", type: "LicenseInfo | null", required: true, desc: "Lo que devuelve GET /api/license. null se dibuja igual que status \"missing\"." },
        { name: "installationId", type: "string | null", required: true, desc: "Va en el dorso, con su botón de copiar." },
      ],
      notes: [
        "Necesita el provider de i18n: los rótulos salen de license.card.* y settings.license.*.",
        "La cara no lleva estado, contador ni fechas largas: eso es la línea de texto debajo, en LicenseCard. Una licencia activa y una con el mantenimiento vencido se dibujan igual acá.",
        "Con prefers-reduced-motion se apagan el arrastre y la inclinación; el giro pasa a ser instantáneo.",
        "El giro tiene su propio botón debajo de la tarjeta: la tarjeta no es un role=button, porque el botón de copiar del dorso quedaría anidado dentro de otro botón.",
      ],
      demos: [
        {
          id: "license-credit-card-active",
          title: "Licencia activa",
          desc: "Arrastrala. Clic para ver el dorso.",
          surface: "muted",
          code: `<LicenseCreditCard info={info} installationId={installationId} />`,
          render: (
            <div className="w-full max-w-md">
              <LicenseCreditCard
                info={licenseFixture()}
                installationId="a3f9c1d0-77b2-4e58-9c31-6de0f28a4b17"
              />
            </div>
          ),
        },
        {
          id: "license-credit-card-missing",
          title: "Sin licencia",
          desc: "La instalación corre igual: la tarjeta está en blanco, no bloqueada.",
          surface: "muted",
          code: `<LicenseCreditCard info={null} installationId={id} />`,
          render: (
            <div className="w-full max-w-md">
              <LicenseCreditCard info={null} installationId="a3f9c1d0-77b2-4e58-9c31-6de0f28a4b17" />
            </div>
          ),
        },
      ],
    },
  ],
};
