"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  CheckmarkCircle02Icon,
  BanIcon,
  Facebook01Icon,
  GoogleIcon,
  Call02Icon,
  CheckListIcon,
  Add01Icon,
  Target01Icon,
  PencilEdit01Icon,
  Ticket01Icon,
  File01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../../_components/page-container";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { FORM_TEMPLATES, recommendedTemplate, type FormPurpose } from "@/lib/forms/templates";
import { useI18n } from "@/lib/i18n/provider";
import type { Form } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Two questions and a pick.
 *
 * The questions are not a survey: the second one chooses which template the
 * picker recommends, and the first one is the only thing that tells us whether
 * this account has leads to qualify at all. Neither is required — both screens
 * can be walked past — because an onboarding you cannot leave is a wall in
 * front of a product someone already has.
 */

type LeadSource = "none" | "facebook" | "google" | "outbound" | "lists" | "other";

const SOURCES: ReadonlyArray<{ id: LeadSource; labelKey: string; icon: IconSvgElement }> = [
  { id: "none", labelKey: "forms.wizard.q1None", icon: BanIcon },
  { id: "facebook", labelKey: "forms.wizard.q1Facebook", icon: Facebook01Icon },
  { id: "google", labelKey: "forms.wizard.q1Google", icon: GoogleIcon },
  { id: "outbound", labelKey: "forms.wizard.q1Outbound", icon: Call02Icon },
  { id: "lists", labelKey: "forms.wizard.q1Lists", icon: CheckListIcon },
  { id: "other", labelKey: "forms.wizard.q1Other", icon: Add01Icon },
];

/** Same icons back the template picker below — its cards recommend by
 *  `purpose`, so one map covers both screens. */
const PURPOSE_ICONS: Record<FormPurpose, IconSvgElement> = {
  leads: Target01Icon,
  feedback: PencilEdit01Icon,
  event: Ticket01Icon,
  applications: File01Icon,
  other: SparklesIcon,
};

const PURPOSES: ReadonlyArray<{ id: FormPurpose; labelKey: string }> = [
  { id: "leads", labelKey: "forms.wizard.q2Leads" },
  { id: "feedback", labelKey: "forms.wizard.q2Feedback" },
  { id: "event", labelKey: "forms.wizard.q2Event" },
  { id: "applications", labelKey: "forms.wizard.q2Applications" },
  { id: "other", labelKey: "forms.wizard.q2Other" },
];

/** The three dots at the top. "Your account" is already done by the time
 *  anyone reaches this screen, and saying so is the cheapest reassurance
 *  there is. */
function StepRail({ current }: { readonly current: 1 | 2 }) {
  const { t } = useI18n();
  const steps = [
    { done: true, label: t("nav.account") },
    { done: current > 1, label: t("forms.title") },
  ];
  return (
    <ol className="mb-8 flex items-center gap-3 text-xs">
      {steps.map((step, index) => {
        const active = index + 1 === current || (index === 0 && current === 1);
        return (
          <li key={step.label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[10px] font-medium",
                step.done
                  ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                  : active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {step.done ? (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} strokeWidth={2} />
              ) : (
                index + 1
              )}
            </span>
            <span className={cn(step.done || active ? "text-foreground" : "text-muted-foreground")}>
              {step.label}
            </span>
            {index < steps.length - 1 ? <span className="h-px w-6 bg-border" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** A tall, tappable answer. Used by both questions and by the template picker,
 *  because they are the same gesture. */
function ChoiceCard({
  selected,
  icon,
  title,
  blurb,
  badge,
  onClick,
}: {
  readonly selected: boolean;
  readonly icon?: IconSvgElement;
  readonly title: string;
  readonly blurb?: string;
  readonly badge?: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-cuelume-hover="tick"
      data-cuelume-press
      className={cn(
        "relative flex w-full flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all duration-150",
        "hover:border-foreground/25 hover:bg-accent active:scale-[0.99]",
        selected
          ? "border-foreground/40 bg-accent shadow-[var(--shadow-inset)]"
          : "border-border bg-card/40",
      )}
    >
      {badge ? (
        <span className="mb-1 rounded-full bg-[var(--status-success-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--status-success-fg)]">
          {badge}
        </span>
      ) : null}
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon ? (
          <HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
        ) : null}
        {title}
      </span>
      {blurb ? <span className="text-xs text-muted-foreground">{blurb}</span> : null}
    </button>
  );
}

export default function NewFormPage() {
  const router = useRouter();
  const { locale, t } = useI18n();

  const [question, setQuestion] = useState<1 | 2 | "pick">(1);
  const [source, setSource] = useState<LeadSource | null>(null);
  const [purpose, setPurpose] = useState<FormPurpose | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const recommended = purpose ? recommendedTemplate(purpose) : null;
  // Recommendation first, everything else in its own order — a suggestion that
  // hides the alternatives is not a suggestion.
  const templates = recommended
    ? [...FORM_TEMPLATES].sort((a, b) =>
        a.id === recommended ? -1 : b.id === recommended ? 1 : 0,
      )
    : FORM_TEMPLATES;

  const create = async () => {
    const chosen = templateId ?? recommended ?? "blank";
    setBusy(true);
    const result = await fetchJson<{ form: Form }>("/api/forms", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId: chosen, locale }),
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    router.push(`/forms/${result.data.form.id}`);
  };

  return (
    <PageContainer maxWidth="max-w-2xl" pattern="grid">
      <div className="content-enter">
        <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />
        <StepRail current={question === "pick" ? 2 : 1} />

        {question !== "pick" ? (
          <>
            <p className="text-xs font-medium text-muted-foreground">
              {t("forms.wizard.questionOf", { current: question, total: 2 })}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              {t(question === 1 ? "forms.wizard.q1" : "forms.wizard.q2")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(question === 1 ? "forms.wizard.q1Hint" : "forms.wizard.q2Hint")}
            </p>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {question === 1
                ? SOURCES.map((option) => (
                    <ChoiceCard
                      key={option.id}
                      icon={option.icon}
                      selected={source === option.id}
                      title={t(option.labelKey)}
                      onClick={() => {
                        setSource(option.id);
                        setQuestion(2);
                      }}
                    />
                  ))
                : PURPOSES.map((option) => (
                    <ChoiceCard
                      key={option.id}
                      icon={PURPOSE_ICONS[option.id]}
                      selected={purpose === option.id}
                      title={t(option.labelKey)}
                      onClick={() => {
                        setPurpose(option.id);
                        setTemplateId(recommendedTemplate(option.id));
                        setQuestion("pick");
                      }}
                    />
                  ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (question === 1 ? router.push("/forms") : setQuestion(1))}
              >
                <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={1.75} />
                {t("forms.wizard.back")}
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => (question === 1 ? setQuestion(2) : setQuestion("pick"))}
              >
                {t("onboarding.skip")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{t("forms.wizard.pickTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("forms.wizard.pickSubtitle")}</p>

            <div className="mt-6 grid gap-2">
              {templates.map((template) => (
                <ChoiceCard
                  key={template.id}
                  icon={PURPOSE_ICONS[template.purpose]}
                  selected={(templateId ?? recommended) === template.id}
                  title={t(template.titleKey)}
                  blurb={t(template.blurbKey)}
                  badge={
                    template.id === recommended ? t("forms.wizard.recommended") : undefined
                  }
                  onClick={() => setTemplateId(template.id)}
                />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setQuestion(2)}>
                <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={1.75} />
                {t("forms.wizard.back")}
              </Button>
              <Button onClick={() => void create()} disabled={busy}>
                {busy ? t("forms.wizard.creating") : t("forms.wizard.create")}
              </Button>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
