"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  Coins01Icon,
  LibraryIcon,
  Megaphone01Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CRMS, GOALS, INDUSTRIES, VOLUMES } from "@/lib/onboarding/options";
import { useAppLocale, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Three questions between claiming the instance and using it.
 *
 * Every answer here does something, which is the only reason to ask it. The
 * language switches the app under the reader on the spot; the CRM writes its
 * API host into `HTTP_ALLOWLIST`, so `http_request` can reach it without the
 * owner going to find the hostname; the goals decide what the closing panel
 * puts first. Two are stored and nothing more — the volume and the test phone
 * — and they are marked that way in the store rather than dressed up.
 *
 * It is skippable from every step. An onboarding you cannot leave is a wall,
 * and this one stands between someone and the product they already installed.
 */

const STEPS = 3;

export default function OnboardingPage() {
  const t = useT();
  const router = useRouter();
  const { locale, setLocale } = useAppLocale();

  // Answered or skipped once is answered forever. Reaching this URL again
  // — a bookmark, a back button — should not put the form in front of someone
  // who is already using the product.
  useEffect(() => {
    void fetch("/api/onboarding")
      .then((response) => response.json())
      .then((state: { settled: boolean }) => {
        if (state.settled) router.replace("/dashboard");
      })
      .catch(() => null);
  }, [router]);

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+54");
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);
  const [businessName, setBusinessName] = useState("");

  useEffect(() => {
    fetch("https://api.restcountries.com/v3.1/all?fields=name,idd,cca2")
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        const list = (Array.isArray(data) ? data : [])
          .filter((c: { idd?: { root?: string; suffixes?: string[] } }) => c.idd?.root)
          .map((c: { name: { common: string }; idd: { root: string; suffixes?: string[] } }) => ({
            code: `${c.idd.root}${c.idd.suffixes?.[0] ?? ""}`,
            name: c.name.common,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (list.length > 0) setCountries(list);
      })
      .catch(() => null);
    fetch("https://api.restcountries.com/countries/v5?q=canada", {
      headers: { Authorization: "Bearer rc_live_cb07229394904170b35bafe2d5b1441c" },
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        console.log(data);
      })
      .catch(() => null);
  }, []);
  const [industry, setIndustry] = useState("");
  const [contactVolume, setContactVolume] = useState("");
  const [crm, setCrm] = useState("");
  const [goals, setGoals] = useState<string[]>([]);

  const toggleGoal = (goal: string) =>
    setGoals((current) =>
      current.includes(goal) ? current.filter((g) => g !== goal) : [...current, goal],
    );

  // The feature tour opens on the dashboard, not here — this page is gone by
  // then, and a dialog over a form the reader just finished reads as one more
  // step rather than as arriving. `goals` rides along in the query string so
  // the dashboard can order the tour without a second round trip.
  const finish = async () => {
    setBusy(true);
    const fullPhone = phone.trim() ? (phone.trim().startsWith("+") ? phone.trim() : `${countryCode}${phone.trim().replace(/^0+/, "")}`) : "";
    await fetch("/api/onboarding", {
      body: JSON.stringify({ businessName, contactVolume, crm, goals, industry, phone: fullPhone }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => null);
    const search = new URLSearchParams({ onboarded: "1" });
    if (goals.length > 0) search.set("goals", goals.join(","));
    router.replace(`/dashboard?${search.toString()}`);
    router.refresh();
  };

  const leave = async () => {
    await fetch("/api/onboarding", {
      body: JSON.stringify({ skip: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => null);
    router.replace("/dashboard");
    router.refresh();
  };

  // Each step names what it needs. Nothing is required except the two answers
  // that drive something — a business with no CRM should not be stuck here.
  const canAdvance =
    step === 1 ? true : step === 2 ? businessName.trim().length > 0 && industry !== "" : true;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16">
      <div aria-hidden="true" className="auth-glow" />
      <div aria-hidden="true" className="auth-grid" />

      <div className="relative w-full max-w-[34rem]">
        <p className="text-center font-mono text-[11px] text-muted-foreground/70 uppercase tracking-[0.14em]">
          {t("onboarding.step", { current: String(step), total: String(STEPS) })}
        </p>
        <h1 className="mt-4 text-balance text-center font-cooper text-[2rem] leading-[1.08] tracking-[-0.03em]">
          {t("onboarding.title")}
        </h1>
        <p className="mx-auto mt-3 max-w-[42ch] text-balance text-center text-[15px] leading-relaxed text-muted-foreground">
          {t("onboarding.subtitle")}
        </p>

        {/* A track, not a row of dots: three dots at this size read as an
            ellipsis rather than as progress. */}
        <div className="mx-auto mt-7 flex max-w-[18rem] gap-1.5" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i < step ? "bg-foreground/60" : "bg-muted",
              )}
              key={i}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft),var(--shadow-inset)] sm:p-7">
          {step === 1 ? (
            <>
              <Field label={t("onboarding.language")}>
                {/* Applied on click, not on submit. A language picker that
                    waits until the end of a form is a language picker you
                    cannot tell you got right. */}
                <div className="grid grid-cols-2 gap-2">
                  {(["es", "en"] as const).map((option) => (
                    <Choice
                      key={option}
                      onClick={() => setLocale(option)}
                      selected={locale === option}
                    >
                      {option === "es" ? "Español" : "English"}
                    </Choice>
                  ))}
                </div>
              </Field>

              <Field hint={t("onboarding.phoneHint")} label={t("onboarding.phone")}>
                <div className="flex gap-2">
                  <Select onValueChange={setCountryCode} value={countryCode}>
                    <SelectTrigger className="w-[9rem] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(countries.length > 0
                        ? countries
                        : [
                            { code: "+54", name: "Argentina" },
                            { code: "+52", name: "México" },
                            { code: "+34", name: "España" },
                            { code: "+57", name: "Colombia" },
                            { code: "+56", name: "Chile" },
                            { code: "+51", name: "Perú" },
                            { code: "+1", name: "USA/Canada" },
                          ]
                      ).map((c) => (
                        <SelectItem key={`${c.code}-${c.name}`} value={c.code}>
                          {c.code} {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="tel"
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="11 5555 5555"
                    value={phone}
                    className="flex-1"
                  />
                </div>
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Field label={t("onboarding.business")}>
                <Input
                  autoFocus
                  onChange={(event) => setBusinessName(event.target.value)}
                  value={businessName}
                />
              </Field>

              <Field label={t("onboarding.industry")}>
                <Select onValueChange={setIndustry} value={industry}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("onboarding.choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((id) => (
                      <SelectItem key={id} value={id}>
                        {t(`onboarding.industry.${id}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t("onboarding.volume")}>
                <div className="flex flex-wrap gap-2">
                  {VOLUMES.map((value) => (
                    <Choice
                      key={value}
                      onClick={() => setContactVolume(value)}
                      selected={contactVolume === value}
                    >
                      {value}
                    </Choice>
                  ))}
                </div>
              </Field>

              <Field hint={t("onboarding.crmHint")} label={t("onboarding.crm")}>
                <Select onValueChange={setCrm} value={crm}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("onboarding.choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CRMS.map(({ id }) => (
                      <SelectItem key={id} value={id}>
                        {t(`onboarding.crm.${id}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : null}

          {step === 3 ? (
            <Field hint={t("onboarding.goalsHint")} label={t("onboarding.goals")}>
              <div className="flex flex-col gap-2">
                {GOALS.map((goal) => (
                  <Choice
                    className="justify-start text-left"
                    key={goal}
                    onClick={() => toggleGoal(goal)}
                    selected={goals.includes(goal)}
                  >
                    <HugeiconsIcon
                      className={cn("shrink-0", goals.includes(goal) ? "" : "opacity-40")}
                      icon={GOAL_ICONS[goal]}
                      size={16}
                      strokeWidth={1.75}
                    />
                    {t(`onboarding.goal.${goal}`)}
                  </Choice>
                ))}
              </div>
            </Field>
          ) : null}

          <div className="mt-1 flex items-center gap-3">
            {step > 1 ? (
              <Button onClick={() => setStep(step - 1)} type="button" variant="outline">
                {t("onboarding.back")}
              </Button>
            ) : null}
            <Button
              className="flex-1"
              disabled={!canAdvance || busy}
              onClick={() => (step === STEPS ? void finish() : setStep(step + 1))}
              type="button"
            >
              {step === STEPS ? t("onboarding.finish") : t("onboarding.next")}
              <HugeiconsIcon icon={ArrowRight02Icon} size={15} strokeWidth={2} />
            </Button>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            className="rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
            onClick={() => void leave()}
            type="button"
          >
            {t("onboarding.skip")}
          </button>
        </div>
      </div>
    </main>
  );
}

const GOAL_ICONS: Record<string, IconSvgElement> = {
  ads: Megaphone01Icon,
  automations: ZapIcon,
  commerce: Coins01Icon,
  inbox: CheckmarkCircle02Icon,
  knowledge: LibraryIcon,
};

function Field({
  children,
  hint,
  label,
}: {
  readonly children: React.ReactNode;
  readonly hint?: string;
  readonly label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-sm">{label}</span>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  );
}

/** A pressable option. The app has no radio or checkbox primitive, and a row
 *  of these reads better at this size than either would. */
function Choice({
  children,
  className,
  onClick,
  selected,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly onClick: () => void;
  readonly selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 font-medium text-sm transition-all duration-150",
        selected
          ? "border-input bg-muted text-foreground shadow-[var(--shadow-inset)]"
          : "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
