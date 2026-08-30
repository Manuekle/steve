"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Beam } from "@/components/ui/beam";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Disclosure, Reveal, Shell } from "@/app/landing/_components/primitives";
import { ENTITY } from "@/app/landing/_components/legal-page";
import { MarketingShell, PageHeader } from "@/app/landing/_components/marketing-shell";
import { useT } from "@/lib/i18n/provider";

/* Precios en USD: Pro $79/mes o $790/año (100K AI Credits/mes), Managed
   $249/mes o $2490/año (500K AI Credits/mes) — el pago anual sale el
   equivalente a dos meses gratis frente al mensual, en los dos planes de
   suscripción — y Enterprise $9990, pago único, sin créditos (self-hosted +
   tus propias claves), para quien prefiere correrlo en su propia
   infraestructura en vez de la nuestra. Pro y Managed llevan a /login — no
   hay checkout real todavía, así que "suscribirse" hoy es entrar a la cuenta
   que ya se creó al instalar la instancia. Enterprise abre un modal de
   contacto en vez de navegar: no es una compra de autoservicio. */

type BillingPeriod = "monthly" | "annual";

type Price = { readonly amountKey: string; readonly periodKey: string } | null;
type Cta = { readonly href: string; readonly labelKey: string } | null;

type Plan = {
  readonly cta: Cta;
  /** Shown in the CTA slot while `cta` itself is still `null` — the verb
   *  differs by plan (subscribe vs. get in touch), even though the actual
   *  destination isn't decided yet. */
  readonly ctaLabelKey: string;
  readonly emphasis?: boolean;
  readonly featureKeys: readonly string[];
  readonly forKey: string;
  readonly nameKey: string;
  readonly price: Price;
};

/**
 * Every line under a plan is something the repository already does. Nothing
 * here is aspirational: the four channels, the knowledge base, the sandbox
 * and the OpenTelemetry traces are all in the codebase today. Pro and Managed
 * are subscriptions to the instance we host and operate for you; Enterprise
 * is the same software, sold once, for whoever wants to run it on their own
 * infrastructure instead of ours.
 */
const PLANS: readonly Plan[] = [
  {
    nameKey: "pricing.pro.name",
    forKey: "pricing.pro.for",
    price: { amountKey: "", periodKey: "pricing.perMonth" },
    emphasis: true,
    cta: { href: "/login", labelKey: "pricing.cta.subscribe" },
    ctaLabelKey: "pricing.cta.subscribe",
    featureKeys: [
      "pricing.pro.feature1",
      "pricing.pro.feature2",
      "pricing.pro.feature3",
      "pricing.pro.feature4",
      "pricing.pro.feature5",
      "pricing.pro.feature6",
      "pricing.pro.feature7",
      "pricing.pro.feature8",
    ],
  },
  {
    nameKey: "pricing.managed.name",
    forKey: "pricing.managed.for",
    price: { amountKey: "", periodKey: "pricing.perMonth" },
    cta: { href: "/login", labelKey: "pricing.cta.subscribe" },
    ctaLabelKey: "pricing.cta.subscribe",
    featureKeys: [
      "pricing.managed.feature1",
      "pricing.managed.feature2",
      "pricing.managed.feature3",
      "pricing.managed.feature4",
      "pricing.managed.feature5",
      "pricing.managed.feature6",
      "pricing.managed.feature7",
      "pricing.managed.feature8",
    ],
  },
  {
    nameKey: "pricing.enterprise.name",
    forKey: "pricing.enterprise.for",
    price: { amountKey: "", periodKey: "" },
    cta: null,
    ctaLabelKey: "pricing.cta.contactSales",
    featureKeys: [
      "pricing.enterprise.feature1",
      "pricing.enterprise.feature2",
      "pricing.enterprise.feature3",
      "pricing.enterprise.feature4",
      "pricing.enterprise.feature5",
      "pricing.enterprise.feature6",
      "pricing.enterprise.feature7",
      "pricing.enterprise.feature8",
    ],
  },
] as const;

/**
 * The literal dollar figures — not translated, they're numbers. Pro and
 * Managed are subscriptions: annual is priced at ten times the monthly rate,
 * two months free against paying month to month, the same ratio on both.
 * Enterprise has no billing cycle to toggle — `oneTime` instead of
 * `monthly`/`annual` marks a plan the toggle leaves untouched.
 */
const PLAN_AMOUNTS: Record<
  string,
  { readonly monthly: number; readonly annual: number } | { readonly oneTime: number }
> = {
  "pricing.pro.name": { monthly: 79, annual: 790 },
  "pricing.managed.name": { monthly: 249, annual: 2490 },
  "pricing.enterprise.name": { oneTime: 9990 },
};

function formatUSD(amount: number): string {
  const formatted = Number.isInteger(amount)
    ? amount.toLocaleString("en-US")
    : amount.toFixed(2);
  return `$${formatted}`;
}

