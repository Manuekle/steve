"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  KeyRoundIcon,
  Loading03Icon,
  Logout01Icon,
  UserCircleIcon,
  CrownIcon,
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
import { SoundSettings } from "../../_components/sound-settings";
import { useT } from "@/lib/i18n/provider";
import { fetchJson, type UiError } from "@/lib/api-error-message";

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

  return (
    <PageContainer maxWidth="max-w-4xl" pattern="grid">
      <Skeleton className="min-h-[400px]" isLoading={loading} skeleton={<AccountSkeleton />}>
        <div className="content-enter">
          <header className="mb-8">
            <h1 className="text-2xl font-semibold">{t("account.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("account.subtitle")}</p>
          </header>

          <ErrorBanner className="mb-4" error={loadError} onRetry={() => void load()} />

          <Card className="mb-4">
            <CardHeader>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={UserCircleIcon} size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>{t("account.emailCardTitle")}</CardTitle>
                <CardDescription>{t("account.emailCardDescription")}</CardDescription>
              </div>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              <p className="truncate text-sm font-medium">{email ?? "—"}</p>
            </CardBody>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={CrownIcon} size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>{t("account.planTitle")}</CardTitle>
                <CardDescription>{t("account.planDescription")}</CardDescription>
              </div>
              <a
                href="/pricing"
                className="hidden shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-inset)] hover:bg-accent sm:inline-flex"
              >
                {t("account.planViewPlans")}
              </a>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {license?.payload?.edition
                      ? license.payload.edition.charAt(0).toUpperCase() + license.payload.edition.slice(1)
                      : license?.status === "missing"
                        ? t("account.planNone")
                        : t("account.planLoading")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {license?.payload?.company ?? ""}
                    {license?.status === "valid" && license.maintenanceActive
                      ? `${license.payload?.company ? " · " : ""}${t("account.planActive")}`
                      : license?.status === "valid"
                        ? `${license.payload?.company ? " · " : ""}${t("account.planMaintenanceExpired")}`
                        : ""}
                  </p>
                </div>
                <a
                  href="/account/billing"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-[var(--shadow-button)] hover:opacity-90"
                >
                  <HugeiconsIcon icon={Invoice01Icon} size={14} strokeWidth={1.75} />
                  {t("account.planManageBilling")}
                </a>
              </div>
            </CardBody>
          </Card>

          {/* The plan card above says which edition this is; this one is where
              the key is actually pasted, and where the installation id lives. */}
          <LicenseCard />

          <SoundSettings />

          <Card className="mb-4">
            <CardHeader>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={KeyRoundIcon} size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>{t("account.changePasswordTitle")}</CardTitle>
                <CardDescription>{t("account.changePasswordDescription")}</CardDescription>
              </div>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-1.5">
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
                      <HugeiconsIcon icon={Loading03Icon} size={15} strokeWidth={2} className="animate-spin" />
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

          <Card>
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
            <CardBody>
              <SignOutButton className="border border-border shadow-[var(--shadow-inset)]" />
            </CardBody>
          </Card>
        </div>
      </Skeleton>
    </PageContainer>
  );
}

function AccountSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonBar className="h-7 w-40" />
        <SkeletonBar className="h-4 w-full max-w-sm" />
      </div>
      <SkeletonBar className="h-24 w-full rounded-2xl" />
      <SkeletonBar className="h-72 w-full rounded-2xl" />
      <SkeletonBar className="h-24 w-full rounded-2xl" />
    </div>
  );
}
