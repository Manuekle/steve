"use client";

import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  LibraryIcon,
  Layers01Icon,
  Shield01Icon,
  WebhookIcon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ChromaticTextReveal } from "@/components/motion/chromatic-text-reveal";
import { TextReveal } from "@/components/motion/text-reveal";
import { AnthropicLogo, GeminiLogo, OpenAiLogo, VercelLogo } from "@/components/provider-logo";
import { useSession } from "@/lib/auth/use-session";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { AdsScreen, FlowScreen, InboxScreen } from "./app-screens";
import { AgentsScreen } from "./screen-agents";
import {
  ElevenLabsMark,
  GoogleMark,
  InstagramMark,
  MetaMark,
  StripeMark,
  WhatsAppMark,
} from "./brand-marks";
import { MercadoPagoBrandIcon } from "@/components/icons/connection-icons";
import { AgentOverlay, ConversationOverlay } from "./overlays";
import { SECURITY_ART } from "./security-art";
import {
  Disclosure,
  FigureLabel,
  Haze,
  Reveal,
  ScreenFrame,
  SectionIntro,
  Shell,
} from "./primitives";

// ── Channel band ────────────────────────────────────────────────────

/**
 * The places a customer already writes to you, in the platforms' own colours
 * and at a size you can read across a room.
 *
 * It used to be a four-item marquee of monochrome glyphs at 15px, printed four
 * times so the track was wide enough to scroll. Two things were wrong with it:
 * a strip that moves on its own asks to be watched and then says nothing worth
 * watching, and "Chat web" alongside three product names is a feature standing
 * in a line of brands.
 *
 * Meta stands for the leads a Meta Ads form collects, which is what the line
 * underneath says instead of the old sentence about webhooks. A webhook is an
 * automation trigger; it was never somewhere a customer writes to you, which
 * is the claim this section makes.
 */
const CHANNELS: readonly { readonly label: string; readonly mark: ReactNode }[] = [
  { label: "WhatsApp", mark: <WhatsAppMark size={34} /> },
  { label: "Instagram", mark: <InstagramMark size={34} /> },
  { label: "Meta", mark: <MetaMark size={38} /> },
];

/** The four routes `lib/provider-catalog.ts` can be pointed at. Keep in step
 *  with AI_PROVIDERS in lib/model-catalog.ts. */
const PROVIDERS: readonly { readonly label: string; readonly mark: ReactNode }[] = [
  { label: "Anthropic", mark: <AnthropicLogo size={20} /> },
  { label: "OpenAI", mark: <OpenAiLogo size={20} /> },
  { label: "Gemini", mark: <GeminiLogo size={20} /> },
  { label: "Vercel AI Gateway", mark: <VercelLogo size={18} /> },
];

