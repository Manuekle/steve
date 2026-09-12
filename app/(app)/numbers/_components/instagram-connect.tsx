"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  InstagramIcon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConnectButton } from "./connect-button";
import { useT } from "@/lib/i18n/provider";
import { fetchJson, uiErrorMessage } from "@/lib/api-error-message";
import { notifyCredentialsChanged } from "@/lib/credentials-changed";

// One-click Instagram connect through Business Login for Instagram.
//
// Unlike WhatsApp's Embedded Signup there is no business registration here:
// the popup authorizes the messaging permissions on a professional account,
// Meta redirects to this app's callback with a code, and the callback does
// the rest server-side (short token → 60-day token → account → webhook
// subscription → stored credentials). This drawer owns the pre-flight
// (professional account, login access, registered redirect URI) and the
// popup itself.

type Phase = "form" | "waiting" | "done" | "error";

type EmbeddedConfig = {
  configured?: boolean;
  redirectUri?: string;
  scopes?: string[];
  connected?: boolean;
  verifyTokenConfigured?: boolean;
};

type SignupMessage = {
  type?: string;
  ok?: boolean;
  username?: string;
  message?: string;
};

export function InstagramConnect({
  open,
  onOpenChange,
  onConnected,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConnected: () => void;
}) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("form");
  const [config, setConfig] = useState<EmbeddedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const popup = useRef<Window | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (!open) return;
    settled.current = false;
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as SignupMessage | null;
      if (data?.type !== "IG_EMBEDDED_SIGNUP" || settled.current) return;
      settled.current = true;
      popup.current?.close();
      popup.current = null;
      if (data.ok) {
        setUsername(data.username ?? null);
        setPhase("done");
        setError(null);
        notifyCredentialsChanged();
        onConnected();
      } else {
        setError(data.message ?? t("numbers.igFailed"));
        setPhase("error");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [open, onConnected, t]);

  // The popup closing with no verdict means the login was abandoned, not
  // completed — say so instead of spinning forever.
  useEffect(() => {
    if (!open || phase !== "waiting") return;
    const timer = setInterval(() => {
      if (popup.current?.closed && !settled.current) {
        settled.current = true;
        popup.current = null;
        setError(t("numbers.igCancelled"));
        setPhase("error");
      }
    }, 500);
    return () => clearInterval(timer);
  }, [open, phase, t]);

  useEffect(() => {
    if (!open) return;
    setPhase("form");
    setError(null);
    setUsername(null);
    setCopied(false);
    void fetchJson<EmbeddedConfig>("/api/channels/instagram/embedded", t).then((result) => {
      if (result.ok) setConfig(result.data);
    });
  }, [open, t]);

  const connect = useCallback(async () => {
    setPhase("waiting");
    setError(null);
    settled.current = false;
    const start = await fetchJson<{ url?: string }>(
      "/api/channels/instagram/embedded/start",
      t,
    );
    if (!start.ok || !start.data.url) {
      setError(start.ok ? t("numbers.igFailed") : uiErrorMessage(t, start.error));
      setPhase("error");
      return;
    }
    const win = window.open(start.data.url, "ig_embedded_signup", "width=600,height=700");
    if (!win) {
      setError(t("numbers.igPopupBlocked"));
      setPhase("error");
      return;
    }
    popup.current = win;
  }, [t]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const result = await fetchJson<{ ok: boolean }>(
      "/api/channels/instagram/embedded",
      t,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      },
    );
    setRefreshing(false);
    if (!result.ok) {
      setError(uiErrorMessage(t, result.error));
      setPhase("error");
      return;
    }
    setUsername(null);
    setPhase("done");
    setError(null);
    notifyCredentialsChanged();
    onConnected();
  }, [onConnected, t]);

  const redirectUri = config?.redirectUri;
  const copyRedirect = useCallback(async () => {
    if (!redirectUri) return;
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The URL is on screen either way.
    }
  }, [redirectUri]);

  const configured = config?.configured ?? true;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-2xl">
        <DrawerHeader>
          <DrawerTitle icon={<HugeiconsIcon icon={InstagramIcon} size={18} strokeWidth={1.75} />}>
            {t("numbers.igTitle")}
          </DrawerTitle>
          <DrawerDescription>{t("numbers.igDescription")}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="min-h-0">
          <div className="space-y-4">
            {phase === "done" ? (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 px-5 py-4">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  size={18}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                />
                <p className="text-sm">
                  {username
                    ? t("numbers.igDone", { username })
                    : t("numbers.igRefreshed")}
                </p>
              </div>
            ) : null}

            {phase === "error" && error ? (
              <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/5 px-5 py-4">
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  size={18}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-red-600 dark:text-red-400"
                />
                <p className="text-sm">{error}</p>
              </div>
            ) : null}

            {phase === "waiting" ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 px-5 py-4">
                <Spinner size={16} />
                <p className="text-sm text-muted-foreground">{t("numbers.igWaiting")}</p>
              </div>
            ) : null}

            {phase === "form" || phase === "error" ? (
              <>
                <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("numbers.igReqPro")}</li>
                  <li>{t("numbers.igReqLogin")}</li>
                  <li>{t("numbers.igReqRedirect")}</li>
                </ul>

                {config?.redirectUri ? (
                  <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{t("numbers.igRedirectUri")}</span>
                      <button
                        type="button"
                        onClick={copyRedirect}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <HugeiconsIcon
                          icon={copied ? Tick02Icon : Copy01Icon}
                          size={13}
                          strokeWidth={1.75}
                        />
                        {copied ? t("settings.webhookUrlCopied") : t("settings.webhookUrlCopy")}
                      </button>
                    </div>
                    <code className="block font-mono text-[11px] leading-relaxed break-all text-foreground">
                      {config.redirectUri}
                    </code>
                  </div>
                ) : null}

                {!configured ? (
                  <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-500">
                    {t("numbers.igUnconfigured")}{" "}
                    <Link
                      href="/settings"
                      className="font-medium underline underline-offset-2"
                      onClick={() => onOpenChange(false)}
                    >
                      {t("numbers.metaGoSettings")}
                    </Link>
                  </p>
                ) : null}

                {config?.verifyTokenConfigured === false ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("numbers.igVerifyHint")}
                  </p>
                ) : null}

                {config?.connected ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("numbers.igTokenExpiry")}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {phase === "done" ? t("numbers.metaClose") : t("common.cancel")}
          </Button>
          {phase === "done" ? null : phase === "waiting" ? (
            <ConnectButton tone="instagram" disabled>
              <Spinner size={14} />
              {t("numbers.metaConnecting")}
            </ConnectButton>
          ) : (
            <>
              {config?.connected ? (
                <Button variant="outline" onClick={() => void refresh()} disabled={refreshing || !configured}>
                  {refreshing ? <Spinner size={14} /> : null}
                  {t("numbers.igRefresh")}
                </Button>
              ) : null}
              <ConnectButton tone="instagram" onClick={() => void connect()} disabled={!configured}>
                {phase === "error" ? t("numbers.metaRetry") : t("numbers.igConnect")}
              </ConnectButton>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
