"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  MessageCircleIcon,
  ArtificialIntelligence08Icon,
  MessengerIcon,
  InstagramIcon,
  Loading03Icon,
  AlertCircleIcon,
  Cancel01Icon,
  GoogleSheetIcon,
  StripeIcon,
  VolumeHighIcon,
  CallIcon,
  DatabaseIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, SettingsSkeleton } from "@/components/ai-elements/skeleton";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { useSound } from "@/components/sound-provider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LiquidSlider } from "@/components/ui/liquid-slider";
import { type CredentialGroup } from "@/lib/credentials";
import { ModelHealthCard } from "@/components/ai-elements/model-health-card";
import { LicenseCard } from "@/components/ai-elements/license-card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useModelCatalog } from "@/components/ai-elements/model-picker";
import { ProviderLogo } from "@/components/provider-logo";
import { DEFAULT_MODELS, recommendedIds, type AiProvider } from "@/lib/model-catalog";
import { AppShell } from "../_components/app-shell";
import { PageContainer } from "../_components/page-container";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator } from "../_components/dashboard-card";

type CredentialStatus = Record<string, boolean>;

/** Sentinel for "no explicit model" — Radix Select has no empty-string value,
 *  and an empty AI_MODEL is exactly what "use the provider default" means. */
const AUTO_MODEL = "__auto__";
type ButtonPhase = "idle" | "saving" | "saved";

// Translation overrides for credential groups/fields when locale is set.
const FIELD_I18N: Record<string, { label?: string; help?: string }> = {
  AI_PROVIDER: { label: "settings.field.aiProvider", help: "settings.help.aiProvider" },
  AI_MODEL: { label: "settings.field.aiModel", help: "settings.help.aiModel" },
  AI_GATEWAY_API_KEY: { label: "settings.field.gatewayApiKey", help: "settings.help.gatewayApiKey" },
  OPENAI_API_KEY: { label: "settings.field.openaiApiKey", help: "settings.help.openaiApiKey" },
  ANTHROPIC_API_KEY: { label: "settings.field.anthropicApiKey", help: "settings.help.anthropicApiKey" },
  WHATSAPP_ACCESS_TOKEN: { label: "settings.field.accessToken", help: "settings.help.permanentToken" },
  WHATSAPP_APP_SECRET: { label: "settings.field.appSecret", help: "settings.help.appSecret" },
  WHATSAPP_PHONE_NUMBER_ID: { label: "settings.field.phoneNumberId", help: "settings.help.phoneNumberId" },
  WHATSAPP_VERIFY_TOKEN: { label: "settings.field.webhookVerifyToken", help: "settings.help.webhookVerify" },
  WHATSAPP_TEMPLATE_NAME: { label: "settings.field.templateName", help: "settings.help.templateName" },
  WHATSAPP_TEMPLATE_LANG: { label: "settings.field.templateLang", help: "settings.help.templateLang" },
  FACEBOOK_APP_SECRET: { label: "settings.field.appSecret", help: "settings.help.appSecret" },
  FACEBOOK_PAGE_ACCESS_TOKEN: { label: "settings.field.pageAccessToken", help: "settings.help.pageAccessToken" },
  FACEBOOK_VERIFY_TOKEN: { label: "settings.field.webhookVerifyToken", help: "settings.help.webhookVerify" },
  INSTAGRAM_APP_SECRET: { label: "settings.field.appSecret", help: "settings.help.appSecret" },
  INSTAGRAM_ACCESS_TOKEN: { label: "settings.field.accessToken", help: "settings.help.instagramAccessToken" },
  INSTAGRAM_ACCOUNT_ID: { label: "settings.field.instagramAccountId", help: "settings.help.instagramAccountId" },
  INSTAGRAM_VERIFY_TOKEN: { label: "settings.field.webhookVerifyToken", help: "settings.help.webhookVerify" },
  HTTP_ALLOWLIST: { label: "settings.field.httpAllowlist", help: "settings.help.httpAllowlist" },
  LEAD_WEBHOOK_SECRET: { label: "settings.field.leadWebhookSecret", help: "settings.help.leadWebhookSecret" },
  GOOGLE_SERVICE_ACCOUNT_JSON: { label: "settings.field.googleServiceAccountJson", help: "settings.help.googleServiceAccountJson" },
  STRIPE_SECRET_KEY: { label: "settings.field.stripeSecretKey", help: "settings.help.stripeSecretKey" },
  ELEVENLABS_API_KEY: { label: "settings.field.elevenlabsApiKey", help: "settings.help.elevenlabsApiKey" },
  ELEVENLABS_VOICE_ID: { label: "settings.field.elevenlabsVoiceId", help: "settings.help.elevenlabsVoiceId" },
  ELEVENLABS_MODEL_ID: { label: "settings.field.elevenlabsModelId", help: "settings.help.elevenlabsModelId" },
  TWILIO_ACCOUNT_SID: { label: "settings.field.twilioSid", help: "settings.help.twilioSid" },
  TWILIO_AUTH_TOKEN: { label: "settings.field.twilioToken", help: "settings.help.twilioToken" },
  TWILIO_PHONE_NUMBER: { label: "settings.field.twilioNumber", help: "settings.help.twilioNumber" },
  WORKFLOW_POSTGRES_URL: { label: "settings.field.postgresUrl", help: "settings.help.postgresUrl" },
  POSTGRES_USER: { label: "settings.field.postgresUser", help: "settings.help.postgresUser" },
  POSTGRES_PASSWORD: { label: "settings.field.postgresPassword", help: "settings.help.postgresPassword" },
  POSTGRES_DB: { label: "settings.field.postgresDb" },
  POSTGRES_HOST_PORT: { label: "settings.field.postgresPort", help: "settings.help.postgresPort" },
};

