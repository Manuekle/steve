"use client";

import { Faq } from "./faq";
import { LandingHero } from "./landing-hero";
import {
  AdsSection,
  AgentsSection,
  AutomationSection,
  ChannelBand,
  ClosingSection,
  InboxSection,
  Principles,
  SelfHostedSection,
} from "./landing-sections";
import { LandingLocaleSwap } from "./locale-swap";
import { MarketingShell } from "./marketing-shell";

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
    <MarketingShell>
      <LandingLocaleSwap>
        <LandingHero />
        <ChannelBand />
        <Principles />
        <InboxSection />
        <AutomationSection />
        <AgentsSection />
        <AdsSection />
        <SelfHostedSection />
        <Faq />
        <ClosingSection />
      </LandingLocaleSwap>
    </MarketingShell>
  );
}
