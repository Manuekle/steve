"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/provider";
import { Reveal, Shell } from "./primitives";
import { MarketingShell, PageHeader } from "./marketing-shell";

/* ═══════════════════════════════════════════════════════════════════
   PENDIENTE — datos de la entidad
   ═══════════════════════════════════════════════════════════════════
   `ENTITY` abajo tiene los cuatro campos que ningún texto legal puede
   inventar. Mientras alguno siga en `null`, la página muestra un aviso
   arriba de todo y los huecos salen marcados en el cuerpo.

   Hace falta:
     1. La razón social que opera el servicio.
     2. El domicilio legal.
     3. La jurisdicción cuya ley rige, para el apartado de ley aplicable.
     4. Un correo de contacto para ejercicio de derechos y notificaciones.

   Y algo que el código no puede resolver: **esto es un borrador técnico,
   no asesoramiento legal.** Describe con precisión lo que la aplicación
   hace con los datos, que es la parte difícil de redactar bien, pero un
   abogado tiene que revisarlo antes de publicarlo.                        */

export const ENTITY: {
  readonly address: string | null;
  readonly email: string | null;
  readonly jurisdiction: string | null;
  readonly name: string | null;
} = {
  address: null,
  email: null,
  jurisdiction: null,
  name: null,
};

const ENTITY_LABEL_KEY = {
  address: "legal.entityAddress",
  email: "legal.entityEmail",
  jurisdiction: "legal.entityJurisdiction",
  name: "legal.entityName",
} as const;

/**
 * A field of `ENTITY` rendered inline. Unset fields print as a marked slot
 * rather than as blank space or a plausible invention, so an unfinished
 * clause is visible in the page itself and not only in a comment.
 */
export function Entity({ field }: { readonly field: keyof typeof ENTITY }) {
  const t = useT();
  const value = ENTITY[field];
  if (value) return <>{value}</>;
  return (
    <span className="rounded border border-dashed border-muted-foreground/50 px-1.5 py-0.5 font-mono text-[0.85em] text-muted-foreground">
      {t("legal.entityUndefined", { label: t(ENTITY_LABEL_KEY[field]) })}
    </span>
  );
}

/** True while any field is still unset. */
export const ENTITY_INCOMPLETE = Object.values(ENTITY).some((value) => value === null);

export function Clause({ children, title }: { readonly children: ReactNode; readonly title: string }) {
  return (
    <Reveal className="border-border border-t py-8 first:border-t-0 first:pt-0">
      <h2 className="font-medium text-lg tracking-tight">{title}</h2>
      <div className="mt-3 flex max-w-[68ch] flex-col gap-3 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </Reveal>
  );
}

/**
 * The shared frame for the two legal pages: the marketing chrome, the page
 * header, the draft notice while `ENTITY` is incomplete, and the clause rail.
 */
export function LegalPage({
  children,
  lede,
  title,
  updated,
}: {
  readonly children: ReactNode;
  readonly lede: string;
  readonly title: string;
  readonly updated: string;
}) {
  const t = useT();

  return (
    <MarketingShell>
      <PageHeader
        eyebrow={t("legal.updatedOn", { updated })}
        title={title}
        titleClassName="font-cooper"
        lede={lede}
      />

      <section className="py-16 sm:py-20">
        <Shell>
          {ENTITY_INCOMPLETE ? (
            <Reveal>
              <div className="mb-12 rounded-2xl border border-dashed border-muted-foreground/40 bg-card p-5 sm:p-6">
                <p className="font-medium text-sm">{t("legal.draftTitle")}</p>
                <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-muted-foreground">
                  {t("legal.draftBody")}
                </p>
              </div>
            </Reveal>
          ) : null}

          <div className="max-w-[72ch]">{children}</div>
        </Shell>
      </section>
    </MarketingShell>
  );
}