/**
 * transitions.dev "Number pop-in" (`.t-digit-group` / `.t-digit` in
 * globals.css), one character per span. `groupKey` remounts the whole group
 * — a fresh DOM node plays `.is-animating`'s entrance on its own, no manual
 * class-toggle-and-reflow dance needed. The two `data-stagger` steps that
 * ship with the effect only cover a two-character run, so longer figures
 * ($1990) get their delay from an inline `animationDelay` instead, at the
 * same `--digit-stagger` step.
 */
function DigitPop({ groupKey, text }: { readonly groupKey: string; readonly text: string }) {
  return (
    <span className="t-digit-group is-animating" key={groupKey}>
      {[...text].map((char, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the run is static per render, only `groupKey` ever changes
          key={index}
          className="t-digit"
          style={{ animationDelay: `calc(var(--digit-stagger) * ${index})` }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

/**
 * The price slot. A plan whose number has not been decided renders a dashed
 * placeholder rather than a plausible-looking figure — the page is unfinished
 * in exactly one place, and it says so where the number will go instead of
 * hiding it in a comment nobody reads.
 */
function PlanPrice({
  billing,
  nameKey,
  price,
}: {
  readonly billing: BillingPeriod;
  readonly nameKey: string;
  readonly price: Price;
}) {
  const t = useT();

  if (!price) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-muted-foreground/40 px-4 py-3">
        <p className="font-medium text-sm text-muted-foreground">{t("pricing.priceTbd")}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground/70">{t("pricing.priceTbdHint")}</p>
      </div>
    );
  }

  const billed = PLAN_AMOUNTS[nameKey];

  if (!billed) {
    return (
      <div className="mt-6">
        <p className="font-heading font-semibold font-cooper text-3xl tracking-[-0.03em]">
          {t(price.amountKey)}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">{t(price.periodKey)}</p>
      </div>
    );
  }

  // Enterprise (a one-time purchase) ignores the monthly/annual toggle: it
  // keeps its own fixed figure and label regardless of `billing`.
  if ("oneTime" in billed) {
    return (
      <div className="mt-6">
        <p className="font-heading font-semibold font-cooper text-3xl tracking-[-0.03em]">
          {formatUSD(billed.oneTime)}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("pricing.oneTime")}</p>
      </div>
    );
  }

  const amount = billing === "annual" ? billed.annual : billed.monthly;
  const periodKey = billing === "annual" ? "pricing.perYear" : "pricing.perMonth";

  return (
    <div className="mt-6">
      <p className="font-heading font-semibold font-cooper text-3xl tracking-[-0.03em]">
        <DigitPop groupKey={`${nameKey}-${billing}`} text={formatUSD(amount)} />
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">{t(periodKey)}</p>
      {billing === "annual" ? (
        <p className="mt-1 text-[12px] text-muted-foreground/70">
          {t("pricing.annualNote", { amount: formatUSD(Math.round(billed.annual / 12)) })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Enterprise's CTA: a modal instead of a link, because a $9,990 one-time sale
 * isn't a self-serve checkout. The reply address is the same `ENTITY.email`
 * the legal pages gate on — still unset, so the dialog falls back to the
 * identical dashed «definir …» placeholder those pages use rather than a
 * fake mailto that goes nowhere.
 */
function ContactSalesDialog() {
  const t = useT();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          {t("pricing.cta.contactSales")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pricing.contactModal.title")}</DialogTitle>
          <DialogDescription>{t("pricing.contactModal.body")}</DialogDescription>
        </DialogHeader>
        {ENTITY.email ? (
          <Button asChild>
            <a href={`mailto:${ENTITY.email}?subject=${encodeURIComponent("Enterprise — steve")}`}>
              {t("pricing.contactModal.emailCta", { email: ENTITY.email })}
            </a>
          </Button>
        ) : (
          <div className="rounded-xl border border-dashed border-muted-foreground/40 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {t("legal.entityUndefined", { label: t("legal.entityEmail") })}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The card itself, and the beam around the one the badge calls «Más elegido».
 *
 * `Beam` renders a wrapper `<div>` around its child, so the card's `h-full`
 * has to move onto that wrapper or the emphasised column stops matching its
 * neighbours' height. The package pins the wrapper to `position: relative`
 * from a stylesheet injected after Tailwind's, which is why the layout goes
 * through `style` rather than `className` — on equal specificity the later
 * rule wins, and an inline declaration is what outranks it.
 *
 * The metal is left to `useTheme()`: the marketing surface follows the app's
 * theme now, so the beam and the card it rings are always on the same ground.
 */
function PlanShell({
  children,
  emphasis,
}: {
  readonly children: ReactNode;
  readonly emphasis?: boolean;
}) {
  const card = (
    <div
      className={
        emphasis
          ? "flex h-full w-full flex-col rounded-2xl border border-input bg-card p-6 shadow-[var(--shadow-elevated)] sm:p-7"
          : "flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-7"
      }
    >
      {children}
    </div>
  );

  if (!emphasis) return card;

  return (
    <Beam
      colorVariant="mono"
      borderRadius={16}
      size="pulse-outside"
      strength={0.9}
      // The ring is a 1px `::after` on the wrapper's own edge, under a wrapper
      // that clips to `overflow: hidden`. An opaque child at the same radius
      // covers it exactly — which is what a full-bleed `bg-card` was doing.
      // One pixel of padding is the whole fix: the ring draws on the outer
      // edge, the card sits just inside it.
      style={{ display: "flex", height: "100%", padding: "1px", width: "100%" }}
    >
      {card}
    </Beam>
  );
}

export function Pricing() {
  const t = useT();
  const [billing, setBilling] = useState<BillingPeriod>("monthly");

  return (
    <MarketingShell>
      <PageHeader
        eyebrow={t("landing.header.linkPricing")}
        title={t("pricing.title")}
        titleClassName="font-cooper"
        lede={t("pricing.lede")}
      />

      <section className="py-20 sm:py-24">
        <Shell>
          <Reveal className="mb-8 flex justify-center">
            <SlidingTabs
              value={billing}
              onValueChange={(value) => setBilling(value as BillingPeriod)}
              tabs={[
                { id: "monthly", label: t("pricing.billing.monthly") },
                {
                  id: "annual",
                  label: (
                    <span className="flex items-center gap-1.5">
                      {t("pricing.billing.annual")}
                      <Badge className="px-1.5 py-0 text-[10px]">{t("pricing.billing.annualBadge")}</Badge>
                    </span>
                  ),
                },
              ]}
            />
          </Reveal>

          <div className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan, index) => (
              <Reveal key={plan.nameKey} delay={index * 70} className="h-full">
                <PlanShell emphasis={plan.emphasis}>
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-lg font-cooper tracking-tight">{t(plan.nameKey)}</h2>
                    {plan.emphasis ? <Badge>{t("pricing.mostPopular")}</Badge> : null}
                  </div>
                  <p className="mt-2 min-h-[3rem] max-w-[34ch] text-[14px] leading-relaxed text-muted-foreground">
                    {t(plan.forKey)}
                  </p>

                  <PlanPrice billing={billing} nameKey={plan.nameKey} price={plan.price} />

                  <ul className="mt-7 flex flex-1 flex-col gap-2.5">
                    {plan.featureKeys.map((featureKey) => (
                      <li key={featureKey} className="flex gap-2.5 text-[14px] leading-relaxed">
                        <HugeiconsIcon
                          icon={CheckIcon}
                          size={15}
                          strokeWidth={2}
                          className="mt-1 shrink-0 text-muted-foreground"
                        />
                        <span className="text-muted-foreground">{t(featureKey)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    {plan.nameKey === "pricing.enterprise.name" ? (
                      <ContactSalesDialog />
                    ) : plan.cta ? (
                      <Button asChild variant={plan.emphasis ? "default" : "outline"} className="w-full">
                        <Link href={plan.cta.href}>{t(plan.cta.labelKey)}</Link>
                      </Button>
                    ) : (
                      <div className="flex h-9 w-full items-center justify-center rounded-xl border border-dashed border-muted-foreground/40">
                        <p className="font-medium text-sm text-muted-foreground">{t(plan.ctaLabelKey)}</p>
                      </div>
                    )}
                  </div>
                </PlanShell>
              </Reveal>
            ))}
          </div>

          {/* The cost that is not on any of the three cards, said plainly and
              before anyone has to ask. A pricing page that hides the running
              cost of the model is the one thing that would make the rest of
              this page untrustworthy. */}
          <Reveal delay={140}>
            <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-7">
              <h2 className="font-medium text-base tracking-tight">{t("pricing.alwaysPay.title")}</h2>
              <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
                {t("pricing.alwaysPay.body")}
              </p>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-7">
              <h2 className="font-medium text-base tracking-tight">{t("pricing.enterpriseTerms.title")}</h2>
              <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
                {t("pricing.enterpriseTerms.body")}
              </p>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-16 grid gap-x-10 sm:grid-cols-2">
              <Disclosure label={t("pricing.faq.q1")}>{t("pricing.faq.a1")}</Disclosure>
              <Disclosure label={t("pricing.faq.q2")}>{t("pricing.faq.a2")}</Disclosure>
              <Disclosure label={t("pricing.faq.q3")}>{t("pricing.faq.a3")}</Disclosure>
              <Disclosure label={t("pricing.faq.q4")}>{t("pricing.faq.a4")}</Disclosure>
              <Disclosure label={t("pricing.faq.q5")}>{t("pricing.faq.a5")}</Disclosure>
            </div>
          </Reveal>
        </Shell>
      </section>
    </MarketingShell>
  );
}
