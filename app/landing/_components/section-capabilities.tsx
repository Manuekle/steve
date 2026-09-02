"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/use-session";
import { useT } from "@/lib/i18n/provider";
import { CAPABILITY_ART } from "./capability-art";
import { Reveal, SectionIntro, Shell } from "./primitives";

/**
 * The twelve things an agent does, one card each.
 *
 * The rest of the page argues by screenshot: a section takes one surface of
 * the product, shows it at 1240px and talks about it for eight hundred words.
 * That works three or four times and then the page is fifteen thousand pixels
 * long and has covered a third of what the app does — which is exactly where
 * this landing was. The calendar, the CRM board, the public forms, the email
 * templates, the voice agents and the payment links had all shipped without
 * the page ever mentioning them.
 *
 * This is the other move: a grid where each cell is one capability, an
 * animated drawing of the mechanism, and two lines. Twelve features in one
 * screen's worth of page instead of twelve sections.
 *
 * A card is a way into the page it describes — but only for someone who has
 * one. Every `href` here is a gated route, so for a visitor who has never
 * signed in twelve links to `/knowledge`, `/crm`, `/leads` … are twelve trips
 * to the login screen. That is the same trap the header's calls to action were
 * pulled out of, so the cards are links when there is a session and plain
 * cards when there is not; the way in for a visitor is the one call to action
 * at the top, pointing at a page they can actually read.
 *
 * Every entry is real, and most of them are `lib/agent-capabilities.ts`
 * verbatim — the same list the capability picker builds an agent from. The
 * four that are not (CRM board, leads, forms, email templates) are pages in
 * the sidebar rather than agent tools, which is the only reason they are not
 * in that file. Nothing here is a capability the code does not have; a landing
 * page is the worst possible place to find that out.
 */

type Capability = {
  /** Keys the scene in `CAPABILITY_ART` and the i18n strings. */
  readonly id: string;
  /** The page it belongs to, so a card is a way in and not just a claim. */
  readonly href: string;
  /** How many of the three columns the card takes. `2` is the bento's wide
   *  card; `3` is the full-width one that closes the grid. Absent is one. */
  readonly span?: 2 | 3;
};

/**
 * Nine, in an asymmetric bento.
 *
 * There were fifteen. Fifteen is a catalogue — the reader stops counting
 * around the eighth and the section stops being an argument. These nine are
 * the ones that answer "can it actually run my front desk"; the other six are
 * named in one line under the grid, which is enough for the reader who is
 * scanning for a particular word and is not a card each.
 *
 * The asymmetry is in the width, not the height. Spanning rows was tried and
 * it does not survive copy that runs from two lines to four: the grid resolves
 * its rows against the tallest card in each, and three columns end at three
 * heights with holes in them. Spanning *columns* cannot come apart — every
 * card in a row is still one row tall — and it gives the same broken-up
 * rhythm, which is what a bento is for.
 *
 * Each row is one wide card and one narrow one, and the side the wide one sits
 * on alternates. Four rows of `[2,1]` would be a layout with a margin down the
 * right; alternating is what makes it read as a bento rather than as a table
 * with a wide first column.
 */
const CAPABILITIES: readonly Capability[] = [
  { id: "knowledge", href: "/knowledge", span: 2 },
  { id: "handoff", href: "/inbox" },

  { id: "calendar", href: "/calendar" },
  { id: "leads", href: "/leads", span: 2 },

  { id: "payments", href: "/automations", span: 2 },
  { id: "voice", href: "/agents" },

  { id: "crm", href: "/crm" },
  { id: "prospect", href: "/crm", span: 2 },

  // Full width, and last. Four rows of two leave a ninth card sitting in a
  // two-column slot with an empty third beside it — a hole exactly where the
  // grid should be closing. A card that spans the row closes it, and this is
  // the right one to do it with: the scene is a wire between two systems and
  // it is the only one that gets better the wider it goes.
  { id: "api", href: "/connections", span: 3 },
];

/**
 * The grid deals itself again every few seconds.
 *
 * Cards trade places rather than the grid re-sorting: one pair moves at a
 * time, everything else holds still. A whole grid rearranging at once is a
 * page reloading in front of you — two cards swapping is the section saying
 * these are nine of the same kind of thing, in no particular order.
 *
 * Two rules keep it from turning into churn:
 *
 * A card only ever swaps with one of the same width. The bento's shape — wide,
 * narrow, alternating sides — is the layout, not a property of any card in it;
 * dropping a two-column card into a one-column slot would reflow every row
 * under it. Same span in, same span out, so the grid geometry never changes
 * and the move is a straight translation.
 *
 * And it stops the moment anyone might be reading: on hover or focus inside
 * the grid, off screen, on a background tab, on a narrow viewport where the
 * bento is not the layout anyway, and for `prefers-reduced-motion`. Same
 * bargain as the testimonial wall — the motion is what makes you look, and
 * stopping is what lets you read.
 */

