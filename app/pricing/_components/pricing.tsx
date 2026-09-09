"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { CheckIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Halo, LightBar } from "@/app/landing/_components/lighting";
import { DigitPop, Disclosure, Reveal, Shell } from "@/app/landing/_components/primitives";
import { formatUSD, monthlyEquivalent, priceFor, type BillingPeriod } from "@/lib/plans";
import { SalesContactDialog } from "@/app/landing/_components/sales-contact-dialog";
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

/* The figures themselves, and the annual ratio behind them, live in
   `lib/plans.ts` — the landing's pricing band quotes the same numbers, and
   two hardcoded copies of "$79" is the pair that silently drifts apart. */

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
        <p className="mt-0.5 text-[12px] text-muted-foreground">{t("pricing.priceTbdHint")}</p>
      </div>
    );
  }

  const billed = priceFor(nameKey, billing);

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

  // Enterprise, a one-time purchase, comes back from `priceFor` with the
  // `oneTime` label whatever the toggle says — there is no cycle to toggle and
  // no annual note to put under it.
  const perMonth = billing === "annual" ? monthlyEquivalent(nameKey) : null;

  return (
    <div className="mt-6">
      <p className="font-heading font-semibold font-cooper text-3xl tracking-[-0.03em]">
        <DigitPop
          groupKey={`${nameKey}-${billed.periodKey}`}
          luminous
          text={formatUSD(billed.amount)}
        />
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">{t(billed.periodKey)}</p>
      {perMonth !== null ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("pricing.annualNote", { amount: formatUSD(perMonth) })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The card itself, and the fixture over the one the badge calls «Más elegido».
 *
 * `.lp-cap`, the same card the landing's pricing band and its capability grid
 * are built from, rather than a hand-rolled `rounded-2xl border bg-card`.
 * Three copies of one card is how three surfaces stop matching on the next
 * edit — and this one had already drifted: it carried a permanent
 * `--shadow-elevated`, which is the app's *hover* depth applied to a card
 * nobody is pointing at.
 *
 * The emphasis is a strip light above it and a pool below, exactly as on the
 * landing. It used to be `Beam` — a mono ring pulsing on a loop around the
 * card's edge. That was the right call on a page with no light in it, and it
 * is the wrong one now for the reason the rig is built on: a light that pulses
 * is a notification, and this is the only thing on the whole public surface
 * that would still be moving on its own. A visitor arriving here from a lit
 * landing should recognise the lamp, not meet a second idea about how
 * emphasis works.
 */
function PlanShell({
  children,
  emphasis,
}: {
  readonly children: ReactNode;
  readonly emphasis?: boolean;
}) {
  return (
    <div className="relative h-full">
      {/* Rendered before the card and with no z-index, so the card's opaque
          surface takes the half of the cone that would otherwise wash down
          over the plan name. The fixture's box sits on the card's top edge —
          `LightBar` lifts its own tube out of it. */}
      {emphasis ? (
        <>
          <LightBar className="inset-x-[14%] top-0 z-10"
            drop="14rem"
            gap="0px"
            intensity={0.9} />
          <Halo className="-inset-x-8 -bottom-10 h-32" />
        </>
      ) : null}
      <div
        className={`lp-cap h-full w-full flex-col p-6 sm:p-7 ${emphasis ? "border-input" : ""}`}
      >
        {children}
      </div>
    </div>
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
          {/* `mb-14`, not `mb-8`. Same reason as the landing band: the emphasised
              card carries a fixture, and at the old spacing its tube and halo
              landed a dozen pixels under the billing toggle — a control and a
              light fighting for one band of the composition. */}
          <Reveal className="mb-14 flex justify-center">
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
                      <SalesContactDialog
                        source="pricing"
                        titleKey="pricing.contactModal.title"
                        bodyKey="pricing.contactModal.body"
                        triggerLabelKey="pricing.cta.contactSales"
                      />
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
            <div className="lp-cap lp-cap-still mt-10 flex-col p-6 sm:p-7">
              <h2 className="font-medium text-base tracking-tight">{t("pricing.alwaysPay.title")}</h2>
              <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
                {t("pricing.alwaysPay.body")}
              </p>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="lp-cap lp-cap-still mt-4 flex-col p-6 sm:p-7">
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
