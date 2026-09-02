"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import { SlackIcon, DiscordIcon } from "@hugeicons/core-free-icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n/provider";
import type { WorkflowStep } from "@/lib/types";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const CONTACT_STATUSES: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "open", labelKey: "automations.statusOpen" },
  { value: "waiting_human", labelKey: "automations.statusWaitingHuman" },
  { value: "followup_due", labelKey: "automations.statusFollowupDue" },
  { value: "closed", labelKey: "automations.statusClosed" },
];

const PAYMENT_CURRENCIES = ["usd", "eur", "mxn", "ars", "cop", "brl", "clp", "pen", "uyu"] as const;

/** Mercado Pago bills only in the currencies of the countries it operates in.
 *  Picking it with USD or EUR selected would fail at run time, so the currency
 *  list narrows with the processor instead of letting that happen. */
const MERCADOPAGO_CURRENCIES = new Set(["ars", "brl", "clp", "cop", "mxn", "pen", "uyu"]);

const PAYMENT_PROVIDERS = ["stripe", "mercadopago"] as const;

export function StepEditor({
  step,
  onConfigChange,
}: {
  readonly step: WorkflowStep;
  readonly onConfigChange: (id: string, key: string, value: string) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4 px-4 pt-1 pb-4">
      {step.type === "message" ? (
        <label className="block space-y-1 text-sm">
          <span className="text-[13px] font-medium text-muted-foreground">{t("automations.messageToSend")}</span>
          <Textarea
            onChange={(e) => onConfigChange(step.id, "message", e.target.value)}
            placeholder={t("automations.messagePlaceholder")}
            rows={3}
            value={step.config.message ?? ""}
          />
        </label>
      ) : null}

      {step.type === "ai_response" ? (
        <>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.promptLabel")}</span>
            <Textarea
              onChange={(e) => onConfigChange(step.id, "prompt", e.target.value)}
              placeholder={t("automations.promptPlaceholder")}
              rows={2}
              value={step.config.prompt ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("automations.promptHelp")}
          </p>
        </>
      ) : null}

      {step.type === "wait" ? (
        <label className="block space-y-1 text-sm">
          <span className="text-[13px] font-medium text-muted-foreground">{t("automations.duration")}</span>
          <Input
            onChange={(e) => onConfigChange(step.id, "duration", e.target.value)}
            placeholder={t("automations.durationPlaceholder")}
            value={step.config.duration ?? ""}
          />
        </label>
      ) : null}

      {step.type === "condition" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.conditionLabel")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "condition", e.target.value)}
              placeholder={t("automations.conditionPlaceholder")}
              value={step.config.condition ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("automations.conditionHelp")}
          </p>
        </div>
      ) : null}

      {step.type === "transfer_human" ? (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("automations.transferHelp")}
          </p>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.transferMessage")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "message", e.target.value)}
              placeholder={t("automations.transferPlaceholder")}
              value={step.config.message ?? ""}
            />
          </label>
        </div>
      ) : null}

      {step.type === "send_audio" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.mediaUrl")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "mediaUrl", e.target.value)}
              placeholder="https://example.com/audio.mp3"
              value={step.config.mediaUrl ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.aiPromptOptional")}</span>
            <Textarea
              onChange={(e) => onConfigChange(step.id, "mediaPrompt", e.target.value)}
              placeholder={t("automations.audioPromptPlaceholder")}
              rows={2}
              value={step.config.mediaPrompt ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("automations.audioHelp")}
          </p>
        </div>
      ) : null}

      {step.type === "send_image" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.mediaUrl")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "mediaUrl", e.target.value)}
              placeholder="https://example.com/image.jpg"
              value={step.config.mediaUrl ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.mediaCaption")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "mediaCaption", e.target.value)}
              placeholder={t("automations.mediaCaptionPlaceholder")}
              value={step.config.mediaCaption ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.aiPromptOptional")}</span>
            <Textarea
              onChange={(e) => onConfigChange(step.id, "mediaPrompt", e.target.value)}
              placeholder={t("automations.imagePromptPlaceholder")}
              rows={2}
              value={step.config.mediaPrompt ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("automations.imageHelp")}
          </p>
        </div>
      ) : null}

      {step.type === "http_request" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.urlLabel")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "url", e.target.value)}
              placeholder="https://api.tu-crm.com/leads"
              value={step.config.url ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.methodLabel")}</span>
            <Select
              value={step.config.method ?? "POST"}
              onValueChange={(value) => onConfigChange(step.id, "method", value)}
            >
              <SelectTrigger
                aria-label={t("automations.methodLabel")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HTTP_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.bodyLabel")}</span>
            <Textarea
              className="font-mono text-xs"
              onChange={(e) => onConfigChange(step.id, "body", e.target.value)}
              placeholder={'{"name": "{{contact.name}}", "phone": "{{contact.phone}}"}'}
              rows={3}
              value={step.config.body ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("automations.httpHelp")}</p>
        </div>
      ) : null}

      {step.type === "notify_whatsapp" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.phoneLabel")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "phone", e.target.value)}
              placeholder={t("automations.phonePlaceholder")}
              value={step.config.phone ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.messageToSend")}</span>
            <Textarea
              onChange={(e) => onConfigChange(step.id, "message", e.target.value)}
              placeholder={t("automations.messagePlaceholder")}
              rows={3}
              value={step.config.message ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("automations.whatsappHelp")}</p>
        </div>
      ) : null}

      {step.type === "notify_team" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.serviceLabel")}</span>
            <Select
              value={step.config.service ?? "slack"}
              onValueChange={(value) => onConfigChange(step.id, "service", value)}
            >
              <SelectTrigger
                aria-label={t("automations.serviceLabel")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slack">
                  <span className="flex items-center gap-2">
                    <HugeiconsIcon icon={SlackIcon} size={14} strokeWidth={1.75} />
                    {t("automations.serviceSlack")}
                  </span>
                </SelectItem>
                <SelectItem value="discord">
                  <span className="flex items-center gap-2">
                    <HugeiconsIcon icon={DiscordIcon} size={14} strokeWidth={1.75} />
                    {t("automations.serviceDiscord")}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.webhookUrlFieldLabel")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "webhookUrl", e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              value={step.config.webhookUrl ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.messageToSend")}</span>
            <Textarea
              onChange={(e) => onConfigChange(step.id, "message", e.target.value)}
              placeholder={t("automations.messagePlaceholder")}
              rows={3}
              value={step.config.message ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("automations.teamMessageHelp")}</p>
        </div>
      ) : null}

      {step.type === "notify_email" ? <NotifyEmailFields step={step} onConfigChange={onConfigChange} /> : null}

      {step.type === "update_contact" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.contactStatusLabel")}</span>
            <Select
              value={step.config.contactStatus ?? "open"}
              onValueChange={(value) => onConfigChange(step.id, "contactStatus", value)}
            >
              <SelectTrigger
                aria-label={t("automations.contactStatusLabel")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.contactNoteLabel")}</span>
            <Textarea
              onChange={(e) => onConfigChange(step.id, "contactNote", e.target.value)}
              placeholder={t("automations.contactNotePlaceholder")}
              rows={2}
              value={step.config.contactNote ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("automations.contactHelp")}</p>
        </div>
      ) : null}

      {step.type === "log_sheet" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.spreadsheetIdLabel")}</span>
            <Input
              className="font-mono text-xs"
              onChange={(e) => onConfigChange(step.id, "spreadsheetId", e.target.value)}
              placeholder={t("automations.spreadsheetIdPlaceholder")}
              value={step.config.spreadsheetId ?? ""}
            />
            <p className="text-xs leading-relaxed text-muted-foreground/80">{t("automations.spreadsheetIdHelp")}</p>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.sheetNameLabel")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "sheetName", e.target.value)}
              placeholder="Sheet1"
              value={step.config.sheetName ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("automations.sheetNameHelp")}</p>
        </div>
      ) : null}

      {step.type === "send_payment_link" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.productNameLabel")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "productName", e.target.value)}
              placeholder={t("automations.productNamePlaceholder")}
              value={step.config.productName ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.paymentProviderLabel")}</span>
            <Select
              value={step.config.paymentProvider ?? "stripe"}
              onValueChange={(value) => {
                onConfigChange(step.id, "paymentProvider", value);
                // Switching to Mercado Pago with USD selected would only fail
                // at run time, so the currency moves with the processor.
                const currency = step.config.currency ?? "usd";
                if (value === "mercadopago" && !MERCADOPAGO_CURRENCIES.has(currency)) {
                  onConfigChange(step.id, "currency", "ars");
                }
              }}
            >
              <SelectTrigger
                aria-label={t("automations.paymentProviderLabel")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_PROVIDERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`automations.paymentProvider.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-sm">
              <span className="text-[13px] font-medium text-muted-foreground">{t("automations.amountLabel")}</span>
              <Input
                inputMode="decimal"
                onChange={(e) => onConfigChange(step.id, "amount", e.target.value)}
                placeholder="49.99"
                value={step.config.amount ?? ""}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-[13px] font-medium text-muted-foreground">{t("automations.currencyLabel")}</span>
              <Select
                value={step.config.currency ?? "usd"}
                onValueChange={(value) => onConfigChange(step.id, "currency", value)}
              >
                <SelectTrigger
                  aria-label={t("automations.currencyLabel")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_CURRENCIES.filter(
                    (code) =>
                      step.config.paymentProvider !== "mercadopago" ||
                      MERCADOPAGO_CURRENCIES.has(code),
                  ).map((code) => (
                    <SelectItem key={code} value={code}>
                      {code.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.paymentMessageLabel")}</span>
            <Textarea
              onChange={(e) => onConfigChange(step.id, "message", e.target.value)}
              placeholder="Acá tenés el link de pago: {{link}}"
              rows={2}
              value={step.config.message ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("automations.paymentMessageHelp")}</p>
        </div>
      ) : null}

      {step.type === "book_meeting" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.meetingSummaryLabel")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "meetingSummary", e.target.value)}
              placeholder={t("automations.meetingSummaryPlaceholder")}
              value={step.config.meetingSummary ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.meetingDurationLabel")}</span>
            <Input
              inputMode="numeric"
              onChange={(e) => onConfigChange(step.id, "meetingDurationMin", e.target.value)}
              placeholder="30"
              value={step.config.meetingDurationMin ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.meetingMessageLabel")}</span>
            <Textarea
              onChange={(e) => onConfigChange(step.id, "message", e.target.value)}
              placeholder="Tu reunión quedó agendada para {{start}}. Unite acá: {{meetLink}}"
              rows={2}
              value={step.config.message ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("automations.meetingHelp")}</p>
        </div>
      ) : null}

      {step.type === "send_video" ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.mediaUrl")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "mediaUrl", e.target.value)}
              placeholder="https://example.com/video.mp4"
              value={step.config.mediaUrl ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.mediaCaption")}</span>
            <Input
              onChange={(e) => onConfigChange(step.id, "mediaCaption", e.target.value)}
              placeholder={t("automations.mediaCaptionPlaceholder")}
              value={step.config.mediaCaption ?? ""}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[13px] font-medium text-muted-foreground">{t("automations.aiPromptOptional")}</span>
            <Textarea
              onChange={(e) => onConfigChange(step.id, "mediaPrompt", e.target.value)}
              placeholder={t("automations.videoPromptPlaceholder")}
              rows={2}
              value={step.config.mediaPrompt ?? ""}
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("automations.videoHelp")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** No template picked means the step sends its own `message` as plain text;
 *  picking one means the body is that template, rendered with the contact. */
const PLAIN_TEXT_TEMPLATE = "__plain__";

/**
 * `notify_email`'s own fields.
 *
 * Split out of the big conditional above because it's the only step that has
 * to fetch something before it can render — the template list, which is
 * whatever the operator has in the editor plus the five built-ins.
 */
function NotifyEmailFields({
  step,
  onConfigChange,
}: {
  readonly step: WorkflowStep;
  readonly onConfigChange: (id: string, key: string, value: string) => void;
}) {
  const t = useT();
  const [templates, setTemplates] = useState<ReadonlyArray<{ id: string; label: string }>>([]);

  useEffect(() => {
    let live = true;
    fetch("/api/email-templates")
      .then((response) => (response.ok ? response.json() : { templates: [] }))
      .then((data: { templates?: Array<{ id: string; label: string }> }) => {
        if (live) setTemplates(data.templates ?? []);
      })
      // A failed list leaves the select empty; the rest of the step still works.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const templateId = step.config.emailTemplate ?? "";

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span className="text-[13px] font-medium text-muted-foreground">{t("automations.emailToLabel")}</span>
        <Input
          onChange={(e) => onConfigChange(step.id, "emailTo", e.target.value)}
          placeholder={t("automations.emailToPlaceholder")}
          value={step.config.emailTo ?? step.config.phone ?? ""}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-[13px] font-medium text-muted-foreground">{t("automations.emailSubjectLabel")}</span>
        <Input
          onChange={(e) => onConfigChange(step.id, "emailSubject", e.target.value)}
          placeholder={t("automations.emailSubjectPlaceholder")}
          value={step.config.emailSubject ?? ""}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-[13px] font-medium text-muted-foreground">{t("automations.emailTemplateLabel")}</span>
        <Select
          value={templateId || PLAIN_TEXT_TEMPLATE}
          onValueChange={(value) =>
            onConfigChange(step.id, "emailTemplate", value === PLAIN_TEXT_TEMPLATE ? "" : value)
          }
        >
          <SelectTrigger
            aria-label={t("automations.emailTemplateLabel")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PLAIN_TEXT_TEMPLATE}>{t("automations.emailTemplateNone")}</SelectItem>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {templateId ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("automations.emailTemplateHelp")}{" "}
          <Link href="/email-templates" className="underline underline-offset-2 hover:text-foreground">
            {t("automations.emailTemplateLink")}
          </Link>
        </p>
      ) : (
        <label className="block space-y-1 text-sm">
          <span className="text-[13px] font-medium text-muted-foreground">{t("automations.messageToSend")}</span>
          <Textarea
            onChange={(e) => onConfigChange(step.id, "message", e.target.value)}
            placeholder={t("automations.messagePlaceholder")}
            rows={3}
            value={step.config.message ?? ""}
          />
        </label>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">{t("automations.emailHelp")}</p>
    </div>
  );
}