/** How long a card sits in a slot before the next deal. */
const SHUFFLE_MS = 4600;

/** Long enough to follow a card across the grid, short enough not to wait. */
const SHUFFLE_TRANSITION = { duration: 0.62, ease: [0.22, 1, 0.36, 1] } as const;

/** The lg-only span class for a card, keyed by how many columns it takes. */
const SPAN_CLASS: Record<number, string | undefined> = {
  1: undefined,
  2: "lg:col-span-2",
  3: "lg:col-span-3",
};

/**
 * Slots grouped by width — the sets within which two cards may trade places.
 * The full-width card is alone in its group, so it never moves; it is the one
 * that closes the grid and it closes it wherever the rest end up.
 */
const SWAP_GROUPS: readonly (readonly number[])[] = (() => {
  const bySpan = new Map<number, number[]>();
  CAPABILITIES.forEach((capability, slot) => {
    const span = capability.span ?? 1;
    const group = bySpan.get(span) ?? [];
    group.push(slot);
    bySpan.set(span, group);
  });
  return [...bySpan.values()].filter((group) => group.length > 1);
})();

/** `order[slot]` is the index in `CAPABILITIES` of the card sitting there. */
type Order = readonly number[];

const INITIAL_ORDER: Order = CAPABILITIES.map((_, index) => index);

/** One swap: a random pair out of one random group of same-width slots. */
function deal(order: Order): Order {
  const group = SWAP_GROUPS[Math.floor(Math.random() * SWAP_GROUPS.length)];
  if (!group) return order;

  const first = Math.floor(Math.random() * group.length);
  // Anything but `first`, without a retry loop that can in principle spin.
  const second = (first + 1 + Math.floor(Math.random() * (group.length - 1))) % group.length;

  const next = [...order];
  const a = group[first];
  const b = group[second];
  next[a] = order[b];
  next[b] = order[a];
  return next;
}

/**
 * Runs the deal, and only while it is worth running: the bento layout is on,
 * the grid is on screen, the tab is in front, and nobody is reading it.
 */
function useShuffledOrder(grid: RefObject<HTMLDivElement | null>, paused: boolean): Order {
  const reduced = useReducedMotion();
  const [order, setOrder] = useState<Order>(INITIAL_ORDER);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const node = grid.current;
    if (!node) return;

    // The span classes are `lg:`, so below that the grid is a plain two-column
    // flow and a swap would move a card for no visible reason.
    const bento = window.matchMedia("(min-width: 1024px)");
    let onScreen = false;
    const sync = () => setLive(bento.matches && onScreen && !document.hidden);

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry?.isIntersecting ?? false;
        sync();
      },
      // Any sliver of the grid counts: it is taller than most viewports, so a
      // threshold would switch it off while the reader is halfway down it.
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    bento.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      bento.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [grid]);

  useEffect(() => {
    if (reduced || paused || !live) return;
    const timer = window.setInterval(() => setOrder(deal), SHUFFLE_MS);
    return () => window.clearInterval(timer);
  }, [live, paused, reduced]);

  return order;
}

/**
 * The card.
 *
 * The tile is always the same `<div>`, and the link — when there is a session
 * to link for — is an overlay stretched across it, above the scene and below
 * nothing. Swapping the outer element between a `<div>` and a `<Link>` when
 * the session resolves would remount the card mid-hover; an overlay changes
 * only what is on top of it.
 *
 * The overlay carries the card's own title as its accessible name, since the
 * link has no text of its own.
 */
