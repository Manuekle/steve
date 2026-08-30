"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { PageContainer } from "../../../_components/page-container";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator, CardBody } from "../../../_components/dashboard-card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useI18n } from "@/lib/i18n/provider";
import { fetchJson } from "@/lib/api-error-message";
import type { BillingState } from "@/lib/billing-store";
import { getPlan } from "@/lib/plans";
import type { LicenseInfo } from "@/lib/license/types";
import { ChangePlanDialog } from "./_components/change-plan-dialog";
import { PaymentMethodDialog } from "./_components/payment-method-dialog";

export default function BillingPage() {
  const { locale, t } = useI18n();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);

  useEffect(() => {
    void fetch("/api/license")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LicenseInfo | null) => {
        if (data) setLicense(data);
      })
      .catch(() => null);
  }, []);

  const loadBilling = useCallback(async () => {
    const result = await fetchJson<BillingState>("/api/billing/plan", t);
    if (result.ok) setBilling(result.data);
  }, [t]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const cancelPending = useCallback(async () => {
    const result = await fetchJson<{ state: BillingState }>("/api/billing/plan", t, {
      method: "DELETE",
    });
    if (result.ok) setBilling(result.data.state);
  }, [t]);

  const pendingDate = useMemo(() => {
    const iso = billing?.pendingChange?.effectiveAt;
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(locale === "es" ? "es-AR" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [billing?.pendingChange?.effectiveAt, locale]);

  // The plan the customer is on is what `Change plan` moves, so that is what
  // this card names. A verified Enterprise licence still wins: it is the one
  // edition proved by something stronger than a local file.
  const edition =
    license?.payload?.edition ??
    (billing && billing.plan !== "none"
      ? t(getPlan(billing.plan).nameKey)
      : billing || license
        ? t("billing.noPlan")
        : "—");
  const company = license?.payload?.company ?? "—";
  const maintenanceUntil = license?.payload?.maintenanceUntil
    ? new Date(license.payload.maintenanceUntil).toLocaleDateString(locale === "es" ? "es-AR" : "en-US")
    : "—";

  return (
    <PageContainer maxWidth="max-w-4xl" pattern="grid">
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
            {t("billing.back")}
          </Link>
          <h1 className="text-2xl font-semibold">{t("billing.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("billing.subtitle")}
          </p>
        </header>

        {billing?.paymentPastDue ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4">
            <HugeiconsIcon
              icon={Calendar01Icon}
              size={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-destructive"
            />
            <div>
              <p className="text-sm font-medium text-destructive">{t("billing.pastDueTitle")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("billing.pastDueBody")}</p>
            </div>
          </div>
        ) : null}

        <Card className="mb-4">
          <CardHeader>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={CrownIcon} size={16} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>{t("billing.planTitle")}</CardTitle>
              <CardDescription>
                {license || billing
                  ? `${edition.charAt(0).toUpperCase() + edition.slice(1)}${company === "—" ? "" : ` · ${company}`}`
                  : t("billing.loading")}
              </CardDescription>
            </div>
            <StatusBadge
              className="hidden shrink-0 sm:inline-flex"
              status={license?.status === "valid" && license.maintenanceActive ? "active" : "in-review"}
              label={license?.status === "valid" && license.maintenanceActive ? t("billing.statusActive") : t("billing.statusReview")}
            />
          </CardHeader>
          <CardSeparator />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Calendar01Icon} size={12} strokeWidth={1.75} />
                  {t("billing.maintenanceUntil")}
                </p>
                <p className="mt-1 text-sm font-medium">{maintenanceUntil}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={CheckIcon} size={12} strokeWidth={1.75} />
                  {t("billing.statusLabel")}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {license?.status === "valid"
                      ? t("billing.licenseValid")
                      : license?.status === "missing"
                        ? t("billing.licenseMissing")
                        : t("billing.licenseInvalid")}
                </p>
              </div>
            </div>
            {billing?.pendingChange ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{t("billing.pendingTitle")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("billing.pendingBody", {
                      plan: t(getPlan(billing.pendingChange.to).nameKey),
                      date: pendingDate,
                    })}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void cancelPending()}>
                  {t("billing.pendingKeep", {
                    plan: billing.plan === "none" ? "—" : t(getPlan(billing.plan).nameKey),
                  })}
                </Button>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {billing ? (
                <ChangePlanDialog state={billing} onChanged={setBilling}>
                  <Button size="sm">{t("billing.changePlan")}</Button>
                </ChangePlanDialog>
              ) : (
                <Button size="sm" disabled>
                  {t("billing.changePlan")}
                </Button>
              )}
              <Button asChild variant="secondary" size="sm">
                <Link href="/pricing">{t("billing.viewPricing")}</Link>
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
              <CardTitle>{t("billing.paymentTitle")}</CardTitle>
              <CardDescription>{t("billing.paymentDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardSeparator />
          <CardBody>
            <p className="text-sm text-muted-foreground">
              {billing?.hasPaymentMethod ? t("billing.paymentOnFile") : t("billing.paymentEmpty")}
            </p>
            <PaymentMethodDialog>
              {/* Same recipe as the "Cerrar sesión" button on /account —
                  bordered surface with shadow-inset, tinted text — in the
                  billing violet. `--billing` is a token like `--destructive`,
                  so the colour is right in both themes without a `dark:`
                  pair on the element. */}
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-billing shadow-[var(--shadow-inset)] transition-all duration-150 hover:bg-billing/10 hover:text-billing"
              >
                <HugeiconsIcon
                  className="shrink-0"
                  icon={StripeIcon}
                  size={14}
                  strokeWidth={1.75}
                />
                {t("billing.paymentAdd")}
              </button>
            </PaymentMethodDialog>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={Invoice01Icon} size={16} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>{t("billing.invoicesTitle")}</CardTitle>
              <CardDescription>{t("billing.invoicesDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardSeparator />
          <CardBody>
            <p className="py-6 text-center text-sm text-muted-foreground">{t("billing.invoicesEmpty")}</p>
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}