const GROUP_I18N: Record<string, { label?: string; desc?: string }> = {
  "ai-provider": { label: "settings.group.aiProvider", desc: "settings.group.aiProviderDesc" },
  "database": { label: "settings.group.database", desc: "settings.group.databaseDesc" },
  "whatsapp": { label: "settings.group.whatsapp", desc: "settings.group.whatsappDesc" },
  "messenger": { label: "settings.group.messenger", desc: "settings.group.messengerDesc" },
  "instagram": { label: "settings.group.instagram", desc: "settings.group.instagramDesc" },
  "integrations": { label: "settings.group.integrations", desc: "settings.group.integrationsDesc" },
  "google-sheets": { label: "settings.group.googleSheets", desc: "settings.group.googleSheetsDesc" },
  "stripe": { label: "settings.group.stripe", desc: "settings.group.stripeDesc" },
  "elevenlabs": { label: "settings.group.elevenlabs", desc: "settings.group.elevenlabsDesc" },
  "twilio": { label: "settings.group.twilio", desc: "settings.group.twilioDesc" },
};

/** Select options whose label is prose rather than a vendor name, so it has
 *  to follow the language toggle like every other string on the page. */
const OPTION_I18N: Record<string, string> = {
  eleven_multilingual_v2: "settings.option.elevenMultilingualV2",
  eleven_v3: "settings.option.elevenV3",
  eleven_v3_conversational: "settings.option.elevenV3Conversational",
  eleven_flash_v2_5: "settings.option.elevenFlashV25",
  eleven_turbo_v2_5: "settings.option.elevenTurboV25",
};

const GROUP_ICONS: Record<string, IconSvgElement> = {
  "ai-provider": ArtificialIntelligence08Icon,
  database: DatabaseIcon,
  whatsapp: MessageCircleIcon,
  messenger: MessengerIcon,
  instagram: InstagramIcon,
  integrations: KeyRoundIcon,
  "google-sheets": GoogleSheetIcon,
  stripe: StripeIcon,
  elevenlabs: VolumeHighIcon,
  twilio: CallIcon,
};

/** Dictionary keys, not literals — the message is resolved at validation
 *  time so it follows the language toggle like the rest of the form. */
