"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import { WhatsappIcon, CheckmarkCircle02Icon, AlertCircleIcon } from "@hugeicons/core-free-icons";
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
import { Input } from "@/components/ui/input";
import { ConnectButton } from "./connect-button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/provider";
import { fetchJson, uiErrorMessage } from "@/lib/api-error-message";
import { notifyCredentialsChanged } from "@/lib/credentials-changed";

// One-click WhatsApp connect through Meta's Embedded Signup.
//
// The operator clicks once, a Meta popup handles the business verification
// and the number choice, and the popup's short-lived `code` comes back here.
// The code is traded server-side (the App Secret never leaves the server),
// the WABA is verified and subscribed, and the line lands in the directory.
// What this drawer owns is the pre-flight only: the prerequisites Meta
// rejects on (popups, number access, website), the display-name/website
// prefill, and the popup itself.

type Phase = "form" | "connecting" | "done" | "error";

type EmbeddedConfig = {
  configured?: boolean;
  appId?: string;
  configId?: string;
  version?: string;
  verifyTokenConfigured?: boolean;
};

type EmbeddedResult = {
  ok: boolean;
  e164?: string;
  displayPhoneNumber?: string;
};

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } | null }) => void,
        params: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_URL = "https://connect.facebook.net/en_US/sdk.js";

let sdkPromise: Promise<void> | null = null;

function loadFacebookSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = FB_SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("sdk"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export function WhatsAppConnect({
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
  const [displayName, setDisplayName] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connectedE164, setConnectedE164] = useState<string | null>(null);
  const signupInfo = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  // Meta posts the signup session (waba_id, phone_number_id) as a window
  // message while the popup runs. The login callback only carries the code,
  // so both halves are collected here and joined at POST time.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      ) {
        return;
      }
      const data = event.data as
        | { type?: string; data?: { waba_id?: string; phone_number_id?: string } }
        | null;
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.data?.waba_id) signupInfo.current.wabaId = data.data.waba_id;
      if (data.data?.phone_number_id) signupInfo.current.phoneNumberId = data.data.phone_number_id;
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    setPhase("form");
    setError(null);
    setConnectedE164(null);
    signupInfo.current = {};
    void fetchJson<EmbeddedConfig>("/api/channels/whatsapp/embedded", t).then((result) => {
      if (result.ok) setConfig(result.data);
    });
  }, [open, t]);

  const waitForWabaId = useCallback(async (): Promise<string | undefined> => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (signupInfo.current.wabaId) return signupInfo.current.wabaId;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return signupInfo.current.wabaId;
  }, []);

  const connect = useCallback(async () => {
    if (!config?.appId || !config?.configId) return;
    setPhase("connecting");
    setError(null);
    try {
      await loadFacebookSdk();
      window.FB?.init({
        appId: config.appId,
        autoLogAppEvents: false,
        xfbml: false,
        version: config.version ?? "v25.0",
      });
    } catch {
      setError(t("numbers.metaSdkFailed"));
      setPhase("error");
      return;
    }

    const code = await new Promise<string | null>((resolve) => {
      try {
        window.FB?.login(
          (response) => resolve(response?.authResponse?.code ?? null),
          {
            config_id: config.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: {
              setup: {
                ...(displayName.trim() ? { business: { name: displayName.trim() } } : {}),
                ...(website.trim() ? { website: website.trim() } : {}),
              },
              sessionInfoVersion: 2,
            },
          },
        );
      } catch {
        resolve(null);
      }
    });

    if (!code) {
      // Null means the popup was closed, blocked, or denied — all three share
      // one recovery: allow popups and try again.
      setError(t("numbers.metaPopupBlocked"));
      setPhase("error");
      return;
    }

    const wabaId = await waitForWabaId();
    if (!wabaId) {
      setError(t("numbers.metaNoWaba"));
      setPhase("error");
      return;
    }

    const result = await fetchJson<EmbeddedResult>("/api/channels/whatsapp/embedded", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        wabaId,
        ...(signupInfo.current.phoneNumberId
          ? { phoneNumberId: signupInfo.current.phoneNumberId }
          : {}),
        ...(displayName.trim() ? { label: displayName.trim() } : {}),
      }),
    });
    if (!result.ok) {
      setError(uiErrorMessage(t, result.error));
      setPhase("error");
      return;
    }
    setConnectedE164(result.data.e164 ?? result.data.displayPhoneNumber ?? null);
    setPhase("done");
    notifyCredentialsChanged();
    onConnected();
  }, [config, displayName, website, onConnected, t, waitForWabaId]);

  const configured = config?.configured ?? true;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-2xl">
        <DrawerHeader>
          <DrawerTitle icon={<HugeiconsIcon icon={WhatsappIcon} size={18} strokeWidth={1.75} />}>
            {t("numbers.metaTitle")}
          </DrawerTitle>
          <DrawerDescription>{t("numbers.metaDescription")}</DrawerDescription>
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
                  {t("numbers.metaDone", { e164: connectedE164 ?? "" })}
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

            {phase !== "done" ? (
              <>
                <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("numbers.metaReqPopup")}</li>
                  <li>{t("numbers.metaReqPhone")}</li>
                  <li>{t("numbers.metaReqFree")}</li>
                  <li>{t("numbers.metaReqWebsite")}</li>
                </ul>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="meta-display-name" className="text-xs font-medium text-foreground">
                      {t("numbers.metaDisplayName")}
                    </label>
                    <Input
                      id="meta-display-name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder={t("numbers.metaDisplayNamePlaceholder")}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="meta-website" className="text-xs font-medium text-foreground">
                      {t("numbers.metaWebsite")}
                    </label>
                    <Input
                      id="meta-website"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      placeholder={t("numbers.metaWebsitePlaceholder")}
                      inputMode="url"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {!configured ? (
                  <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-500">
                    {t("numbers.metaUnconfigured")}{" "}
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
                    {t("numbers.metaVerifyHint")}
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
          {phase === "done" ? null : phase === "connecting" ? (
            <ConnectButton tone="whatsapp" disabled>
              <Spinner size={14} />
              {t("numbers.metaConnecting")}
            </ConnectButton>
          ) : phase === "error" ? (
            <ConnectButton tone="whatsapp" onClick={() => void connect()} disabled={!configured}>
              {t("numbers.metaRetry")}
            </ConnectButton>
          ) : (
            <ConnectButton tone="whatsapp" onClick={() => void connect()} disabled={!configured}>
              {t("numbers.metaConnect")}
            </ConnectButton>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
