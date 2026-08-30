"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Certificate01Icon, CheckIcon, Copy01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/provider";
import type { LicenseInfo } from "@/lib/license/types";

type LicenseInfoResponse = LicenseInfo & { readonly installationId: string };

// Settings card: the Enterprise license this install is running under.
//
// Purely informational — nothing here ever gates a feature. An expired
// `maintenanceUntil` shows an amber note, not a block, because this app must
// keep working on a host that can't reach anyone's servers. See
// lib/license/verify.ts and docs/commercial-licensing.md.

type StatusTone = "valid-active" | "valid-inactive" | "missing" | "invalid";

function statusTone(info: LicenseInfo | null): StatusTone {
  if (!info) return "missing";
  if (info.status === "missing") return "missing";
  if (info.status !== "valid") return "invalid";
  return info.maintenanceActive ? "valid-active" : "valid-inactive";
}

// Same chip shape the rest of the app uses for a status pill — a tinted
// background and a dot, no border — e.g. Connections' "Conectado" /
// "Configurado" badges. This one used to be its own one-off (bordered chip,
// text-600 instead of 700), which read as a different component next to
// them instead of the same kind of status.
const TONE_CLASS: Record<StatusTone, string> = {
  "valid-active": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "valid-inactive": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  missing: "bg-muted text-muted-foreground",
  invalid: "bg-destructive/10 text-destructive",
};

const TONE_DOT: Record<StatusTone, string> = {
  "valid-active": "bg-emerald-500",
  "valid-inactive": "bg-amber-500",
  missing: "bg-muted-foreground/40",
  invalid: "bg-destructive",
};

export function LicenseCard() {
  const { t, locale } = useI18n();
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pasted, setPasted] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const copyInstallationId = useCallback(async () => {
    if (!installationId) return;
    try {
      await navigator.clipboard.writeText(installationId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access denied — the id is still selectable text on screen.
    }
  }, [installationId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      } else {
        setSaveError(t("settings.license.saveError"));
      }
    } catch {
      setSaveError(t("settings.license.saveError"));
    } finally {
      setSaving(false);
    }
  }, [pasted, t]);

  const tone = statusTone(info);
  const dateFormatter = new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mb-4 break-inside-avoid rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
          <HugeiconsIcon icon={Certificate01Icon} size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{t("settings.license.title")}</h3>
            {!loading ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[tone]}`}
              >
                <span className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
                {t(`settings.license.status.${tone}`)}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.license.description")}</p>
        </div>
      </div>

      <div className="mx-5 h-px bg-border" />

      <div className="space-y-4 px-5 py-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">…</p>
        ) : info?.payload ? (
          <ul className="space-y-2 text-xs">
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("settings.license.company")}</span>
              <span className="truncate font-medium">{info.payload.company}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("settings.license.edition")}</span>
              <span className="truncate font-mono">{info.payload.edition}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("settings.license.issuedAt")}</span>
              <span>{dateFormatter.format(new Date(info.payload.issuedAt))}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("settings.license.maintenanceUntil")}</span>
              <span>{dateFormatter.format(new Date(info.payload.maintenanceUntil))}</span>
            </li>
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t("settings.license.none")}</p>
        )}

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
          <div className="mb-2 flex items-center justify-between gap-2">
            <label htmlFor="license-installation-id" className="block text-sm font-medium">
              {t("settings.license.installationIdLabel")}
            </label>
            <button
              type="button"
              onClick={() => void copyInstallationId()}
              disabled={!installationId}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <HugeiconsIcon icon={copied ? CheckIcon : Copy01Icon} size={13} strokeWidth={1.75} />
              {t(copied ? "settings.license.copied" : "settings.license.copyAction")}
            </button>
          </div>
          <p
            id="license-installation-id"
            className="truncate rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground"
          >
            {installationId ?? "…"}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("settings.license.installationIdHint")}
          </p>
        </div>

        <div>
          <label htmlFor="license-paste" className="mb-2 block text-sm font-medium">
            {t("settings.license.pasteLabel")}
          </label>
          <Textarea
            id="license-paste"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={t("settings.license.pastePlaceholder")}
            rows={3}
            className="font-mono text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="mt-2"
            disabled={saving || pasted.trim().length === 0}
            onClick={() => void save()}
          >
            {saving ? (
              <HugeiconsIcon icon={Loading03Icon} size={15} strokeWidth={2} className="animate-spin" />
            ) : null}
            {t("settings.license.saveAction")}
          </Button>
          {saveError ? <p className="mt-2 text-xs text-destructive">{saveError}</p> : null}
        </div>
      </div>
    </div>
  );
}
