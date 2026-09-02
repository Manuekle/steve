"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { CheckIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useState } from "react";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { formatUSD, priceFor, type BillingPeriod } from "@/lib/plans";
import { DigitPop, Reveal, SectionIntro, Shell } from "./primitives";

/**
 * What it costs, on the landing rather than one click away.
 *
 * The page used to send every visitor to `/pricing` to find out, which is one
 * navigation between "this looks useful" and "can I afford it" — and the two
 * questions are asked in the same breath. This is the short answer: three
 * plans, the headline figure, three lines each, and the full table still a
 * click away for anyone who wants the other five.
 *
 * The figures and the annual ratio come from `lib/plans.ts`, which the pricing
 * page reads too. Neither one holds a number of its own, so they cannot end up
 * quoting different prices for the same plan.
 */

type BandPlan = {
  readonly emphasis?: boolean;
  /** The three lines that fit here. The other five are on `/pricing`. */
  readonly featureKeys: readonly string[];
  readonly forKey: string;
  readonly nameKey: string;
};

const PLANS: readonly BandPlan[] = [
  {
    nameKey: "pricing.pro.name",
    forKey: "pricing.pro.for",
    emphasis: true,
    featureKeys: ["pricing.pro.feature1", "pricing.pro.feature2", "pricing.pro.feature3"],
  },
  {
    nameKey: "pricing.managed.name",
    forKey: "pricing.managed.for",
    featureKeys: [
      "pricing.managed.feature1",
      "pricing.managed.feature2",
      "pricing.managed.feature3",
    ],
  },
  {
    nameKey: "pricing.enterprise.name",
    forKey: "pricing.enterprise.for",
    featureKeys: [
      "pricing.enterprise.feature1",
      "pricing.enterprise.feature2",
      "pricing.enterprise.feature3",
    ],
  },
];

export function PricingSection() {
  const t = useT();
  const [billing, setBilling] = useState<BillingPeriod>("monthly");

  return (
    <section id="precios" className="scroll-mt-20 border-border border-t py-24 sm:py-32">
      <Shell>
        <SectionIntro
          figure="Fig 08"
          title={[t("landing.pricing.titleLine1"), t("landing.pricing.titleLine2")]}
          body={t("landing.pricing.body")}
          cta={{ href: "/pricing", label: t("landing.pricing.cta") }}
        />

        <Reveal delay={60}>
          <div className="mt-12 flex justify-center">
            <SlidingTabs
              onValueChange={(value) => setBilling(value as BillingPeriod)}
              tabs={[
                { id: "monthly", label: t("pricing.billing.monthly") },
                {
                  id: "annual",
                  label: (
                    <span className="flex items-center gap-1.5">
                      {t("pricing.billing.annual")}
                      <Badge className="px-1.5 py-0 text-[10px]">
                        {t("pricing.billing.annualBadge")}
                      </Badge>
                    </span>
                  ),
                },
              ]}
              value={billing}
            />
          </div>
        </Reveal>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan, index) => {
            const price = priceFor(plan.nameKey, billing);
            return (
              <Reveal delay={index * 70} key={plan.nameKey}>
                {/* `lp-cap` is the same card the capability grid uses, so the
                    whole section hovers alike: the tile lifts and the ticks
                    come up in a run. The emphasised plan gets the stronger
                    border and shadow the app's own hovered card has rather
                    than a colour — the product has no accent, and one invented
                    for a pricing card is a brand the app does not have. The
                    full page's `Beam` stays on `/pricing`: a ring pulsing
                    forever belongs on the page you went to in order to
                    compare, not halfway down a landing. */}
                <div
                  className={`lp-cap group h-full flex-col p-6 sm:p-7 ${
                    plan.emphasis ? "border-input shadow-[var(--shadow-elevated)]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-cooper font-medium text-lg tracking-tight">
                      {t(plan.nameKey)}
                    </h3>
                    {plan.emphasis ? <Badge>{t("pricing.mostPopular")}</Badge> : null}
                  </div>

                  <p className="mt-2 min-h-[3rem] max-w-[34ch] text-[14px] leading-relaxed text-muted-foreground">
                    {t(plan.forKey)}
                  </p>

                  {price ? (
                    <div className="mt-5">
                      <p className="font-cooper font-heading font-semibold text-3xl tracking-[-0.03em]">
                        {/* Keyed on the period label, not on `billing`:
                            Enterprise's figure is the same under both, and a
                            number that replays its entrance without changing
                            reads as a number that changed. */}
                        <DigitPop
                          groupKey={`${plan.nameKey}-${price.periodKey}`}
                          text={formatUSD(price.amount)}
                        />
                      </p>
                      <p className="mt-1 text-[13px] text-muted-foreground">{t(price.periodKey)}</p>
                    </div>
                  ) : null}

                  <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                    {plan.featureKeys.map((featureKey, feature) => (
                      <li className="flex gap-2.5 text-[14px] leading-relaxed" key={featureKey}>
                        {/* The ticks light in a run rather than together. A
                            list that brightens all at once is a hover state; a
                            list that brightens in order is someone reading
                            down it, which is what the card wants you to do. */}
                        <HugeiconsIcon
                          className="mt-1 shrink-0 text-muted-foreground/50 transition-colors duration-500 group-hover:text-foreground"
                          icon={CheckIcon}
                          size={15}
                          strokeWidth={2}
                          style={{ transitionDelay: `${feature * 70}ms` }}
                        />
                        <span className="text-muted-foreground">{t(featureKey)}</span>
                      </li>
                    ))}
                  </ul>

                  {/* One destination for all three: the page where the plans
                      are actually compared. A "Subscribe" button here would
                      start a purchase from a card showing three of eight
                      lines — and its own label, not the section's, because
                      four buttons reading «Ver los planes en detalle» on one
                      screen is a section stuttering. */}
                  <div className="mt-7">
                    <Button
                      asChild
                      className="w-full"
                      variant={plan.emphasis ? "default" : "outline"}
                    >
                      <Link href="/pricing">{t("landing.pricing.planCta")}</Link>
                    </Button>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* The running cost of the model, said here too. It is the one number
            none of the three cards carries, and a pricing band that leaves it
            out is the reason someone feels misled two weeks later. */}
        <Reveal delay={140}>
          <p className="mx-auto mt-10 max-w-[64ch] text-center text-[13px] leading-relaxed text-muted-foreground/70">
            {t("landing.pricing.note")}
          </p>
        </Reveal>
      </Shell>
    </section>
  );
}