export function ChannelBand() {
  const t = useT();

  return (
    <section className="border-border border-y py-20 sm:py-24">
      <Shell>
        <TextReveal
          as="h2"
          blur={6}
          className="mx-auto max-w-[22ch] text-balance text-center font-cooper font-semibold text-[clamp(1.75rem,3.8vw,2.75rem)] text-foreground leading-[1.06] tracking-[-0.03em]"
          stagger={0.045}
          text={t("landing.channels.heading")}
          whileInView
          yOffset="24%"
        />

        <Reveal delay={80}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-14 gap-y-9 sm:gap-x-20">
            {CHANNELS.map((channel) => (
              <span className="flex items-center gap-3.5" key={channel.label}>
                {channel.mark}
                <span className="whitespace-nowrap font-cooper text-[clamp(1.25rem,2.4vw,1.75rem)] text-foreground leading-none tracking-[-0.02em]">
                  {channel.label}
                </span>
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <p className="mx-auto mt-11 max-w-[52ch] text-center text-[15px] leading-relaxed text-muted-foreground">
            {t("landing.channels.body")}
          </p>
        </Reveal>

        {/* The other half of the claim: the channels are theirs, the model is
            yours. Same hairline the feature sections use, so the two halves
            read as one section rather than as two bands stacked.

            The line names one route at a time and the row shows all three
            marks, so neither repeats the other. It is the one moving thing
            left in this section, and it moves for a reason the copy needs:
            "the model is your choice" is a list, and a list read aloud is
            what a cycling word is. */}
        <Reveal delay={200}>
          <div className="mt-14 border-border border-t pt-10">
            <p className="text-center text-[13px] text-muted-foreground/70">
              {/* The prefix cannot wrap — the component keeps it on one line so
                  the sweep has a stable box to travel across — and the word
                  slot always reserves the width of the longest option. Kept
                  short so prefix plus «Vercel AI Gateway» still fits inside a
                  360px phone's rail. */}
              <ChromaticTextReveal
                pauseDuration={1.6}
                prefix={t("landing.channels.modelPrefix")}
                words={PROVIDERS.map((provider) => provider.label)}
              />
            </p>
            <div className="mt-6 flex items-center justify-center gap-9 text-muted-foreground/70">
              {PROVIDERS.map((provider) => (
                <span key={provider.label} title={provider.label}>
                  {provider.mark}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}

// ── Principles ──────────────────────────────────────────────────────

const PRINCIPLES: readonly {
  readonly bodyKey: string;
  readonly figure: string;
  readonly icon: IconSvgElement;
  readonly titleKey: string;
}[] = [
  {
    bodyKey: "landing.principles.inbox.body",
    figure: "Fig 0.1",
    icon: Layers01Icon,
    titleKey: "landing.principles.inbox.title",
  },
  {
    bodyKey: "landing.principles.knowledge.body",
    figure: "Fig 0.2",
    icon: LibraryIcon,
    titleKey: "landing.principles.knowledge.title",
  },
  {
    bodyKey: "landing.principles.selfHosted.body",
    figure: "Fig 0.3",
    icon: Shield01Icon,
    titleKey: "landing.principles.selfHosted.title",
  },
];

export function Principles() {
  const t = useT();

  return (
    <section className="py-24 sm:py-32">
      <Shell>
        <TextReveal
          as="h2"
          blur={6}
          className="max-w-[18ch] text-balance font-heading font-semibold font-cooper text-[clamp(2rem,4.4vw,3rem)] text-foreground leading-[1.02] tracking-[-0.03em]"
          stagger={0.045}
          text={t("landing.principles.heading")}
          whileInView
          yOffset="24%"
        />

        {/* Three cards, not one box cut into thirds.

            The old grid drew its dividers by showing a `bg-border` parent
            through 1px gaps, inside a single rounded outline. That is a table,
            and it is the one surface treatment the product never uses: the app
            has cards — `--card`, a hairline, `--shadow-soft` and the inset
            bevel — and this section was the only place on the page pretending
            it had something else. `lp-cap` is that card, the same one the
            capability grid and the self-hosted section use, so all three grids
            answer the cursor the same way. */}
        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {PRINCIPLES.map((principle, index) => (
            <Reveal key={principle.titleKey} delay={index * 70}>
              <div className="lp-cap group h-full flex-col p-6 sm:p-7">
                <div className="lp-plate flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
                  <HugeiconsIcon icon={principle.icon} size={16} strokeWidth={1.75} />
                </div>
                <FigureLabel>
                  <span className="mt-5 block">{principle.figure}</span>
                </FigureLabel>
                <h3 className="mt-2 font-medium text-lg tracking-tight">{t(principle.titleKey)}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{t(principle.bodyKey)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Shell>
    </section>
  );
}

// ── Feature section shell ───────────────────────────────────────────

/**
 * The repeating unit of the page: an intro, a working screen with its data
 * floated on top, and a row of one-line disclosures for the detail that would
 * bloat the paragraph above.
 *
 * The screen is no longer wrapped in `aria-hidden`. It used to be decoration,
 * and decoration is what it stopped being the moment the tabs, the rows and
 * the canvas started responding — a focusable control inside an `aria-hidden`
 * subtree is a keyboard trap with no name attached. It is a labelled group
 * instead.
 */
function FeatureSection({
  body,
  children,
  disclosures,
  figure,
  footer,
  hint,
  id,
  label,
  overlays,
  title,
  url,
}: {
  readonly body: ReactNode;
  readonly children: ReactNode;
  readonly disclosures: readonly { readonly detail: string; readonly label: ReactNode }[];
  readonly figure: string;
  /** Optional block between the screen and the disclosures. */
  readonly footer?: ReactNode;
  /** The one line telling a visitor the screen below is operable. */
  readonly hint: string;
  readonly id: string;
  /** Names the screen for anyone who cannot see it. */
  readonly label: string;
  readonly overlays?: ReactNode;
  readonly title: readonly string[];
  /** The address its browser toolbar shows. */
  readonly url: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-border border-t py-24 sm:py-32">
      <Shell>
        <SectionIntro figure={figure} title={title} body={body} />
      </Shell>

      {/* The screen sits on the wide rail, not on the copy rail — the same
          `1240px` the hero mockup uses. Every figure on the page is then the
          same object photographed from the same distance; running the first
          one 120px wider than the four below it read as four screenshots that
          had been shrunk to fit. */}
      <div className="relative mx-auto mt-14 w-full max-w-[1240px] px-6 sm:mt-16 sm:px-8">
        <Reveal delay={60} lift={false}>
          <ScreenFrame hint={hint} label={label} overlays={overlays} url={url}>
            {children}
          </ScreenFrame>
        </Reveal>
      </div>

      <Shell>
        {footer}
        <Reveal delay={80}>
          <div className="mt-16 grid gap-x-10 sm:mt-20 sm:grid-cols-2 lg:grid-cols-3">
            {disclosures.map((item) => (
              <Disclosure key={item.detail} label={item.label}>
                {item.detail}
              </Disclosure>
            ))}
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}

// ── Bandeja ─────────────────────────────────────────────────────────

export function InboxSection() {
  const t = useT();

  return (
    <FeatureSection
      id="bandeja"
      figure="Fig 01"
      url="localhost:3000/inbox"
      label={t("landing.features.inbox.label")}
      hint={t("landing.features.inbox.hint")}
      title={[t("landing.features.inbox.titleLine1"), t("landing.features.inbox.titleLine2")]}
      body={t("landing.features.inbox.body")}
      overlays={
        <ConversationOverlay
          className="-bottom-2 -left-6 hidden lg:block"
          delay={240}
          channel="instagram"
          who="Lucía Romero"
          incoming={t("landing.demo.msg.lucia")}
          reply={t("landing.demo.reply.lucia")}
        />
      }
      disclosures={[
        {
          label: t("landing.features.inbox.disclosure1.label"),
          detail: t("landing.features.inbox.disclosure1.detail"),
        },
        {
          label: t("landing.features.inbox.disclosure2.label"),
          detail: t("landing.features.inbox.disclosure2.detail"),
        },
        {
          label: t("landing.features.inbox.disclosure3.label"),
          detail: t("landing.features.inbox.disclosure3.detail"),
        },
      ]}
    >
      <InboxScreen />
    </FeatureSection>
  );
}

// ── Automatizaciones ────────────────────────────────────────────────


/**
 * What a flow can do at its far end, and nothing it cannot.
 *
 * Every entry here is a credential group in Configuración with a step or a
 * tool behind it — `send_payment_link` calls `lib/stripe.ts`, `log_sheet`
 * calls `lib/google-sheets.ts`, the calendar tools call `lib/calendar.ts` off
 * the same Google service account, `send_audio` reaches ElevenLabs through
 * `lib/elevenlabs.ts`, and `http_request` is bounded by the host allowlist. A logo strip on a landing page is a promise about integrations,
 * and it is the easiest one on a page like this to write ahead of the code.
 */
const CONNECTORS: readonly {
  readonly detailKey: string;
  /** `null` for a literal brand name — nothing to translate. */
  readonly labelKey: string | null;
  readonly label: string;
  readonly mark: ReactNode;
}[] = [
  {
    detailKey: "landing.features.automation.connectorStripe",
    labelKey: "landing.features.automation.connectorPaymentsLabel",
    label: "",
    mark: (
      <span className="flex items-center gap-1.5">
        <StripeMark size={26} />
        <MercadoPagoBrandIcon size={22} />
      </span>
    ),
  },
  {
    detailKey: "landing.features.automation.connectorSheets",
    labelKey: "landing.features.automation.connectorSheetsLabel",
    label: "",
    mark: <GoogleMark size={26} />,
  },
  {
    detailKey: "landing.features.automation.connectorVoice",
    labelKey: "landing.features.automation.connectorVoiceLabel",
    label: "",
    mark: <ElevenLabsMark height={15} />,
  },
  {
    detailKey: "landing.features.automation.connectorApi",
    labelKey: "landing.features.automation.connectorApiLabel",
    label: "",
    mark: (
      <HugeiconsIcon
        className="shrink-0 text-muted-foreground"
        icon={WebhookIcon}
        size={22}
        strokeWidth={1.5}
      />
    ),
  },
];

function AutomationConnectors() {
  const t = useT();

  return (
    <Reveal delay={80}>
      <div className="mt-16 border-border border-t pt-10 sm:mt-20">
        <p className="text-center text-[13px] text-muted-foreground/70">
          {t("landing.features.automation.connectorsIntro")}
        </p>
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {CONNECTORS.map((connector) => (
            <div className="flex flex-col items-center gap-2.5 text-center" key={connector.detailKey}>
              {/* Fixed-height slot: the marks have wildly different aspect
                  ratios — a square G, a wide parallelogram, a wordmark seven
                  times wider than it is tall — and without it the labels sit
                  at four different heights. */}
              <span className="flex h-7 items-center">{connector.mark}</span>
              <p className="mt-1 font-medium text-[15px] text-foreground">
                {connector.labelKey ? t(connector.labelKey) : connector.label}
              </p>
              <p className="max-w-[26ch] text-[13px] leading-relaxed text-muted-foreground">
                {t(connector.detailKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

export function AutomationSection() {
  const t = useT();

  return (
    <FeatureSection
      id="automatizaciones"
      figure="Fig 02"
      footer={<AutomationConnectors />}
      url="localhost:3000/automations/atencion-primera-linea"
      label={t("landing.features.automation.label")}
      hint={t("landing.features.automation.hint")}
      title={[t("landing.features.automation.titleLine1"), t("landing.features.automation.titleLine2")]}
      body={t("landing.features.automation.body")}
      overlays={
        <AgentOverlay
          className="-right-6 bottom-24 hidden lg:block"
          delay={260}
          prompt={t("landing.features.automation.overlayPrompt")}
          /* The real tools, in the order the agent uses them: it checks for an
             existing playbook first, then proposes one. `propose_automation`
             is why the result lands as a draft — the tool proposes, a human
             approves. */
          steps={[
            "list_automations()",
            t("landing.features.automation.overlayStep2"),
            t("landing.features.automation.overlayStep3"),
          ]}
          result={t("landing.features.automation.overlayResult")}
        />
      }
      disclosures={[
        {
          label: t("landing.features.automation.disclosure1.label"),
          detail: t("landing.features.automation.disclosure1.detail"),
        },
        {
          label: t("landing.features.automation.disclosure2.label"),
          detail: t("landing.features.automation.disclosure2.detail"),
        },
        {
          label: t("landing.features.automation.disclosure3.label"),
          detail: t("landing.features.automation.disclosure3.detail"),
        },
      ]}
    >
      <FlowScreen />
    </FeatureSection>
  );
}

// ── Agentes ─────────────────────────────────────────────────────────

export function AgentsSection() {
  const t = useT();

  return (
    <FeatureSection
      id="agentes"
      figure="Fig 03"
      url="localhost:3000/agents"
      label={t("landing.features.agents.label")}
      hint={t("landing.features.agents.hint")}
      title={[t("landing.features.agents.titleLine1"), t("landing.features.agents.titleLine2")]}
      body={t("landing.features.agents.body")}
      overlays={null}
      disclosures={[
        {
          label: t("landing.features.agents.disclosure1.label"),
          detail: t("landing.features.agents.disclosure1.detail"),
        },
        {
          label: t("landing.features.agents.disclosure2.label"),
          detail: t("landing.features.agents.disclosure2.detail"),
        },
        {
          label: t("landing.features.agents.disclosure3.label"),
          detail: t("landing.features.agents.disclosure3.detail"),
        },
      ]}
    >
      <AgentsScreen />
    </FeatureSection>
  );
}

// ── Meta Ads ────────────────────────────────────────────────────────

export function AdsSection() {
  const t = useT();

  return (
    <FeatureSection
      id="ads"
      figure="Fig 05"
      url="localhost:3000/ads"
      label={t("nav.ads")}
      hint={t("landing.features.ads.hint")}
      title={[t("landing.features.ads.titleLine1"), t("landing.features.ads.titleLine2")]}
      body={t("landing.features.ads.body")}
      overlays={
        /* The screen behind already states the cost per lead, so the overlay
           shows the other half of the claim: what the lead that number is
           counting actually said once it landed in the inbox. */
        <ConversationOverlay
          className="-right-6 bottom-20 hidden lg:block"
          delay={260}
          who="Lead · Retargeting"
          incoming={t("landing.features.ads.overlayIncoming")}
          reply={t("landing.features.ads.overlayReply")}
        />
      }
      disclosures={[
        {
          label: t("landing.features.ads.disclosure1.label"),
          detail: t("landing.features.ads.disclosure1.detail"),
        },
        {
          label: t("landing.features.ads.disclosure2.label"),
          detail: t("landing.features.ads.disclosure2.detail"),
        },
        {
          label: t("landing.features.ads.disclosure3.label"),
          detail: t("landing.features.ads.disclosure3.detail"),
        },
      ]}
    >
      <AdsScreen />
    </FeatureSection>
  );
}

// ── Autoalojado ─────────────────────────────────────────────────────

/**
 * The six guarantees, each one a file.
 *
 * This section used to be four tiles with a static icon and a sentence. That
 * was fine while it was the page's only card grid; it stopped being fine when
 * the capability grid learned to answer the cursor, because a security section
 * that is quieter than the feature section reads as the part nobody worked on
 * — and it is the part a buyer's technical person actually stops at.
 *
 * The two entries that are new here were already true and simply never said:
 * every inbound webhook is verified by an HMAC over the raw body before it is
 * parsed, and every outbound call the agent makes is bounded by an allowlist
 * that also refuses loopback, private ranges and raw IPs. Both matter more to
 * the person reviewing this than three of the four that were here.
 */
const STACK: readonly {
  readonly bodyKey: string;
  /** Keys the scene in `SECURITY_ART`. */
  readonly id: string;
  readonly titleKey: string;
}[] = [
  {
    id: "database",
    bodyKey: "landing.selfHosted.database.body",
    titleKey: "landing.selfHosted.database.title",
  },
  {
    id: "sandbox",
    bodyKey: "landing.selfHosted.sandbox.body",
    titleKey: "landing.selfHosted.sandbox.title",
  },
  {
    id: "webhooks",
    bodyKey: "landing.selfHosted.webhooks.body",
    titleKey: "landing.selfHosted.webhooks.title",
  },
  {
    id: "keys",
    bodyKey: "landing.selfHosted.keys.body",
    titleKey: "landing.selfHosted.keys.title",
  },
  {
    id: "allowlist",
    bodyKey: "landing.selfHosted.allowlist.body",
    titleKey: "landing.selfHosted.allowlist.title",
  },
  {
    id: "traces",
    bodyKey: "landing.selfHosted.traces.body",
    titleKey: "landing.selfHosted.traces.title",
  },
];

/**
 * One guarantee, sized for a rail rather than for a grid cell.
 *
 * The width is fixed because the row is a flex line: left to itself a flex
 * line divides the rail between its cards, and twelve cards in a 1120px rail
 * is twelve slivers. `.lp-rail-card` is what the spotlight rule reads — the
 * hover styling lives in the stylesheet so a paused row and a lit card are one
 * decision rather than one per card.
 */
function StackCard({
  body,
  echo,
  scene,
  title,
}: {
  readonly body: string;
  /** The duplicated pass, heard once by a screen reader and read twice by the
   *  loop. */
  readonly echo?: boolean;
  readonly scene: ReactNode;
  readonly title: string;
}) {
  return (
    <div aria-hidden={echo ? "true" : undefined} className="lp-rail-card w-[19rem] sm:w-[21rem]">
      <div className="lp-cap group h-full flex-col">
        <div className="relative z-20 order-last flex-none px-7 pt-1 pb-7">
          <h3 className="font-medium text-[15px] tracking-tight text-foreground">{title}</h3>
          <p className="mt-2.5 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
        </div>
        <div className="lp-scene pt-7 pb-3">{scene}</div>
      </div>
    </div>
  );
}

/**
 * One travelling row. `items` is rendered twice — the animation covers exactly
 * half the track, so the second copy lands where the first began and the loop
 * has no seam.
 */
function StackRow({
  dir,
  duration,
  items,
}: {
  readonly dir: "left" | "right";
  readonly duration: string;
  readonly items: readonly (typeof STACK)[number][];
}) {
  const t = useT();

  const card = (item: (typeof STACK)[number], echo: boolean) => {
    const Art = SECURITY_ART[item.id];
    return (
      <StackCard
        body={t(item.bodyKey)}
        echo={echo}
        key={echo ? `${item.id}-echo` : item.id}
        scene={Art ? <Art /> : null}
        title={t(item.titleKey)}
      />
    );
  };

  return (
    <div className="lp-rail-track" data-dir={dir} style={{ "--lp-drift": duration } as CSSProperties}>
      {items.map((item) => card(item, false))}
      {items.map((item) => card(item, true))}
    </div>
  );
}

export function SelfHostedSection() {
  const t = useT();

  return (
    <section id="autoalojado" className="scroll-mt-20 border-border border-t py-24 sm:py-32">
      <Shell>
        <SectionIntro
          figure="Fig 06"
          title={[t("landing.selfHosted.titleLine1"), t("landing.selfHosted.titleLine2")]}
          body={t("landing.selfHosted.body")}
        />

        {/* Two rows travelling against each other. Six guarantees are a list of
            equals — nothing here is wider or taller than its neighbour — so the
            asymmetry is in the movement instead: the rows run opposite ways and
            at different speeds, which is what keeps them from reading as one
            block sliding.

            Three guarantees to a row, and the rows do not share any: both
            rows carrying all six put the same card on screen twice at once,
            in two places, which reads as a rendering fault rather than as a
            loop. Three cards is 1068px against a 1056px rail, so a card is
            never on screen beside its own second copy either. */}
        <Reveal delay={60} lift={false}>
          <div className="lp-rail mt-9 flex flex-col gap-5">
            <Haze edge="left" />
            <StackRow dir="right" duration="72s" items={STACK.slice(0, 3)} />
            <StackRow dir="left" duration="88s" items={STACK.slice(3)} />
            <Haze edge="right" />
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}

// ── Prefooter ───────────────────────────────────────────────────────

export function ClosingSection() {
  const t = useT();
  const session = useSession();

  return (
    <section className="relative overflow-hidden border-border border-t">
      <div
        aria-hidden="true"
        className="lp-glow"
        style={{ bottom: "-22rem", width: "min(900px, 120vw)", height: "34rem" }}
      />
      <Shell className="relative py-28 text-center sm:py-36">
        <Reveal>
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={ZapIcon} size={18} strokeWidth={1.75} />
          </div>
        </Reveal>
        <TextReveal
          as="h2"
          blur={6}
          className="mx-auto mt-8 max-w-[16ch] text-balance font-heading font-semibold font-cooper text-[clamp(2.25rem,5.5vw,3.75rem)] text-foreground leading-[1.02] tracking-[-0.03em]"
          stagger={0.045}
          text={t("landing.closing.title")}
          whileInView
          yOffset="24%"
        />
        <Reveal delay={120}>
          <p className="mx-auto mt-6 max-w-[44ch] text-[17px] leading-relaxed text-muted-foreground">
            {t("landing.closing.body")}
          </p>
        </Reveal>
        <Reveal delay={180}>
          {/* `Button`, not two hand-rolled anchors reading `--btn-*` directly.
              A button reimplemented from the raw tokens is the thing that
              silently stops matching the app the next time the button system
              changes — which is exactly what had happened here. */}
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href={session.signedIn ? "/dashboard" : "/login"}>
                {session.signedIn
                  ? t("landing.cta.openApp")
                  : session.claimed
                    ? t("landing.cta.signIn")
                    : t("landing.cta.install")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">{t("landing.cta.pricing")}</Link>
            </Button>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}
