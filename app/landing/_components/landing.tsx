"use client";

import { Faq } from "./faq";
import { LandingHero } from "./landing-hero";
import {
  AdsSection,
  AgentsSection,
  AutomationSection,
  ChannelBand,
  InboxSection,
  Principles,
  SelfHostedSection,
} from "./landing-sections";
import { LandingLocaleSwap } from "./locale-swap";
import { MarketingShell } from "./marketing-shell";
import { CapabilitiesSection } from "./section-capabilities";
import { PricingSection } from "./section-pricing";
import { ProofSection } from "./section-proof";

/**
 * The landing page: the section order, and nothing else. The dark wrapper,
 * the header, the footer and the reveal observer all live in
 * `MarketingShell`, which pricing and the legal pages share.
 *
 * `LandingLocaleSwap` is scoped to just this body — the language toggle
 * lives in the shared footer, outside it — so switching languages
 * crossfades the copy in place instead of snapping it.
 */
export function Landing() {
  return (
    <MarketingShell editorial>
      <LandingLocaleSwap>
        <LandingHero />
        <ChannelBand />
        <Principles />
        <InboxSection />
        <AutomationSection />
        <AgentsSection />
        {/* The grid goes here, straight after the agents screenshot: the
            section above says "an agent for every job", and the first question
            that follows is what a job can actually be. It is also where the
            page stops being able to afford another 1500px screenshot section —
            twelve features, one screen. */}
        <CapabilitiesSection />
        <AdsSection />
        <SelfHostedSection />
        {/* Proof, then price, then the objections. In that order because each
            one is the question the previous section leaves you with.

            Proof is one section, not two. The wall of quotes and the globe of
            clients were separate and consecutive, which made the page say
            "people use this" twice in a row with different furniture. */}
        <ProofSection />
        <PricingSection />
        <Faq />
        {/* The closing call to action lives in the footer now. It was a
            full-bleed band here, immediately above a footer that then said
            nothing — two endings in a row, the second one weaker, which is
            most of why the footer read as generic. One ending, and every
            marketing page gets it rather than only this one. */}
      </LandingLocaleSwap>
    </MarketingShell>
  );
}
