"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  CrownIcon,
  Invoice01Icon,
  StripeIcon,
  Calendar01Icon,
  CheckIcon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../_components/app-shell";
import { PageContainer } from "../../_components/page-container";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator, CardBody } from "../../_components/dashboard-card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { LicenseInfo } from "@/lib/license/types";

export default function BillingPage() {
  const t = useT();
  const [license, setLicense] = useState<LicenseInfo | null>(null);

  useEffect(() => {
    void fetch("/api/license")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LicenseInfo | null) => {
        if (data) setLicense(data);
      })
      .catch(() => null);
  }, []);

  const edition = license?.payload?.edition ?? (license?.status === "missing" ? "Sin plan" : "—");
  const company = license?.payload?.company ?? "—";
  const maintenanceUntil = license?.payload?.maintenanceUntil
    ? new Date(license.payload.maintenanceUntil).toLocaleDateString("es-AR")
    : "—";

  return (
    <AppShell activePath="/account">
      <PageContainer maxWidth="max-w-2xl" pattern="grid">
        <div className="content-enter">
          <header className="mb-8">
            <Link
              href="/account"
              className="group mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon
                icon={ArrowLeft02Icon}
                size={14}
                strokeWidth={1.75}
                className="transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-x-0.5"
              />
              Volver a cuenta
            </Link>
            <h1 className="text-2xl font-semibold">Facturación</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gestiona tu plan, método de pago y facturas.
            </p>
          </header>

          <Card className="mb-4">
            <CardHeader>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={CrownIcon} size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>Mi plan</CardTitle>
                <CardDescription>
                  {license ? `${edition.charAt(0).toUpperCase() + edition.slice(1)} · ${company}` : "Cargando…"}
                </CardDescription>
              </div>
              <span
                className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex ${
                  license?.status === "valid" && license.maintenanceActive
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {license?.status === "valid" && license.maintenanceActive ? "Activo" : "Revisar"}
              </span>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <HugeiconsIcon icon={Calendar01Icon} size={12} strokeWidth={1.75} />
                    Mantenimiento hasta
                  </p>
                  <p className="mt-1 text-sm font-medium">{maintenanceUntil}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <HugeiconsIcon icon={CheckIcon} size={12} strokeWidth={1.75} />
                    Estado
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {license?.status === "valid" ? "Válida" : license?.status === "missing" ? "Sin licencia" : "Inválida"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href="/pricing">Ver planes y precios</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/pricing">Cambiar plan</Link>
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={StripeIcon} size={16} strokeWidth={1.75} className="text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>Método de pago</CardTitle>
                <CardDescription>Gestionado por Stripe</CardDescription>
              </div>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              <p className="text-sm text-muted-foreground">
                Aún no hay método de pago guardado. Al comprar Enterprise se creará tu suscripción y podrás
                gestionarla desde el portal de facturación.
              </p>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-3 border border-border bg-card text-violet-600 shadow-[var(--shadow-inset)] hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 dark:text-violet-400 dark:hover:bg-violet-950/30 dark:hover:text-violet-300 dark:hover:border-violet-900"
              >
                <Link href="/pricing">Agregar método de pago</Link>
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={Invoice01Icon} size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>Facturas</CardTitle>
                <CardDescription>Historial de pagos y comprobantes</CardDescription>
              </div>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              <p className="py-6 text-center text-sm text-muted-foreground">Sin facturas aún</p>
            </CardBody>
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}
