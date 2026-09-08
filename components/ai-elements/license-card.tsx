"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowDown01Icon,
  Award05Icon,
  CheckIcon,
  Copy01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { LicenseCreditCard, licenseTone } from "@/components/ai-elements/license-credit-card";
import { EASE_OUT } from "@/lib/ease";
import { useI18n } from "@/lib/i18n/provider";
import type { LicenseInfo } from "@/lib/license/types";
import { Spinner } from "@/components/ui/spinner";

type LicenseInfoResponse = LicenseInfo & { readonly installationId: string };

// Settings card: the Enterprise license this install is running under.
//
// Purely informational — nothing here ever gates a feature. An expired
// `maintenanceUntil` shows an amber note, not a block, because this app must
// keep working on a host that can't reach anyone's servers. See
// lib/license/verify.ts and docs/commercial-licensing.md.
//
// The facts themselves live on the card face (license-credit-card.tsx); what
// is left here is the one thing a card cannot be — a place to paste a new
// token — and it stays folded away, because pasting a license is something
// you do once and then never again.

export function LicenseCard() {
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pasted, setPasted] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** `null` until someone touches the disclosure, so the default can stay a
   *  derived fact rather than state an effect has to keep in sync. */
  const [formOverride, setFormOverride] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/license");
      if (res.ok) {
        const data = (await res.json()) as LicenseInfoResponse;
        setInfo(data);
        setInstallationId(data.installationId);
      }
    } catch {
      // Leave the last known state on screen.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyInstallationId = useCallback(async () => {
    if (!installationId) return;
    try {
      await navigator.clipboard.writeText(installationId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied — the id is still selectable text on screen.
    }
  }, [installationId]);

  const save = useCallback(async () => {
    const licenseKey = pasted.trim();
    if (!licenseKey) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ licenseKey }),
      });
      if (res.ok) {
        const data = (await res.json()) as { info: LicenseInfo };
        setInfo(data.info);
        setPasted("");
        setFormOverride(false);
      } else {
        setSaveError(t("settings.license.saveError"));
      }
    } catch {
      setSaveError(t("settings.license.saveError"));
    } finally {
      setSaving(false);
    }
  }, [pasted, t]);

  const tone = licenseTone(info);
  const dateFormatter = new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const days = info?.daysUntilMaintenanceEnds ?? null;
  const toneDot: Record<typeof tone, string> = {
    "valid-active": "bg-emerald-500",
    "valid-inactive": "bg-amber-500",
    missing: "bg-muted-foreground/40",
    invalid: "bg-destructive",
  };
  // An install with no license has exactly one thing to do on this card, so
  // the form is already open when they arrive. One that has a license keeps
  // it folded — see the note at the top.
  const formOpen = formOverride ?? (!loading && tone === "missing");
  return (
    <div className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
          <HugeiconsIcon icon={Award05Icon} size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{t("settings.license.title")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.license.description")}</p>
        </div>
      </div>

      {/* The wallet the card sits in: a recessed surface, so the card reads as
          an object placed on the page rather than another panel drawn on it. */}
      <div className="relative border-y border-border bg-muted px-5 py-6 shadow-[inset_0_1px_3px_oklch(0_0_0/0.05)] sm:px-6 sm:py-7">
        <div className="bg-pattern bg-pattern-grid bg-pattern-fade pointer-events-none absolute inset-0 opacity-50" />
        {loading ? (
          <SkeletonBar className="relative mx-auto aspect-[1.586] w-full max-w-[23rem] rounded-[14px]" />
        ) : (
          <LicenseCreditCard info={info} installationId={installationId} className="relative" />
        )}
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Status, countdown and the date the face has no room for. They used
            to sit on the card itself — a pill, a big number and a progress
            bar — which is three dashboards' worth of chrome on an object whose
            whole job is to look like one thing. */}
        {!loading ? (
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className={`size-1.5 shrink-0 rounded-full ${toneDot[tone]}`} />
            <span className="font-medium text-foreground">
              {t(`settings.license.status.${tone}`)}
            </span>
            {info?.payload ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  {t("settings.license.maintenanceUntil")}{" "}
                  {dateFormatter.format(new Date(info.payload.maintenanceUntil))}
                </span>
                {days !== null && days > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{t("license.card.daysLeft", { days: String(days) })}</span>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        ) : null}

        {!loading && tone === "missing" ? (
          <p className="text-xs text-muted-foreground">{t("settings.license.none")}</p>
        ) : null}

        {info?.status === "valid" && !info.maintenanceActive ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t("settings.license.maintenanceExpiredNote")}
          </p>
        ) : null}

        {info?.status === "valid" && info.installationMatches === false ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t("settings.license.installationMismatch")}
          </p>
        ) : null}

        <div>
          <button
            type="button"
            aria-expanded={formOpen}
            aria-controls="license-paste-panel"
            onClick={() => {
              setFormOverride(!formOpen);
              if (!formOpen) setTimeout(() => textarea.current?.focus(), 220);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium transition-colors hover:text-foreground"
          >
            <span>{t(tone === "missing" ? "license.card.activate" : "license.card.replace")}</span>
            <motion.span
              animate={{ rotate: formOpen ? 180 : 0 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
              className="text-muted-foreground"
            >
              <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.75} />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {formOpen ? (
              <motion.div
                id="license-paste-panel"
                key="panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.26, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <div className="pt-3">
                  {/* The id you send to get a token, right above the box you
                      paste that token into. It used to live on the back of the
                      card behind a copy button, which is a fine place to read
                      it and the wrong place to need it. */}
                  <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {t("settings.license.installationIdLabel")}
                      </p>
                      <button
                        type="button"
                        disabled={!installationId}
                        onClick={() => void copyInstallationId()}
                        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        <HugeiconsIcon
                          icon={copied ? CheckIcon : Copy01Icon}
                          size={13}
                          strokeWidth={1.75}
                        />
                        {t(copied ? "settings.license.copied" : "settings.license.copyAction")}
                      </button>
                    </div>
                    <p className="mt-1.5 font-mono text-[11px] break-all text-foreground select-text">
                      {installationId ?? "…"}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {t("settings.license.installationIdHint")}
                    </p>
                  </div>

                  <label htmlFor="license-paste" className="mb-2 block text-xs text-muted-foreground">
                    {t("settings.license.pasteLabel")}
                  </label>
                  <Textarea
                    id="license-paste"
                    ref={textarea}
                    value={pasted}
                    onChange={(event) => setPasted(event.target.value)}
                    placeholder={t("settings.license.pastePlaceholder")}
                    rows={3}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2.5"
                    disabled={saving || pasted.trim().length === 0}
                    onClick={() => void save()}
                  >
                    {saving ? (
                      <Spinner size={15} strokeWidth={2} />
                    ) : null}
                    {t("settings.license.saveAction")}
                  </Button>
                  {saveError ? <p className="mt-2 text-xs text-destructive">{saveError}</p> : null}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
