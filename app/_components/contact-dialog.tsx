"use client";

import { type FormEvent, useId, useState } from "react";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useI18n } from "@/lib/i18n/provider";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { relativeTime } from "@/lib/format";
import type { Contact, ContactStatus } from "@/lib/types";

const STATUS_OPTIONS: readonly ContactStatus[] = ["open", "waiting_human", "followup_due", "closed"];

export type ContactSavePayload = {
  readonly id?: string;
  readonly name: string;
  readonly phone?: string;
  readonly email?: string;
  readonly status: ContactStatus;
  readonly notes?: string;
};

/**
 * Create or edit a contact — the one thing CRM and Leads used to be missing:
 * every contact arrived through a channel, a form, or a webhook, and there
 * was no way to add one by hand or fix a typo'd name after the fact. Both
 * pages open this on the same record, so a contact edited from one is never
 * out of sync with what the other shows.
 */
export function ContactDialog({
  editing,
  onClose,
  onSaved,
}: {
  /** The caller must remount this component per target — pass
   *  `key={editing?.id ?? "new"}` at the call site, the same convention
   *  `AutomationDialog` uses. Without it, the local form state below would
   *  keep showing whichever contact was edited first. */
  readonly editing: Contact | null;
  readonly onClose: () => void;
  /** Called with the fresh contact list once the save round-trips. */
  readonly onSaved: (contacts: Contact[]) => void;
}) {
  const { t, locale } = useI18n();
  // The one control here a <label> cannot wrap: a Radix Select is a button,
  // not a labelable element, which is why this field was a bare span while
  // every other field in this form is correctly wrapped.
  const base = useId();
  const statusLabelId = `${base}-status-label`;
  const statusControlId = `${base}-status`;
  const isEditing = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [status, setStatus] = useState<ContactStatus>(editing?.status ?? "open");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<UiError | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldError(null);
    setSaveError(null);

    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    if (!trimmedPhone && !trimmedEmail) {
      setFieldError(t("contactDialog.contactMethodRequired"));
      return;
    }

    setSaving(true);
    const result = await fetchJson<{ contact?: Contact; contacts?: Contact[] }>(
      "/api/contacts",
      t,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact: {
            ...(editing ? { id: editing.id } : { source: "manual", channel: "web" }),
            name: name.trim(),
            phone: trimmedPhone || undefined,
            email: trimmedEmail || undefined,
            status,
            notes: notes.trim() || undefined,
          },
        }),
      },
    );
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    onSaved(result.data.contacts ?? []);
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEditing ? t("contactDialog.editTitle") : t("contactDialog.addTitle")}</DialogTitle>
        <DialogDescription>
          {isEditing ? t("contactDialog.editDescription") : t("contactDialog.addDescription")}
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{t("contactDialog.name")}</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("contactDialog.namePlaceholder")}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">{t("contactDialog.phone")}</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">{t("contactDialog.email")}</span>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </label>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium" id={statusLabelId}>
            {t("contactDialog.status")}
          </span>
          <Select value={status} onValueChange={(val) => setStatus(val as ContactStatus)}>
            <SelectTrigger
              aria-labelledby={`${statusLabelId} ${statusControlId}`}
              className="w-full"
              id={statusControlId}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {t(`contactStatus.${opt}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{t("contactDialog.notes")}</span>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("contactDialog.notesPlaceholder")}
            rows={3}
          />
        </label>

        {editing?.research ? (
          // Read-only: this comes from the research_lead tool, run by the
          // agent mid-conversation — there is nothing here to edit by hand.
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{t("contactDialog.research")}</span>
              <span className="text-xs text-muted-foreground">
                {t("contactDialog.researchedAt", { when: relativeTime(editing.research.researchedAt, locale) })}
              </span>
            </div>
            <p className="text-muted-foreground">{editing.research.summary}</p>
            {editing.research.companyName ? (
              <p>
                <span className="font-medium">{t("contactDialog.researchCompany")}: </span>
                {editing.research.companyName}
              </p>
            ) : null}
            {editing.research.signals.length > 0 ? (
              <ul className="list-inside list-disc text-muted-foreground">
                {editing.research.signals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            ) : null}
            {editing.research.sources.length > 0 ? (
              <p className="truncate text-xs text-muted-foreground">
                {t("contactDialog.researchSources")}:{" "}
                {editing.research.sources.map((url, i) => (
                  <span key={url}>
                    {i > 0 ? ", " : ""}
                    <a href={url} target="_blank" rel="noreferrer" className="underline">
                      {new URL(url).hostname}
                    </a>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}

        {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
        <ErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("contactDialog.cancel")}
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {t("contactDialog.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
