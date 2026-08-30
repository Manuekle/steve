"use client";

import { useT } from "@/lib/i18n/provider";
import { Disclosure, FigureLabel, Reveal, Shell } from "./primitives";

/**
 * The questions someone actually asks before installing this.
 *
 * Every answer is checkable against the repo: the model catalogue, the
 * channel adapters, the sandbox policy, the knowledge tool. Nothing here
 * promises a capability the code does not have — the point of the section is
 * to remove doubt, and an answer that turns out to be wrong at install time
 * costs more trust than the question ever did.
 */
const QUESTION_KEYS: readonly { readonly aKey: string; readonly qKey: string }[] = [
  { qKey: "landing.faq.q1", aKey: "landing.faq.a1" },
  { qKey: "landing.faq.q2", aKey: "landing.faq.a2" },
  { qKey: "landing.faq.q3", aKey: "landing.faq.a3" },
  { qKey: "landing.faq.q4", aKey: "landing.faq.a4" },
  { qKey: "landing.faq.q5", aKey: "landing.faq.a5" },
  { qKey: "landing.faq.q6", aKey: "landing.faq.a6" },
  { qKey: "landing.faq.q7", aKey: "landing.faq.a7" },
  { qKey: "landing.faq.q8", aKey: "landing.faq.a8" },
];

export function Faq() {
  const t = useT();

  return (
    <section id="preguntas" className="scroll-mt-20 border-border border-t py-24 sm:py-32">
      <Shell>
        <div className="grid gap-8 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-16">
          <Reveal>
            <FigureLabel>Fig 06</FigureLabel>
            <h2 className="mt-4 text-balance font-heading font-semibold font-cooper text-[clamp(2rem,4.4vw,3rem)] text-foreground leading-[1.02] tracking-[-0.03em]">
              {t("landing.faq.heading")}
            </h2>
            <p className="mt-5 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
              {t("landing.faq.subheading")}
            </p>
          </Reveal>

          <Reveal delay={70}>
            {/* One column, not two. A FAQ read in two columns makes the reader
                choose a side before reading, and every expanded answer shoves
                its neighbour down the page. */}
            <div className="border-border border-b">
              {QUESTION_KEYS.map((item) => (
                <Disclosure key={item.qKey} label={t(item.qKey)}>
                  {t(item.aKey)}
                </Disclosure>
              ))}
            </div>
          </Reveal>
        </div>
      </Shell>
    </section>
  );
}
