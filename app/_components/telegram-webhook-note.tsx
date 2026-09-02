"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Alert01Icon, CheckmarkCircle02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { useT } from "@/lib/i18n/provider";
import { fetchJson, uiErrorMessage } from "@/lib/api-error-message";

// Telegram's counterpart to WebhookUrlNote.
//
// The difference is why this is a button and not a read-only URL: WhatsApp and
// Instagram are configured by pasting a callback URL into Meta's dashboard,
// while Telegram has no dashboard at all — the callback is registered by
// calling `setWebhook` with the bot token. Left as documentation that step is
// a curl command in a source comment, and skipping it fails silently: every
// credential reads as configured and the bot still receives nothing.
//
// So the state shown here is Telegram's own answer to `getWebhookInfo`, not
// this app's idea of it, including the last delivery error — which is the only
// place a wrong URL ever surfaces.

type WebhookStatus = {
  readonly expectedUrl: string;
  readonly registeredUrl: string | null;
  readonly matches: boolean;
  readonly pendingUpdates: number;
  readonly lastError: string | null;
};

export function TelegramWebhookNote() {
  const t = useT();
  const [status, setStatus] = useState<WebhookStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<WebhookStatus>("/api/channels/telegram/webhook", t);
    // A bot token that isn't saved yet is the normal state of this card while
    // someone is still filling it in, so it stays quiet rather than shouting.
    setStatus(result.ok ? result.data : null);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const register = async () => {
    setBusy(true);
    setError(null);
    const result = await fetchJson<{ registered: boolean }>("/api/channels/telegram/webhook", t, {
      method: "POST",
    });
    if (!result.ok) setError(uiErrorMessage(t, result.error));
    else await load();
    setBusy(false);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{t("settings.telegramWebhook")}</span>
        <button
          type="button"
          onClick={register}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          {busy ? (
            <HugeiconsIcon icon={Loading03Icon} size={13} strokeWidth={1.75} className="animate-spin" />
          ) : null}
          {busy ? t("settings.telegramWebhookRegistering") : t("settings.telegramWebhookRegister")}
        </button>
      </div>

      {status ? (
        <>
          <code className="block font-mono text-[11px] leading-relaxed break-all text-foreground">
            {status.expectedUrl}
          </code>
          <p
            className={`mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed ${
              status.matches ? "text-muted-foreground" : "text-amber-700 dark:text-amber-500"
            }`}
          >
            <HugeiconsIcon
              icon={status.matches ? CheckmarkCircle02Icon : Alert01Icon}
              size={13}
              strokeWidth={1.75}
              className="mt-px shrink-0"
            />
            <span>
              {status.matches
                ? t("settings.telegramWebhookOk")
                : status.registeredUrl
                  ? t("settings.telegramWebhookMismatch")
                  : t("settings.telegramWebhookNone")}
            </span>
          </p>
          {status.lastError ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {t("settings.telegramWebhookLastError")}{" "}
              <span className="font-mono break-all">{status.lastError}</span>
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("settings.telegramWebhookHelp")}
        </p>
      )}

      {error ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