const VALIDATION_ERROR_KEYS: Record<string, string> = {
  AI_GATEWAY_API_KEY: "settings.validate.vckPrefix",
  OPENAI_API_KEY: "settings.validate.skPrefix",
  ANTHROPIC_API_KEY: "settings.validate.skAntPrefix",
  AI_MODEL: "settings.validate.modelId",
  WORKFLOW_POSTGRES_URL: "settings.validate.postgresUrl",
  POSTGRES_USER: "settings.validate.alnumDashUnderscore",
  POSTGRES_PASSWORD: "settings.validate.min8",
  POSTGRES_DB: "settings.validate.alnumDashUnderscore",
  POSTGRES_HOST_PORT: "settings.validate.digitsOnly",
  WHATSAPP_ACCESS_TOKEN: "settings.validate.alnumDashUnderscore",
  WHATSAPP_APP_SECRET: "settings.validate.alnum",
  WHATSAPP_PHONE_NUMBER_ID: "settings.validate.digits10to20",
  WHATSAPP_VERIFY_TOKEN: "settings.validate.min8",
  WHATSAPP_TEMPLATE_NAME: "settings.validate.lowerAlnumUnderscore",
  WHATSAPP_TEMPLATE_LANG: "settings.validate.langFormat",
  FACEBOOK_APP_SECRET: "settings.validate.alnum",
  FACEBOOK_PAGE_ACCESS_TOKEN: "settings.validate.alnumDashUnderscore",
  FACEBOOK_VERIFY_TOKEN: "settings.validate.min8",
  INSTAGRAM_APP_SECRET: "settings.validate.alnum",
  INSTAGRAM_ACCESS_TOKEN: "settings.validate.alnumDashUnderscore",
  INSTAGRAM_ACCOUNT_ID: "settings.validate.digitsOnly",
  INSTAGRAM_VERIFY_TOKEN: "settings.validate.min8",
  HTTP_ALLOWLIST: "settings.validate.domainsCsv",
  LEAD_WEBHOOK_SECRET: "settings.validate.min8",
  ELEVENLABS_API_KEY: "settings.validate.alnumDashUnderscore",
  ELEVENLABS_VOICE_ID: "settings.validate.alnum",
  TWILIO_ACCOUNT_SID: "settings.validate.twilioSid",
  TWILIO_AUTH_TOKEN: "settings.validate.alnum",
  TWILIO_PHONE_NUMBER: "settings.validate.e164",
};

/** What GET and POST /api/settings both answer with. */
type SettingsResponse = {
  readonly groups?: CredentialGroup[];
  readonly credentials?: Record<string, boolean>;
  readonly values?: Record<string, string>;
};

