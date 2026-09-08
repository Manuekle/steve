"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n/provider";

/**
 * Log something that was done to the site.
 *
 * Two fields, and the date is the one that matters: it is the day the change
 * went live, not the day someone got round to writing it down, so it defaults
 * to today and is expected to be edited backwards. The note is a sentence for
 * a human — "titles reescritos en /precios" — because in four weeks it is the
 * only thing that will explain a step in the graph.
 */
export function ChangeDialog({
  onOpenChange,
  onSaved,
  open,
}: {
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}) {
  const t = useT();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const save = async () => {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    const result = await fetchJson<{ ok: boolean }>("/api/seo", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, note }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNote("");
    setDate(today);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("seo.logChange")}</DialogTitle>
          <DialogDescription>{t("seo.logChangeHelp")}</DialogDescription>
        </DialogHeader>

        <ErrorBanner error={error} />

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="font-medium text-sm" htmlFor="seo-change-note">
              {t("seo.changeNote")}
            </label>
            <Input
              id="seo-change-note"
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("seo.changeNotePlaceholder")}
              value={note}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-sm" htmlFor="seo-change-date">
              {t("seo.changeDate")}
            </label>
            <Input
              id="seo-change-date"
              // Future dates have no traffic after them to compare against.
              max={today}
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
            {t("common.cancel")}
          </Button>
          <Button disabled={saving || !note.trim()} onClick={() => void save()} type="button">
            {saving ? t("seo.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
