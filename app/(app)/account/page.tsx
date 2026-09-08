"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  AuthorizedIcon,
  Logout01Icon,
  Invoice01Icon,
} from "@hugeicons/core-free-icons";
import type { LicenseInfo } from "@/lib/license/types";
import { PageContainer } from "../../_components/page-container";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardSeparator,
  CardBody,
} from "../../_components/dashboard-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { SignOutButton } from "@/components/sign-out-button";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { LicenseCard } from "@/components/ai-elements/license-card";
import { licenseTone } from "@/components/ai-elements/license-credit-card";
import { SoundSettings } from "../../_components/sound-settings";
import { BusinessesCard } from "../../_components/businesses-card";
import { useT } from "@/lib/i18n/provider";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Spinner } from "@/components/ui/spinner";

export default function AccountPage() {
  const t = useT();

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<UiError | null>(null);
  const [license, setLicense] = useState<LicenseInfo | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<UiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchJson<{ email: string }>("/api/account", t);
    if (result.ok) {
      setEmail(result.data.email);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetch("/api/license")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LicenseInfo | null) => {
        if (data) setLicense(data);
      })
      .catch(() => null);
  }, []);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    setSaveError(null);
    setSaved(false);

    if (newPassword.length < 10) {
      setFieldError(t("auth.errorWeak"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError(t("auth.errorPasswordMismatch"));
      return;
    }

    setSaving(true);
    const result = await fetchJson("/api/account/password", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSaving(false);

    if (result.ok) {
      resetForm();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setSaveError(result.error);
    }
  };

  // Plan line: edition first, then who it was issued to, then whether
  // maintenance is still running. Every part is optional and the separators
  // come from joining what is actually there, so a license with no company
  // does not render a leading "· ".
  const edition = license?.payload?.edition;
  const planParts = [
    edition
      ? edition.charAt(0).toUpperCase() + edition.slice(1)
      : license?.status === "missing"
        ? t("account.planNone")
        : t("account.planLoading"),
    license?.payload?.company,
    license?.status === "valid"
      ? license.maintenanceActive
        ? t("account.planActive")
        : t("account.planMaintenanceExpired")
      : undefined,
  ].filter(Boolean) as string[];

  const tone = licenseTone(license);
  const toneDot =
    tone === "valid-active"
      ? "bg-emerald-500"
      : tone === "valid-inactive"
        ? "bg-amber-500"
        : tone === "invalid"
          ? "bg-destructive"
          : "bg-muted-foreground/40";

  return (
    <PageContainer maxWidth="max-w-4xl" pattern="grid">
      <Skeleton className="min-h-[400px]" isLoading={loading} skeleton={<AccountSkeleton />}>
        <div className="content-enter">
          <header className="mb-6">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("account.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("account.subtitle")}</p>
          </header>

          <ErrorBanner className="mb-4" error={loadError} onRetry={() => void load()} />

          {/* Identity and plan in one block. These used to be two cards that
              both answered "whose install is this" — the email one, and a plan
              one that repeated the edition, the company and the status the
              licence card below already draws. */}
          <Card className="mb-4">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-muted to-accent text-lg font-semibold text-foreground/70 shadow-[var(--shadow-inset)]"
              >
                {(email ?? "?").charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">
                  {t("account.emailCardTitle")}
                </p>
                <p className="mt-1 truncate text-base font-medium">{email ?? "—"}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`size-1.5 shrink-0 rounded-full ${toneDot}`} />
                  <span className="truncate">{planParts.join(" · ")}</span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <a
                  href="/pricing"
                  className="inline-flex h-8 items-center rounded-[11px] border border-border bg-card px-3 text-xs font-medium shadow-[var(--shadow-inset)] transition-colors hover:bg-accent"
                >
                  {t("account.planViewPlans")}
                </a>
                <a
                  href="/account/billing"
                  className="inline-flex h-8 items-center gap-1.5 rounded-[11px] bg-primary px-3 text-xs font-medium text-primary-foreground shadow-[var(--shadow-button)] transition-opacity hover:opacity-90"
                >
                  <HugeiconsIcon icon={Invoice01Icon} size={14} strokeWidth={1.75} />
                  {t("account.planManageBilling")}
                </a>
              </div>
            </div>
          </Card>

          {/* Right under the account it belongs to, and above the plan: which
              businesses this installation runs is a bigger fact about it than
              which tier it is on. */}
          <BusinessesCard />

          {/* The licence itself, drawn as the card it is — edition, holder,
              expiry and installation id all live on its two faces. */}
          <LicenseCard />

          <Card className="mb-4">
            <CardHeader>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={AuthorizedIcon} size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>{t("account.changePasswordTitle")}</CardTitle>
                <CardDescription>{t("account.changePasswordDescription")}</CardDescription>
              </div>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="current-password" className="text-sm font-medium">
                      {t("account.currentPassword")}
                    </label>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-password" className="text-sm font-medium">
                      {t("auth.newPassword")}
                    </label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">{t("auth.passwordHint")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="confirm-new-password" className="text-sm font-medium">
                      {t("auth.confirmPassword")}
                    </label>
                    <Input
                      id="confirm-new-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                    />
                  </div>
                </div>

                {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                <ErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />

                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      saving || !currentPassword || !newPassword || !confirmPassword
                    }
                  >
                    {saving ? (
                      <Spinner size={15} strokeWidth={2} />
                    ) : null}
                    {t("account.changePasswordAction")}
                  </Button>
                  {saved ? (
                    <p className="text-xs text-muted-foreground">{t("account.changePasswordSuccess")}</p>
                  ) : null}
                </div>
              </form>
            </CardBody>
          </Card>

          {/* Two short cards that were each spending a full page-width row. */}
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:mb-0">
            <SoundSettings />

            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle>{t("account.signOutCardTitle")}</CardTitle>
                  <CardDescription>{t("account.signOutCardDescription")}</CardDescription>
                </div>
              </CardHeader>
              <CardSeparator />
              <CardBody className="mt-auto">
                <SignOutButton className="border border-border shadow-[var(--shadow-inset)]" />
              </CardBody>
            </Card>
          </div>
        </div>
      </Skeleton>
    </PageContainer>
  );
}

function AccountSkeleton() {
  return (
    <div className="space-y-4">
      <div className="mb-6 space-y-2">
        <SkeletonBar className="h-8 w-40" />
        <SkeletonBar className="h-4 w-full max-w-sm" />
      </div>

      {/* Identity + plan */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-4 p-5">
          <SkeletonBar className="size-12 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-5 w-56" />
            <SkeletonBar className="h-3 w-40" />
          </div>
          <SkeletonBar className="hidden h-8 w-36 rounded-[11px] sm:block" />
        </div>
      </div>

      {/* Businesses */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 p-5">
          <SkeletonBar className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-3 w-48" />
          </div>
        </div>
        <div className="h-px bg-border" />
        <div className="p-5">
          <SkeletonBar className="h-5 w-40" />
        </div>
      </div>

      {/* Licence card — the credit card and its wallet */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 p-5">
          <SkeletonBar className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-36" />
            <SkeletonBar className="h-3 w-56" />
          </div>
        </div>
        <div className="border-y border-border bg-muted/40 px-5 py-7">
          <SkeletonBar className="mx-auto aspect-[1.586] w-full max-w-[27rem] rounded-[18px]" />
        </div>
        <div className="p-5">
          <SkeletonBar className="h-4 w-52" />
        </div>
      </div>

      {/* Change password form */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 p-5">
          <SkeletonBar className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="h-3 w-56" />
          </div>
        </div>
        <div className="h-px bg-border" />
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBar key={i} className="h-9 w-full" />
          ))}
          <SkeletonBar className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Sound + sign out */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3 p-5">
              <SkeletonBar className="size-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBar className="h-4 w-28" />
                <SkeletonBar className="h-3 w-40" />
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="p-5">
              <SkeletonBar className="h-9 w-32 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
