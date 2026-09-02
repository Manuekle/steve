"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  Delete02Icon,
  DownloadCircle01Icon,
  LegalDocument01Icon,
  Loading03Icon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/provider";
import { useSound } from "@/components/sound-provider";
import { useToast } from "@/components/toast-provider";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { BusinessIdentity, LegalPage, LegalPageKind } from "@/lib/business-profile-store";

/**
 * Terms and privacy, the two pages every business is asked for and nobody has
 * at hand. Either can be pasted or pulled straight off the owner's own site.
 *
 * Saving indexes the text into the knowledge base, so the agent quotes the
 * real clause instead of paraphrasing a summary — the same path an uploaded
 * PDF takes. The URL is kept separately because a link is the thing a
 * customer usually wants handed over.
 */

const KINDS = [
  { kind: "terms", icon: LegalDocument01Icon, titleKey: "business.legalTerms" },
  { kind: "privacy", icon: SecurityCheckIcon, titleKey: "business.legalPrivacy" },
] as const satisfies readonly { kind: LegalPageKind; icon: IconSvgElement; titleKey: string }[];

export function BusinessLegalForm({
  identity,
  onChange,
}: {
  readonly identity: BusinessIdentity;
  readonly onChange: (identity: BusinessIdentity) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("business.legalHint")}</p>
      {KINDS.map(({ kind, icon, titleKey }) => (
        <LegalPageEditor
          key={kind}
          kind={kind}
          icon={icon}
          title={t(titleKey)}
          page={identity[kind]}
          fallbackUrl={identity.websiteUrl}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function LegalPageEditor({
  kind,
  icon,
  title,
  page,
  fallbackUrl,
  onChange,
}: {
  readonly kind: LegalPageKind;
  readonly icon: IconSvgElement;
  readonly title: string;
  readonly page: LegalPage | null;
  /** The business website, offered as the placeholder — legal pages almost
   *  always hang off it. */
  readonly fallbackUrl: string;
  readonly onChange: (identity: BusinessIdentity) => void;
}) {
  const { t, locale } = useI18n();
  const { cue } = useSound();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [url, setUrl] = useState(page?.url ?? "");
  const [text, setText] = useState(page?.text ?? "");
  const [busy, setBusy] = useState<"import" | "save" | null>(null);
  const [error, setError] = useState<UiError | null>(null);

  const saved = useMemo(() => ({ url: page?.url ?? "", text: page?.text ?? "" }), [page]);
  const dirty = url !== saved.url || text !== saved.text;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirtyRef.current) {
      setUrl(saved.url);
      setText(saved.text);
    }
  }, [saved]);

  const importFromUrl = useCallback(async () => {
    const target = url.trim();
    if (!target) return;
    setBusy("import");
    setError(null);
    const result = await fetchJson<{ text: string }>("/api/business-profile/legal", t, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: target }),
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Imported, not saved: the owner reads what came back and presses save.
    setText(result.data.text);
    cue("success");
    toast({ title: t("business.legalImported"), status: "success" });
  }, [cue, t, toast, url]);

  const save = useCallback(async () => {
    setBusy("save");
    setError(null);
    const result = await fetchJson<{ identity: BusinessIdentity; indexWarning?: string }>(
      "/api/business-profile/legal",
      t,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, url: url.trim(), text }),
      },
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    cue("success");
    onChange(result.data.identity);
    toast({
      title: t("common.saved"),
      description: result.data.indexWarning
        ? t("business.legalIndexWarning", { detail: result.data.indexWarning })
        : undefined,
      status: result.data.indexWarning ? "error" : "success",
    });
  }, [cue, kind, onChange, t, text, toast, url]);

  const remove = useCallback(async () => {
    if (!(await confirm({ title: t("business.legalConfirmRemove", { title }) }))) return;
    cue("droplet");
    const result = await fetchJson<{ identity: BusinessIdentity }>(
      `/api/business-profile/legal?kind=${kind}`,
      t,
      { method: "DELETE" },
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUrl("");
    setText("");
    onChange(result.data.identity);
  }, [confirm, cue, kind, onChange, t, title]);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      {confirmDialog}
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <HugeiconsIcon icon={icon} size={15} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {page
              ? t("business.legalUpdatedAt", {
                  date: new Date(page.updatedAt).toLocaleDateString(locale, { dateStyle: "medium" }),
                })
              : t("business.legalEmpty")}
            {page?.documentId ? ` · ${t("business.legalIndexed")}` : ""}
          </p>
        </div>
        {page ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("business.legalRemove")}
            onClick={() => void remove()}
          >
            <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.75} />
          </Button>
        ) : null}
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor={`legal-url-${kind}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("business.legalUrl")}
          </label>
          <Input
            id={`legal-url-${kind}`}
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={fallbackUrl ? `${fallbackUrl.replace(/\/$/, "")}/${kind}` : "https://…"}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null || !url.trim()}
          onClick={() => void importFromUrl()}
        >
          {busy === "import" ? (
            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            <HugeiconsIcon icon={DownloadCircle01Icon} size={14} strokeWidth={1.75} />
          )}
          {t("business.legalImport")}
        </Button>
      </div>

      <div>
        <label htmlFor={`legal-text-${kind}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {t("business.legalText")}
        </label>
        <Textarea
          id={`legal-text-${kind}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("business.legalTextPlaceholder")}
          rows={5}
          className="max-h-64"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={busy !== null || !dirty || (!url.trim() && !text.trim())}
          onClick={() => void save()}
        >
          {busy === "save" ? (
            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
          ) : null}
          {t("common.save")}
        </Button>
        {dirty ? <p className="text-xs text-muted-foreground">{t("business.unsaved")}</p> : null}
      </div>
    </div>
  );
}
