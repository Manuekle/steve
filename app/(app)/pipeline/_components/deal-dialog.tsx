"use client";

import { type FormEvent, useId, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { DEAL_STAGES, defaultCurrency } from "@/lib/deals";
import { useI18n } from "@/lib/i18n/provider";
import type { Contact, Deal, DealStage } from "@/lib/types";

/** The codes an operator here is realistically quoting in. Free text would
 *  let a typo through into `Intl.NumberFormat`; a closed list of the region's
 *  currencies plus the two reserve ones covers the actual cases. */
const CURRENCIES = ["ARS", "USD", "EUR", "BRL", "CLP", "COP", "MXN", "PEN", "UYU"] as const;

/**
 * Create or edit a deal.
 *
 * Remount per target with `key={editing?.id ?? "new"}` at the call site — the
 * form state below is local, and without the key an edit dialog opened twice
 * shows the first deal's numbers against the second deal's name.
 */
export function DealDialog({
  editing,
  contacts,
  deals,
  presetContactId,
  onClose,
  onSaved,
}: {
  readonly editing: Deal | null;
  readonly contacts: readonly Contact[];
  /** Only read to pick the starting currency — whatever this account already
   *  quotes in most. */
  readonly deals: readonly Deal[];
  readonly presetContactId?: string;
  readonly onClose: () => void;
  readonly onSaved: (deal: Deal) => void;
}) {
  const { locale, t } = useI18n();
  const base = useId();
  const isEditing = Boolean(editing);

  const [title, setTitle] = useState(editing?.title ?? "");
  // No fallback to the first contact in the list. It read as a helpful
  // default and was a trap: this component mounts with the page, before
  // `/api/contacts` has answered, so `contacts[0]` was undefined anyway — and
  // had it not been, a deal would have been quietly filed against whoever
  // happened to sort first. An empty select and a disabled Save is the honest
  // version.
  const [contactId, setContactId] = useState(editing?.contactId ?? presetContactId ?? "");
  const [value, setValue] = useState(editing ? String(editing.value) : "");
  const [currency, setCurrency] = useState(
    editing?.currency ?? defaultCurrency(deals, locale),
  );
  const [stage, setStage] = useState<DealStage>(editing?.stage ?? "lead");
  // `<input type="date">` wants YYYY-MM-DD; the store keeps a full ISO stamp.
  const [closeDate, setCloseDate] = useState(
    editing?.expectedCloseAt ? editing.expectedCloseAt.slice(0, 10) : "",
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [lostReason, setLostReason] = useState(editing?.lostReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => a.name.localeCompare(b.name)),
    [contacts],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !contactId) return;
    setBusy(true);
    const payload = {
      title: title.trim(),
      value: value.trim() === "" ? 0 : Number(value),
      currency,
      stage,
      // "" clears the date; the route reads an empty string as "remove it".
      expectedCloseAt: closeDate,
      notes: notes.trim(),
      ...(stage === "lost" ? { lostReason: lostReason.trim() } : {}),
    };
    const result = editing
      ? await fetchJson<{ deal: Deal }>(`/api/deals/${editing.id}`, t, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetchJson<{ deal: Deal }>("/api/deals", t, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, contactId }),
        });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.deal);
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {t(isEditing ? "pipeline.dialog.editTitle" : "pipeline.dialog.newTitle")}
        </DialogTitle>
        <DialogDescription>{t("pipeline.dialog.description")}</DialogDescription>
      </DialogHeader>

      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{t("pipeline.field.title")}</span>
          <Input
            autoFocus
            required
            value={title}
            placeholder={t("pipeline.field.titlePlaceholder")}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="space-y-1.5 text-sm">
          <span className="font-medium" id={`${base}-contact-label`}>
            {t("pipeline.field.contact")}
          </span>
          {/* A deal belongs to a person, and the contact it belongs to is not
              something an edit should be able to reassign — a deal that moves
              between people takes its history somewhere it never happened. */}
          <Select value={contactId} onValueChange={setContactId} disabled={isEditing}>
            <SelectTrigger aria-labelledby={`${base}-contact-label`} className="w-full">
              <SelectValue placeholder={t("pipeline.field.contactPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {sortedContacts.map((contact) => (
                <SelectItem key={contact.id} value={contact.id}>
                  {contact.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">{t("pipeline.field.value")}</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={value}
              placeholder="0"
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <div className="space-y-1.5 text-sm">
            <span className="font-medium" id={`${base}-currency-label`}>
              {t("pipeline.field.currency")}
            </span>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger aria-labelledby={`${base}-currency-label`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 text-sm">
            <span className="font-medium" id={`${base}-stage-label`}>
              {t("pipeline.field.stage")}
            </span>
            <Select value={stage} onValueChange={(next) => setStage(next as DealStage)}>
              <SelectTrigger aria-labelledby={`${base}-stage-label`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEAL_STAGES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`pipeline.stage.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">{t("pipeline.field.closeDate")}</span>
            <Input
              type="date"
              value={closeDate}
              onChange={(event) => setCloseDate(event.target.value)}
            />
          </label>
        </div>

        {stage === "lost" ? (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">{t("pipeline.field.lostReason")}</span>
            <Input
              value={lostReason}
              placeholder={t("pipeline.field.lostReasonPlaceholder")}
              onChange={(event) => setLostReason(event.target.value)}
            />
          </label>
        ) : null}

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{t("pipeline.field.notes")}</span>
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy || !title.trim() || !contactId}>
            {busy ? t("pipeline.dialog.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