function CapabilityCard({
  body,
  href,
  scene,
  span,
  title,
}: {
  readonly body: string;
  readonly href: string | null;
  readonly scene: ReactNode;
  readonly span?: 2 | 3;
  readonly title: string;
}) {
  const wide = Boolean(span);

  return (
    <div
      className={`lp-cap group h-full flex-col ${wide ? "lg:flex-row lg:items-stretch" : ""}`}
    >
      {/* Copy first in the DOM, and first on the page. A wide card reads left
          to right — the sentence, then the picture of it — and a narrow one
          reads top to bottom for the same reason. Stacking a wide card the way
          a narrow one stacks was what left a 480px scene sitting in a 700px
          card with the right half empty. */}
      <div
        // Not vertically centred. A wide card sitting next to a narrow one in
        // the same row would start its heading halfway down while its
        // neighbour started at the top — two titles on one row at two
        // different heights, which is the first thing the eye picks up and the
        // last thing anyone can explain. Every heading in the grid starts on
        // the same line; the scene is what centres.
        className={`relative z-20 flex-none px-7 pt-7 pb-3 ${
          wide ? "lg:w-[38%] lg:pr-2 lg:pb-7" : ""
        }`}
      >
        <h3 className="font-medium text-[15px] tracking-tight text-foreground">{title}</h3>
        <p className="mt-2.5 max-w-[42ch] text-[14px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>

      {/* The stage takes what is left. No minimum height: it is as tall as its
          scene and the grid row equalises the cards beside it. */}
      <div
        className={`lp-scene lp-scene-fill pb-7 ${wide ? "lg:min-w-0 lg:flex-1 lg:py-7 lg:pl-0" : "pt-1"}`}
      >
        {scene}
      </div>

      {href ? (
        <Link aria-label={title} className="lp-focus absolute inset-0 z-30 rounded-2xl" href={href} />
      ) : null}
    </div>
  );
}

export function CapabilitiesSection() {
  const t = useT();
  const session = useSession();
  const reduced = useReducedMotion();
  const grid = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false);
  const order = useShuffledOrder(grid, held);

  return (
    <section id="capacidades" className="scroll-mt-20 border-border border-t py-24 sm:py-32">
      <Shell>
        <SectionIntro
          figure="Fig 04"
          title={[t("landing.capabilities.titleLine1"), t("landing.capabilities.titleLine2")]}
          body={t("landing.capabilities.body")}
          cta={{ href: "/guide", label: t("landing.capabilities.cta") }}
        />

        {/* Four equal rows and then the full-width card at whatever height it
            needs. Equal rows are what make a swap a translation and nothing
            else: with rows sized by their own contents, two cards trading
            places would resize each other and drag every row below them, which
            is a layout recalculating rather than two cards moving. The last
            row stays `auto` — the wire card is short, and stretching it to
            match would open a hole exactly where the grid should be closing.

            Below `lg` this is untouched: no spans, no shuffle, no fixed rows. */}
        <div
          className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:[grid-template-rows:repeat(4,minmax(0,1fr))_auto]"
          onBlurCapture={() => setHeld(false)}
          onFocusCapture={() => setHeld(true)}
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          ref={grid}
        >
          {order.map((index) => {
            const capability = CAPABILITIES[index];
            const Art = CAPABILITY_ART[capability.id];
            return (
              <motion.div
                // The span lives on the grid item — on the card it would apply
                // to a child of a plain block and do nothing. Keyed by the
                // card, not the slot: that is what tells React a card moved
                // rather than a slot's contents changed, and what gives the
                // layout animation something to move.
                className={SPAN_CLASS[capability.span ?? 1]}
                key={capability.id}
                // Position only. The rows are equal, so nothing here needs to
                // resize — and asking for a size animation as well would put a
                // scale on the card and warp the heading inside it for the
                // length of the move.
                layout={reduced ? false : "position"}
                transition={SHUFFLE_TRANSITION}
              >
                {/* `h-full` so the card still fills the row now that the grid
                    item is this wrapper rather than `Reveal` itself. The row
                    is a definite height, so there is nothing circular in it.
                    The stagger walks by pairs, because a row here is two
                    cards, and it is keyed to where the card started so a
                    shuffle does not re-time a reveal that already ran. */}
                <Reveal className="h-full" delay={Math.floor(index / 2) * 70}>
                  <CapabilityCard
                    body={t(`landing.capabilities.${capability.id}.body`)}
                    href={session.signedIn ? capability.href : null}
                    scene={Art ? <Art /> : null}
                    span={capability.span}
                    title={t(`landing.capabilities.${capability.id}.title`)}
                  />
                </Reveal>
              </motion.div>
            );
          })}
        </div>

        {/* The line that keeps the grid honest: a capability is something you
            grant, not something that is simply on. */}
        <Reveal delay={140}>
          <div className="mx-auto mt-10 max-w-[68ch] space-y-2 text-center">
            {/* The six without a card of their own. A landing page that drops a
                capability to tidy up its grid is a landing page that lies by
                omission; one line is what they are worth here. */}
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {t("landing.capabilities.andAlso")}
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground/70">
              {t("landing.capabilities.footnote")}
            </p>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}
