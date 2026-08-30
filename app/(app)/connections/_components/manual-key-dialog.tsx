"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n/provider";
import { VALIDATION_ERROR_KEYS } from "@/lib/settings-i18n";
import { CredentialField } from "@/app/_components/credential-field";
import type { CredentialGroup } from "@/lib/credentials";

type SettingsResponse = {
  readonly groups?: CredentialGroup[];
  readonly credentials?: Record<string, boolean>;
  /** Set anywhere, store or environment. */
  readonly configured?: Record<string, boolean>;
  readonly sources?: Record<string, "store" | "env">;
  readonly values?: Record<string, string>;
  readonly previews?: Record<string, string>;
};

/**
 * The "Agregar clave" / "Revisar" action for a manual (API-key) connection,
 * inline instead of a detour through Settings. It shows exactly the fields
 * that one vendor's `CredentialGroup` carries — same catalog, same POST
 * /api/settings, same local storage — so nothing here is a second source of
 * truth for what a field is called or how it validates.
 *
 * `onlyKeys` narrows that group to a subset. The OAuth-app group is one list
 * of every provider's client ID and secret, so a card that only wants to
 * register *its* app passes its own two keys rather than opening a form for
 * all six vendors at once.
 */
export function ManualKeyDialog({
  open,
  onOpenChange,
  settingsGroup,
  label,
  onSaved,
  onlyKeys,
  descriptionKey = "connections.manualDialogDescription",
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly settingsGroup: string;
  readonly label: string;
  readonly onSaved: () => void;
  readonly onlyKeys?: readonly string[];
  readonly descriptionKey?: string;
}) {
  const t = useT();
  const [group, setGroup] = useState<CredentialGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [sources, setSources] = useState<Record<string, "store" | "env">>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Keep the last-opened props stable so the close animation doesn't reflow
  // when the parent nulls the target (label/settingsGroup become "" mid-exit).
  const stableSettingsGroup = useRef(settingsGroup);
  const stableLabel = useRef(label);
  const stableOnlyKeys = useRef(onlyKeys);
  const stableDescriptionKey = useRef(descriptionKey);
  if (open) {
    stableSettingsGroup.current = settingsGroup;
    stableLabel.current = label;
    stableOnlyKeys.current = onlyKeys;
    stableDescriptionKey.current = descriptionKey;
  }
  // Joined so the effect below re-runs on a genuine change of keys rather than
  // on every render that hands it a fresh array literal.
  const keyFilterId = stableOnlyKeys.current?.join(",");
  const keyFilter = useMemo(
    () => (keyFilterId ? keyFilterId.split(",") : undefined),
    [keyFilterId],
  );

  useEffect(() => {
    if (!open || !stableSettingsGroup.current) return;
    setGroup(null);
    setFieldErrors({});
    setError(null);
    setLoading(true);
    void fetchJson<SettingsResponse>("/api/settings", t).then((result) => {
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGroup((result.data.groups ?? []).find((g) => g.id === stableSettingsGroup.current) ?? null);
      setStatus(result.data.configured ?? result.data.credentials ?? {});
      setSources(result.data.sources ?? {});
      setValues(result.data.values ?? {});
      setPreviews(result.data.previews ?? {});
    });
  }, [open, t]);

  // Same rule Settings uses: an unset provider means the Gateway, matching
  // resolveProvider()'s own default. Without it the select opens blank and
  // every provider-scoped key field below it hides.
  const activeProvider =
    values.AI_PROVIDER && values.AI_PROVIDER.length > 0 ? values.AI_PROVIDER : "gateway";

  // A group can carry one field per provider (the AI group carries three) and
  // only the chosen provider's key is worth asking for. Settings filters the
  // same way; this dialog used to show all three at once.
  const fields = useMemo(() => {
    const all = group?.fields ?? [];
    // An explicit key list is a deliberate choice and outranks the
    // provider-scoped visibility rule: the card asked for *these* fields, and
    // hiding one because a different provider is active is how the Anthropic
    // modal ended up with no Anthropic field in it.
    if (keyFilter) return all.filter((field) => keyFilter.includes(field.key));
    return all.filter(
      (field) => !field.showWhenProvider || field.showWhenProvider.includes(activeProvider),
    );
  }, [group, activeProvider, keyFilter]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const submit = async () => {
    if (!group) return;
    const errors: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field.key];
      if (value && field.pattern) {
        try {
          if (!new RegExp(field.pattern).test(value)) {
            errors[field.key] = t(VALIDATION_ERROR_KEYS[field.key] ?? "settings.validate.generic");
          }
        } catch {
          // Unparseable pattern — nothing to enforce client-side.
        }
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload: Record<string, string> = {};
    for (const field of fields) {
      if (values[field.key] !== undefined) payload[field.key] = values[field.key];
    }
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setError(null);
    const result = await fetchJson<SettingsResponse>("/api/settings", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("connections.manualDialogTitle", { provider: stableLabel.current })}</DialogTitle>
          <DialogDescription>{t(stableDescriptionKey.current)}</DialogDescription>
        </DialogHeader>

        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        {loading || !group ? (
          <div className="space-y-3 py-1">
            <div className="h-9 animate-pulse rounded-lg bg-muted" />
            <div className="h-9 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : (
          <div className="space-y-4">
            {fields.map((field) => (
              <CredentialField
                key={field.key}
                field={field}
                value={values[field.key] ?? ""}
                onChange={handleChange}
                activeProvider={activeProvider}
                preview={previews[field.key]}
                error={fieldErrors[field.key]}
                show={show[field.key] ?? false}
                onToggleShow={(key) => setShow((prev) => ({ ...prev, [key]: !prev[key] }))}
                headerExtra={
                  status[field.key] ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {t("connections.statusConfigured")}
                    </span>
                  ) : null
                }
                hint={
                  sources[field.key] === "env"
                    ? t("settings.fromEnvHint")
                    : field.type === "password" && status[field.key]
                      ? t("connections.secretHiddenHint")
                      : undefined
                }
              />
            ))}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("billing.cancel")}</Button>
          </DialogClose>
          <Button disabled={saving || loading || !group} onClick={() => void submit()}>
            {saving ? (
              <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={1.75} className="animate-spin" />
            ) : (
              <HugeiconsIcon icon={CheckIcon} size={16} strokeWidth={1.75} />
            )}
            {saving ? t("settings.saving") : t("settings.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