export default function SettingsPage() {
  const t = useT();
  const [groups, setGroups] = useState<CredentialGroup[]>([]);
  const [status, setStatus] = useState<CredentialStatus>({});
  const [values, setValues] = useState<Record<string, string>>({});
  // Snapshot of what's actually been persisted this session, keyed by field.
  // Lets the input keep showing what you typed after a save (the server
  // never echoes secrets back) while still knowing when there's nothing new
  // to submit.
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [buttonPhase, setButtonPhase] = useState<ButtonPhase>("idle");
  const buttonLabelRef = useRef<HTMLSpanElement>(null);
  const buttonIconRef = useRef<HTMLSpanElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shakingFields, setShakingFields] = useState<Set<string>>(new Set());
  const shakeTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const loadSettings = useCallback(() => {
    return fetchJson<SettingsResponse>("/api/settings", t)
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const data = result.data;
        setGroups(data.groups ?? []);
        setStatus(data.credentials ?? {});
        const stored = data.values ?? {};
        setValues((prev) => ({ ...stored, ...prev }));
        setSavedValues((prev) => ({ ...stored, ...prev }));
        setError(null);
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const validateField = useCallback((key: string, value: string, pattern?: string): string | null => {
    if (!value) return null;
    if (pattern) {
      try {
        const regex = new RegExp(pattern);
        if (!regex.test(value)) {
          return t(VALIDATION_ERROR_KEYS[key] ?? "settings.validate.generic");
        }
      } catch { /* skip */ }
    }
    return null;
  }, [t]);

  const triggerShake = useCallback((key: string) => {
    const existing = shakeTimeouts.current.get(key);
    if (existing) clearTimeout(existing);
    setShakingFields((prev) => new Set(prev).add(key));
    const timeout = setTimeout(() => {
      setShakingFields((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      shakeTimeouts.current.delete(key);
    }, 300);
    shakeTimeouts.current.set(key, timeout);
  }, []);

  const validateAll = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    let hasError = false;
    for (const group of groups) {
      for (const field of group.fields) {
        const value = values[field.key];
        if (value) {
          const err = validateField(field.key, value, field.pattern);
          if (err) {
            errors[field.key] = err;
            hasError = true;
            triggerShake(field.key);
          }
        }
      }
    }
    setFieldErrors(errors);
    return !hasError;
  }, [groups, values, validateField, triggerShake]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = values;
    if (Object.keys(payload).length === 0) return;
    if (!validateAll()) return;

    setSaving(true);
    setSaved(false);
    setError(null);

    const result = await fetchJson<SettingsResponse>("/api/settings", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (result.ok) {
      setStatus(result.data.credentials ?? {});
      setSavedValues((prev) => ({ ...prev, ...payload }));
      setFieldErrors({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      // Says which credential the server rejected, instead of one flat
      // "couldn't save" for every possible cause.
      setError(result.error);
    }
    setSaving(false);
  };

  // Drive button text-swap animation via phases
  useEffect(() => {
    if (savedTimer.current) clearTimeout(savedTimer.current);

    if (saving) {
      setButtonPhase("saving");
    } else if (saved) {
      setButtonPhase("saved");
      savedTimer.current = setTimeout(() => setButtonPhase("idle"), 3000);
    } else {
      setButtonPhase("idle");
    }
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current); };
  }, [saving, saved]);

  // Animate button text swap when phase changes
  const prevPhase = useRef<ButtonPhase>("idle");
  useEffect(() => {
    if (prevPhase.current === buttonPhase) return;
    prevPhase.current = buttonPhase;
    const label = buttonLabelRef.current;
    const icon = buttonIconRef.current;
    if (!label || !icon) return;

    // Phase 1: exit old text
    label.classList.add("is-exit");
    icon.classList.add("is-exit");

    const dur = 260; // matches --text-swap-dur
    const swapTimeout = setTimeout(() => {
      label.classList.remove("is-exit");
      icon.classList.remove("is-exit");
      label.classList.add("is-enter-start");
      icon.classList.add("is-enter-start");
      // Force reflow
      void label.offsetHeight;
      label.classList.remove("is-enter-start");
      icon.classList.remove("is-enter-start");
    }, dur);

    return () => clearTimeout(swapTimeout);
  }, [buttonPhase]);

  const handleChange = (key: string, value: string, pattern?: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    if (value) {
      const err = validateField(key, value, pattern);
      if (err) {
        setFieldErrors((prev) => ({ ...prev, [key]: err }));
        triggerShake(key);
      }
    }
  };

  // Clear a configured field — sets empty string value so it gets deleted on save
  const handleClearField = (key: string) => {
    setValues((prev) => ({ ...prev, [key]: "" }));
  };

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // The provider select drives which API-key fields are worth showing.
  // Unset means the Gateway, matching resolveProvider()'s own default.
  const activeProvider = values.AI_PROVIDER && values.AI_PROVIDER.length > 0
    ? values.AI_PROVIDER
    : "gateway";

  // The catalog follows the select, not the saved value: picking "Anthropic"
  // should list Anthropic's models before the choice is ever saved. With no
  // usable key yet the fetch comes back empty, and the curated ids stand in so
  // the field is never a dead dropdown.
  const { data: modelCatalog } = useModelCatalog(activeProvider);

  const modelOptions = useMemo(() => {
    const curated = recommendedIds(activeProvider as AiProvider);
    const live = modelCatalog?.models ?? [];

    // Only the models this app vouches for. The Gateway serves 200-plus
    // entries across every vendor, and a plain dropdown that long buries the
    // handful of sensible answers. Anything exotic is still reachable
    // per-conversation through the chat's searchable picker.
    if (live.length > 0) {
      return live
        .filter((model) => curated.has(model.id) && !model.restrictedReason)
        .map((model) => ({ id: model.id, vendor: model.vendor }));
    }

    // No usable key for this provider yet — the curated ids stand in so the
    // field is never a dead dropdown.
    return [...curated].map((id) => ({
      id,
      vendor: id.includes("/") ? id.split("/")[0] : (activeProvider as string),
    }));
  }, [modelCatalog, activeProvider]);

  // Whatever is already saved stays selectable even when the catalog no longer
  // lists it — otherwise opening Settings would silently drop a working value.
  const modelChoices = useMemo(() => {
    const current = values.AI_MODEL;
    if (!current || modelOptions.some((option) => option.id === current)) return modelOptions;
    return [
      { id: current, vendor: current.includes("/") ? current.split("/")[0] : activeProvider },
      ...modelOptions,
    ];
  }, [modelOptions, values.AI_MODEL, activeProvider]);

  const visibleFields = useCallback(
    (group: CredentialGroup) =>
      group.fields.filter(
        (field) => !field.showWhenProvider || field.showWhenProvider.includes(activeProvider),
      ),
    [activeProvider],
  );

  const totalFields = useMemo(
    () => groups.reduce((sum, g) => sum + visibleFields(g).length, 0),
    [groups, visibleFields],
  );
  const configuredFields = useMemo(
    () =>
      groups.reduce(
        (sum, g) => sum + visibleFields(g).filter((f) => status[f.key]).length,
        0,
      ),
    [groups, status, visibleFields],
  );

  // A field is "dirty" (has an unsaved edit worth submitting) when its
  // current value differs from what's actually been persisted — clearing an
  // unconfigured field, or retyping exactly what's already saved, isn't.
  const isDirty = useCallback(
    (key: string): boolean => {
      const value = values[key];
      if (value === undefined) return false;
      if (value === "") return Boolean(status[key]);
      return value !== (savedValues[key] ?? "");
    },
    [values, status, savedValues],
  );
  const dirtyKeys = useMemo(
    () => new Set(Object.keys(values).filter(isDirty)),
    [values, isDirty],
  );
  // Button should be enabled only while there's an actual unsaved edit
  const canSubmit = dirtyKeys.size > 0;

  // Clear all configured fields at once
  const handleClearAll = () => {
    const clears: Record<string, string> = {};
    for (const group of groups) {
      for (const field of group.fields) {
        if (status[field.key]) {
          clears[field.key] = "";
        }
      }
    }
    setValues(clears);
  };

  return (
    <AppShell activePath="/settings">
      <PageContainer maxWidth="max-w-6xl" pattern="grid">
          <Skeleton
            className="min-h-[600px]"
            isLoading={loading}
            skeleton={<SettingsSkeleton />}
          >
          <div className="content-enter">
          {/* Header */}
          <header className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("settings.subtitle")}
              </p>
            </div>
            {totalFields > 0 ? (
              <div className="hidden items-center gap-2 sm:inline-flex">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={CheckIcon} size={16} strokeWidth={1.75} className="text-muted-foreground" />
                  <span className="tabular-nums">{configuredFields}/{totalFields}</span>
                </div>
                {configuredFields > 0 && !canSubmit ? (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-[var(--shadow-inset)] transition-colors hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
                    Limpiar todo
                  </button>
                ) : null}
              </div>
            ) : null}
          </header>

          <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />

          {/* Bento grid. Multi-column rather than a CSS grid: the groups run
              from 1 field to 6, and grid rows stretch every card to the
              tallest in the row — which is where the big empty blocks under
              the short cards came from. Columns pack by height instead, so
              each card is exactly as tall as its own contents. */}
          {!loading ? (
          <form onSubmit={handleSubmit}>
            <div className="gap-4 lg:columns-2">
              {/* Interface sounds saves itself — it's in the form's markup
                  only so it shares the column flow and sits at one card's
                  width instead of stretching across the whole page. The
                  switch is a `type="button"`, and the slider has no name, so
                  neither reaches the credentials submit. */}
              <SoundSettings />
              {/* Sits beside the credential cards: it answers "is that key
                  working" for the keys the card above it collects. */}
              <ModelHealthCard />
              {/* Enterprise license status — self-contained, same reason as
                  the two cards above: it saves itself, so it only needs to
                  share the column flow, not the credentials form. */}
              <LicenseCard />
              {groups.map((group) => {
                const Icon = GROUP_ICONS[group.id] ?? KeyRoundIcon;
                const groupFields = visibleFields(group);
                const groupConfigured = groupFields.filter(
                  (f) => status[f.key],
                ).length;
                const gi = GROUP_I18N[group.id];
                const groupLabel = gi?.label ? t(gi.label) : group.label;
                const groupDesc = gi?.desc ? t(gi.desc) : group.description;

                return (
                  <Card key={group.id} className="mb-4 break-inside-avoid">
                    <CardHeader>
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                        <HugeiconsIcon icon={Icon} size={16} strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle>{groupLabel}</CardTitle>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {groupConfigured}/{groupFields.length}
                          </span>
                        </div>
                        <CardDescription>{groupDesc}</CardDescription>
                      </div>
                    </CardHeader>

                    <CardSeparator />

                    <div className="space-y-4 px-5 py-4">
                      {groupFields.map((field) => {
                        const isSet = status[field.key];
                        const show = showSecrets[field.key];
                        const fi = FIELD_I18N[field.key];
                        const fieldLabel = fi?.label ? t(fi.label) : field.label;
                        const fieldHelp = fi?.help ? t(fi.help) : field.help;
                        const fieldError = fieldErrors[field.key];
                        const isShaking = shakingFields.has(field.key);
                        // A pending (unsaved) clear always displays as not-set;
                        // otherwise trust the server-confirmed status, so a
                        // freshly saved value shows "Configurado" right away
                        // without wiping what's still sitting in the input.
                        const displaySet = values[field.key] === "" ? false : isSet;
                        // Keep showing whatever the user typed/saved this
                        // session — the server never echoes secrets back, so
                        // this local copy is the only place it's visible.
                        const inputValue = values[field.key] ?? "";

                        return (
                          <div key={field.key} className={cn("t-input-wrap", fieldError && "is-error")}>
                            <div className="mb-2 flex items-center justify-between">
                              <label
                                className="flex items-center gap-1 text-sm font-medium"
                                htmlFor={field.key}
                              >
                                {fieldLabel}
                                {field.required ? (
                                  <span className="text-destructive">*</span>
                                ) : null}
                              </label>
                              <div className="flex items-center gap-2">
                                {field.type !== "select" && field.key !== "AI_MODEL" && !displaySet ? (
                                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
                                    <span className="size-1.5 rounded-full bg-muted-foreground/30" />
                                    {t("settings.notSet")}
                                  </span>
                                ) : null}
                                {/* Clear button — only for fields currently reading as configured */}
                                {field.type !== "select" && field.key !== "AI_MODEL" && displaySet ? (
                                  <button
                                    type="button"
                                    onClick={() => handleClearField(field.key)}
                                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                    title={t("settings.clearField")}
                                  >
                                    <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.75} />
                                    {t("settings.clearField")}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {field.key === "AI_MODEL" ? (
                              <Select
                                value={inputValue || AUTO_MODEL}
                                onValueChange={(next) =>
                                  handleChange(field.key, next === AUTO_MODEL ? "" : next)
                                }
                              >
                                <SelectTrigger id={field.key} className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={AUTO_MODEL}>
                                    <span className="flex items-center gap-2">
                                      <HugeiconsIcon icon={ArtificialIntelligence08Icon} size={15} strokeWidth={1.75} />
                                      {t("settings.modelDefault", {
                                        model: DEFAULT_MODELS[activeProvider as AiProvider],
                                      })}
                                    </span>
                                  </SelectItem>
                                  {modelChoices.map((option) => (
                                    <SelectItem key={option.id} value={option.id}>
                                      <span className="flex items-center gap-2">
                                        <ProviderLogo vendor={option.vendor} size={15} />
                                        {option.id}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : field.type === "select" ? (
                              <Select
                                value={inputValue || field.options?.[0]?.value || ""}
                                onValueChange={(next) => {
                                  handleChange(field.key, next);
                                  // A gateway id means nothing to the direct
                                  // Anthropic API, so the model resets with
                                  // the provider rather than carrying over.
                                  if (field.key === "AI_PROVIDER") handleChange("AI_MODEL", "");
                                }}
                              >
                                <SelectTrigger id={field.key} className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {field.options?.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      <span className="flex items-center gap-2">
                                        {field.key === "AI_PROVIDER" ? (
                                          <ProviderLogo vendor={option.value} size={15} />
                                        ) : null}
                                        {OPTION_I18N[option.value]
                                          ? t(OPTION_I18N[option.value])
                                          : option.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                            <div className={cn("t-input relative", fieldError && "is-error", isShaking && "is-shaking")}>
                              <Input
                                id={field.key}
                                name={field.key}
                                type={
                                  field.type === "password" && !show
                                    ? "password"
                                    : "text"
                                }
                                placeholder={field.placeholder ?? ""}
                                value={inputValue}
                                onChange={(e) =>
                                  handleChange(field.key, e.target.value, field.pattern)
                                }
                                autoComplete="one-time-code"
                                data-1p-ignore="true"
                                data-lpignore="true"
                                className={cn(field.type === "password" && "pr-9", fieldError && "border-destructive")}
                              />
                              {field.type === "password" ? (
                                <button
                                  type="button"
                                  onClick={() => toggleSecret(field.key)}
                                  className="absolute top-1/2 right-3 -translate-y-1/2 inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                                  title={show ? t("settings.hide") : t("settings.show")}
                                >
                                  <span className="t-icon-swap" data-state={show ? "b" : "a"}>
                                    <span className="t-icon" data-icon="a">
                                      <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.75} />
                                    </span>
                                    <span className="t-icon" data-icon="b">
                                      <HugeiconsIcon icon={EyeOffIcon} size={16} strokeWidth={1.75} />
                                    </span>
                                  </span>
                                </button>
                              ) : null}
                            </div>
                            )}
                            {fieldError ? (
                              <p className="t-error-msg mt-1.5 text-xs text-destructive">
                                {fieldError}
                              </p>
                            ) : fieldHelp ? (
                              <p className="mt-1.5 text-xs text-muted-foreground">
                                {fieldHelp}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Save bar */}
            <div className="mt-6 flex items-center gap-3">
              <Button
                type="submit"
                disabled={saving || !canSubmit}
              >
                {/* Idle has no icon, and an empty span still eats the button's
                    gap. `hidden` can't do it: `.t-text-swap` sets
                    `display: inline-block` from the stylesheet and wins over
                    the utility class, so the display is set inline instead. */}
                <span
                  ref={buttonIconRef}
                  className="t-text-swap"
                  style={{ display: buttonPhase === "idle" ? "none" : "inline-block" }}
                >
                  {buttonPhase === "saving" ? (
                    <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={1.75} className="animate-spin" />
                  ) : buttonPhase === "saved" ? (
                    <HugeiconsIcon icon={CheckIcon} size={16} strokeWidth={1.75} />
                  ) : null}
                </span>
                <span ref={buttonLabelRef} className="t-text-swap">
                  {buttonPhase === "saving"
                    ? t("settings.saving")
                    : buttonPhase === "saved"
                      ? t("settings.saved")
                      : t("settings.saveChanges")}
                </span>
              </Button>
            </div>
          </form>
          ) : null}

          {/* Footer */}
          {!loading ? (
            <div className="mt-10">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("settings.footerText", { path: "~/.steve/credentials.json" })}
              </p>
              {totalFields > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground/60">
                  {t("settings.credentialsConfigured", { configured: configuredFields, total: totalFields })}
                </p>
              ) : null}
            </div>
          ) : null}
          </div>
          </Skeleton>
      </PageContainer>
    </AppShell>
  );
}

/** Mute switch plus a volume slider for the cuelume interaction sounds. */
function SoundSettings() {
  const t = useT();
  const { enabled, volume, setEnabled, setVolume } = useSound();
  return (
    <Card className="mb-4 break-inside-avoid">
      <CardHeader>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
          <HugeiconsIcon icon={VolumeHighIcon} size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle>{t("sound.title")}</CardTitle>
          <CardDescription>{t("sound.description")}</CardDescription>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          label={t(enabled ? "sound.turnOff" : "sound.turnOn")}
        />
      </CardHeader>
      <CardSeparator />
      <div className="flex items-center gap-3 px-5 py-3.5">
        <span className="w-16 shrink-0 text-xs text-muted-foreground">{t("sound.volume")}</span>
        <LiquidSlider
          min={0}
          max={1}
          // 1% steps, not 5%: a coarse step teleports the thumb ~15px per
          // tick, and the liquid — which springs after it — separates into a
          // visible second blob before it catches up.
          step={0.01}
          value={volume}
          disabled={!enabled}
          label={t("sound.volume")}
          onValueChange={setVolume}
        />
        <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </Card>
  );
}
