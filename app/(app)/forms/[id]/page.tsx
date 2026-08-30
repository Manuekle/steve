"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Copy01Icon,
  Download04Icon,
  LinkSquare02Icon,
  QrCode01Icon,
  UserIcon,
  PencilEdit01Icon,
  CheckIcon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../../_components/page-container";
import { Card, CardHeader, CardTitle, CardDescription } from "../../../_components/dashboard-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ai-elements/skeleton";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { maxScore } from "@/lib/forms/scoring";
import { useI18n } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import type { Form, FormResponse, LeadTemperature } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Hot / warm / cold on the same pill system as every other status in the app,
 *  so a rating reads the same way a channel or an automation state does. */
function TemperatureBadge({ temperature }: { readonly temperature: LeadTemperature }) {
  const { t } = useI18n();
  const variant = temperature === "hot" ? "failed" : temperature === "warm" ? "pending" : "expired";
  return <StatusBadge status={variant} label={t(`forms.temperature.${temperature}`)} />;
}

export default function FormDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { locale, t } = useI18n();

  const [form, setForm] = useState<Form | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [copied, setCopied] = useState(false);
  const [shownCopied, setShownCopied] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  const [webhookDraft, setWebhookDraft] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const copyLabelRef = useRef<HTMLSpanElement>(null);
  const prevCopied = useRef(copied);

  const load = useCallback(async () => {
    const result = await fetchJson<{ form: Form; responses: FormResponse[] }>(
      `/api/forms/${id}`,
      t,
    );
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setForm(result.data.form);
    setWebhookDraft(result.data.form.webhookUrl ?? "");
    setResponses(result.data.responses);
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const publicUrl = form ? `${origin}/f/${form.slug}` : "";
  /** The printable code for that same link. The slug rides along as a cache
   *  buster: rename the link and the image on screen has to change with it,
   *  or someone prints the code for an address that no longer resolves. */
  const qrSrc = form ? `/api/forms/${form.id}/qr?v=${encodeURIComponent(form.slug)}` : "";

  const ceiling = useMemo(() => (form ? maxScore(form) : 0), [form]);

  const togglePublished = async () => {
    if (!form) return;
    const result = await fetchJson(`/api/forms/${form.id}`, t, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: form.status === "published" ? "draft" : "published" }),
    });
    if (!result.ok) setError(result.error);
    else void load();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is on screen either way.
    }
  };

  // Text-swap the "Copiar link" / "Copiado" label on the transitions.dev
  // three-phase recipe: exit the old text, swap it once hidden, enter the new.
  // `shownCopied` (not `copied`) drives the rendered label — it only flips
  // inside the timeout, once the label is actually hidden. Rendering off
  // `copied` directly swapped the text on the same tick as the click, so the
  // "exit" and "enter" phases both animated the already-new text fading
  // against itself instead of an old-to-new swap.
  useEffect(() => {
    if (prevCopied.current === copied) return;
    prevCopied.current = copied;
    const label = copyLabelRef.current;
    if (!label) return;
    label.classList.add("is-exit");
    const timeout = setTimeout(() => {
      setShownCopied(copied);
      label.classList.remove("is-exit");
      label.classList.add("is-enter-start");
      void label.offsetHeight;
      label.classList.remove("is-enter-start");
    }, 150);
    return () => clearTimeout(timeout);
  }, [copied]);

  const startEditSlug = () => {
    if (!form) return;
    setSlugDraft(form.slug);
    setEditingSlug(true);
  };

  const saveSlug = async () => {
    if (!form) return;
    const next = slugDraft.trim();
    if (!next || next === form.slug) {
      setEditingSlug(false);
      return;
    }
    setSavingSlug(true);
    const result = await fetchJson<{ form: Form }>(`/api/forms/${form.id}`, t, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: next }),
    });
    setSavingSlug(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm(result.data.form);
    setEditingSlug(false);
  };

  const saveWebhook = async () => {
    if (!form) return;
    const next = webhookDraft.trim();
    if (next === (form.webhookUrl ?? "")) return;
    setSavingWebhook(true);
    const result = await fetchJson<{ form: Form }>(`/api/forms/${form.id}`, t, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // Sent as "" to clear: the route reads an empty string as "remove it",
      // and omitting the key would just mean "leave it alone".
      body: JSON.stringify({ webhookUrl: next }),
    });
    setSavingWebhook(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setForm(result.data.form);
    setWebhookDraft(result.data.form.webhookUrl ?? "");
    setWebhookSaved(true);
    setTimeout(() => setWebhookSaved(false), 2000);
  };

  return (
    <PageContainer maxWidth="max-w-4xl" pattern="grid">
      <Skeleton
        className="min-h-[400px]"
        isLoading={isLoading}
        skeleton={<div className="h-64 rounded-xl bg-muted" />}
      >
        <div className="content-enter">
          <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />

          <Link
            href="/forms"
            className="group mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon
              icon={ArrowLeft02Icon}
              size={14}
              strokeWidth={1.75}
              className="transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-x-0.5"
            />
            {t("forms.detail.back")}
          </Link>

          {form ? (
            <>
              <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold">{form.name}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {form.description || t("forms.detail.stepCount", { count: form.steps.length })}
                  </p>
                </div>
                <button type="button" onClick={() => void togglePublished()}>
                  <StatusBadge
                    status={form.status === "published" ? "active" : "draft"}
                    label={t(`forms.status.${form.status}`)}
                    title={t(form.status === "published" ? "forms.unpublish" : "forms.publish")}
                  />
                </button>
              </header>

              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>{t("forms.detail.publicLink")}</CardTitle>
                </CardHeader>
                <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
                  {editingSlug ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="shrink-0 text-xs text-muted-foreground">{origin}/f/</span>
                      <Input
                        autoFocus
                        value={slugDraft}
                        onChange={(event) => setSlugDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveSlug();
                          if (event.key === "Escape") setEditingSlug(false);
                        }}
                        className="h-8 min-w-0 flex-1 text-xs"
                      />
                    </div>
                  ) : (
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">
                      {publicUrl}
                    </code>
                  )}

                  {editingSlug ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => void saveSlug()} disabled={savingSlug}>
                        <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={1.75} />
                        {t("forms.detail.slugSave")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setEditingSlug(false)}
                        disabled={savingSlug}
                      >
                        {t("common.cancel")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={startEditSlug}>
                        <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={1.75} />
                        {t("forms.detail.editSlug")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void copyLink()}>
                        {/* Driven by `shownCopied`, the same flag as the label
                            below: the tick has to land on the tick the word
                            does, or the button reads "Copiado" next to a copy
                            icon for the length of the swap. */}
                        <span className="t-icon-swap" data-state={shownCopied ? "b" : "a"}>
                          <span className="t-icon" data-icon="a">
                            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} />
                          </span>
                          <span className="t-icon" data-icon="b">
                            <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={1.75} />
                          </span>
                        </span>
                        <span ref={copyLabelRef} className="t-text-swap">
                          {shownCopied ? t("forms.linkCopied") : t("forms.copyLink")}
                        </span>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer">
                          <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.75} />
                          {t("forms.openPublic")}
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              </Card>

              <Card className="mb-6">
                <CardHeader>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                    <HugeiconsIcon icon={QrCode01Icon} size={16} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle>{t("forms.detail.qrTitle")}</CardTitle>
                    <CardDescription>{t("forms.detail.qrDescription")}</CardDescription>
                  </div>
                </CardHeader>
                <div className="flex flex-wrap items-center gap-5 px-5 pb-5">
                  {/* Drawn by the route rather than by a canvas here, so what
                      the download hands over is byte-for-byte what is on
                      screen. White ground in both themes on purpose: a code
                      inverted onto a dark card stops scanning on a good half
                      of the readers in the wild. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrSrc}
                    alt={t("forms.detail.qrAlt", { name: form.name })}
                    width={144}
                    height={144}
                    className="size-36 rounded-xl border border-border bg-white p-2"
                  />
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={`${qrSrc}&download`} download>
                        <HugeiconsIcon icon={Download04Icon} size={14} strokeWidth={1.75} />
                        {t("forms.detail.qrDownload")}
                      </a>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {form.status === "published"
                        ? t("forms.detail.qrHint")
                        : t("forms.detail.qrDraftWarning")}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>{t("forms.detail.webhookTitle")}</CardTitle>
                  <CardDescription>{t("forms.detail.webhookDescription")}</CardDescription>
                </CardHeader>
                <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
                  <Input
                    type="url"
                    inputMode="url"
                    value={webhookDraft}
                    onChange={(event) => setWebhookDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveWebhook();
                    }}
                    placeholder={t("forms.detail.webhookPlaceholder")}
                    className="h-9 min-w-0 flex-1 font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void saveWebhook()}
                    disabled={savingWebhook || webhookDraft.trim() === (form.webhookUrl ?? "")}
                  >
                    <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={1.75} />
                    {webhookSaved ? t("forms.detail.webhookSaved") : t("forms.detail.slugSave")}
                  </Button>
                </div>
                <p className="px-5 pb-5 text-xs leading-relaxed text-muted-foreground">
                  {t("forms.detail.webhookHint")}
                </p>
              </Card>

              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>{t("forms.detail.questions")}</CardTitle>
                  <CardDescription>
                    {t("forms.detail.thresholds", {
                      hot: form.scoring.hot,
                      warm: form.scoring.warm,
                    })}
                  </CardDescription>
                </CardHeader>
                <ol className="flex flex-col gap-4 px-5 pb-5">
                  {form.steps.map((step, index) => (
                    <li key={step.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium">{step.title ?? step.fields[0]?.label}</span>
                        {step.showIf ? (
                          <span className="rounded-full bg-[var(--status-review-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--status-review-fg)]">
                            {t("forms.detail.conditional")}
                          </span>
                        ) : null}
                      </div>
                      <ul className="mt-2 flex flex-col gap-2 pl-7">
                        {step.fields.map((field) => (
                          <li key={field.id}>
                            <p className="text-xs text-muted-foreground">{field.label}</p>
                            {field.choices ? (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {field.choices.map((choice) => (
                                  <span
                                    key={choice.id}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                                      choice.points > 0
                                        ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                                        : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {choice.label}
                                    <span className="opacity-70">
                                      {t("forms.detail.points", { points: choice.points })}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("forms.detail.responses")}</CardTitle>
                  <CardDescription>
                    {t("forms.completedOf", {
                      completed: responses.filter((r) => !r.partial).length,
                      total: responses.length,
                    })}
                  </CardDescription>
                </CardHeader>
                {responses.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-5 pb-16 pt-6 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                      <HugeiconsIcon icon={UserIcon} size={20} strokeWidth={1.75} />
                    </div>
                    <p className="text-sm font-medium">{t("forms.detail.noResponses")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("forms.detail.noResponsesHint")}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">
                            {t("forms.detail.columnWhen")}
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            {t("forms.detail.columnScore")}
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            {t("forms.detail.columnTemperature")}
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            {t("forms.detail.columnAnswers")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {responses.map((response) => (
                          <tr
                            key={response.id}
                            className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                          >
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {relativeTime(response.updatedAt, locale)}
                            </td>
                            <td className="px-4 py-2.5 text-xs">
                              {t("forms.detail.scoreOf", {
                                score: response.score,
                                max: ceiling,
                              })}
                            </td>
                            <td className="px-4 py-2.5">
                              <TemperatureBadge temperature={response.temperature} />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {response.answers.length}
                              {response.partial ? ` · ${t("forms.detail.partial")}` : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          ) : null}
        </div>
      </Skeleton>
    </PageContainer>
  );
}
