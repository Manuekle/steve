"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  MailSend01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export type EmailProvider = {
  readonly resend: boolean;
  readonly smtp: boolean;
  readonly from: string;
  /** Resend's sandbox sender, which only delivers to the account owner. */
  readonly sandbox: boolean;
};

type TestSendProps = {
  readonly templateId: string;
  /** The buffer, so a test sends what's on screen rather than what's saved. */
  readonly source: string | null;
  readonly variables: Record<string, unknown>;
  readonly subject: string;
  readonly provider: EmailProvider | null;
};

type Result =
  | { readonly ok: true; readonly via?: string; readonly sandbox?: boolean }
  | { readonly ok: false; readonly error: string };

export function TestSend({ templateId, source, variables, subject, provider }: TestSendProps) {
  const t = useT();
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const configured = Boolean(provider?.resend || provider?.smtp);

  const handleSend = async () => {
    if (!to.trim() || sending) return;
    setSending(true);
    setResult(null);
    try {
      const response = await fetch(`/api/email-templates/${templateId}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject, source, variables }),
      });
      const data = await response.json();
      setResult(
        response.ok
          ? { ok: true, via: data.via, sandbox: data.sandbox }
          : { ok: false, error: data.message ?? data.error ?? t("emailTemplates.testFailed") },
      );
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : t("emailTemplates.testFailed"),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {t("emailTemplates.testHint")}
      </p>

      {!configured ? (
        <Notice tone="warning">
          {t("emailTemplates.noProvider")}{" "}
          <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
            {t("emailTemplates.noProviderLink")}
          </Link>
        </Notice>
      ) : provider?.sandbox ? (
        <Notice tone="warning">{t("emailTemplates.sandboxWarning")}</Notice>
      ) : null}

      <label className="block space-y-1">
        <span className="text-[13px] font-medium text-muted-foreground">
          {t("emailTemplates.testTo")}
        </span>
        <Input
          type="email"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleSend();
          }}
          placeholder="vos@ejemplo.com"
          className="h-8 text-xs"
        />
      </label>

      {configured ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          {t("emailTemplates.testFrom", {
            provider: provider?.resend ? "Resend" : "SMTP",
            from: provider?.from ?? "",
          })}
        </p>
      ) : null}

      <Button
        size="sm"
        className="h-8 w-full"
        disabled={sending || !to.trim() || !configured}
        onClick={() => void handleSend()}
      >
        <HugeiconsIcon
          icon={sending ? Loading03Icon : MailSend01Icon}
          size={14}
          strokeWidth={1.75}
          className={cn(sending && "animate-spin")}
        />
        {sending ? t("emailTemplates.testSending") : t("emailTemplates.sendTest")}
      </Button>

      {result ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[12px] leading-snug",
            result.ok
              ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/25 bg-destructive/5 text-destructive",
          )}
        >
          <HugeiconsIcon
            icon={result.ok ? CheckmarkCircle02Icon : AlertCircleIcon}
            size={14}
            strokeWidth={1.75}
            className="mt-px shrink-0"
          />
          <span className="min-w-0">
            {result.ok
              ? t("emailTemplates.testSent", { via: result.via ?? "" })
              : result.error}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  readonly tone: "warning";
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg border px-2.5 py-2 text-[12px] leading-snug",
        tone === "warning" && "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <HugeiconsIcon
        icon={AlertCircleIcon}
        size={14}
        strokeWidth={1.75}
        className="mt-px shrink-0 text-muted-foreground"
      />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
