"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  CheckIcon,
  Copy01Icon,
  Delete01Icon,
  LinkSquare02Icon,
  FileEditIcon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { Card } from "../../_components/dashboard-card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ai-elements/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import type { Form } from "@/lib/types";

type FormRow = Form & { readonly responseCount: number; readonly completedCount: number };

export default function FormsPage() {
  const { locale, t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [forms, setForms] = useState<FormRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{ forms?: FormRow[] }>("/api/forms", t);
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setForms(result.data.forms ?? []);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** The link someone pastes into an ad or an email. Built from the browser's
   *  own origin so it is right on localhost, on a preview URL and in
   *  production without a setting to keep in sync. */
  const publicUrl = (slug: string) =>
    typeof window === "undefined" ? `/f/${slug}` : `${window.location.origin}/f/${slug}`;

  const copyLink = async (form: FormRow) => {
    try {
      await navigator.clipboard.writeText(publicUrl(form.slug));
      setCopied(form.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is permission-gated; the link is visible on the detail page.
    }
  };

  const togglePublished = async (form: FormRow) => {
    const result = await fetchJson(`/api/forms/${form.id}`, t, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: form.status === "published" ? "draft" : "published" }),
    });
    if (!result.ok) setError(result.error);
    else void load();
  };

  const remove = async (form: FormRow) => {
    if (!(await confirm({ title: t("forms.confirmDelete") }))) return;
    const result = await fetchJson(`/api/forms/${form.id}`, t, { method: "DELETE" });
    if (!result.ok) {
      setError(result.error);
      toast({ title: t("common.somethingWentWrong"), description: t("common.somethingWentWrongDescription"), status: "error" });
    } else {
      void load();
      toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
    }
  };

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      {confirmDialog}
      <Skeleton
        className="min-h-[400px]"
        isLoading={isLoading}
        skeleton={<div className="h-64 rounded-xl bg-muted" />}
      >
        <div className="content-enter">
          <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />

          <header className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t("forms.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("forms.subtitle")}</p>
            </div>
            <Link
              href="/forms/new"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition-all duration-150 hover:border-input hover:bg-accent"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              {t("forms.new")}
            </Link>
          </header>

          {forms.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={FileEditIcon} size={20} strokeWidth={1.75} />
                </div>
                <p className="text-sm font-medium">{t("forms.empty")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("forms.emptyHint")}</p>
                <Link
                  href="/forms/new"
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition-all duration-150 hover:border-input hover:bg-accent"
                >
                  <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
                  {t("forms.new")}
                </Link>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">{t("forms.columnName")}</th>
                      <th className="px-4 py-2 text-left font-medium">{t("forms.columnStatus")}</th>
                      <th className="px-4 py-2 text-left font-medium">
                        {t("forms.columnResponses")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium">
                        {t("forms.columnUpdated")}
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        {t("forms.columnActions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {forms.map((form) => (
                      <tr
                        key={form.id}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-2.5">
                          <Link href={`/forms/${form.id}`} className="font-medium hover:underline">
                            {form.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">/f/{form.slug}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => void togglePublished(form)}>
                            <StatusBadge
                              status={form.status === "published" ? "active" : "draft"}
                              label={t(`forms.status.${form.status}`)}
                              title={t(
                                form.status === "published" ? "forms.unpublish" : "forms.publish",
                              )}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <span>{t("forms.responses", { count: form.responseCount })}</span>
                          {form.responseCount > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {t("forms.completedOf", {
                                completed: form.completedCount,
                                total: form.responseCount,
                              })}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {relativeTime(form.updatedAt, locale)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => void copyLink(form)}
                                  className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                  aria-label={t("forms.copyLink")}
                                >
                                  {/* The tooltip already says "Copiado", but
                                      it is only on screen while the pointer
                                      stays put. The icon is the confirmation
                                      that survives moving the mouse away. */}
                                  <span
                                    className="t-icon-swap"
                                    data-state={copied === form.id ? "b" : "a"}
                                  >
                                    <span className="t-icon" data-icon="a">
                                      <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} />
                                    </span>
                                    <span className="t-icon" data-icon="b">
                                      <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={1.75} />
                                    </span>
                                  </span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {copied === form.id ? t("forms.linkCopied") : t("forms.copyLink")}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={`/f/${form.slug}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                  aria-label={t("forms.openPublic")}
                                >
                                  <HugeiconsIcon
                                    icon={LinkSquare02Icon}
                                    size={14}
                                    strokeWidth={1.75}
                                  />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>{t("forms.openPublic")}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => void remove(form)}
                                  className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={t("forms.delete")}
                                >
                                  <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{t("forms.delete")}</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </Skeleton>
    </PageContainer>
  );
}
