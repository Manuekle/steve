"use client";

import Link from "next/link";
import { PageHeader, MarketingShell } from "@/app/landing/_components/marketing-shell";
import { Grain } from "@/app/landing/_components/grain";
import { Reveal, Shell } from "@/app/landing/_components/primitives";
import styles from "@/app/landing/_components/editorial.module.css";
import { useT } from "@/lib/i18n/provider";

type Profile = {
  readonly initials: string;
  readonly nameKey: string;
  readonly roleKey: string;
  readonly tone: string;
};

const PROFILES: readonly Profile[] = [
  { initials: "NP", nameKey: "team.profileOneName", roleKey: "team.profileOneRole", tone: "bg-[#e8d8c4]" },
  { initials: "NP", nameKey: "team.profileTwoName", roleKey: "team.profileTwoRole", tone: "bg-[#d8e2dc]" },
  { initials: "NP", nameKey: "team.profileThreeName", roleKey: "team.profileThreeRole", tone: "bg-[#e5d8e2]" },
  { initials: "NP", nameKey: "team.profileFourName", roleKey: "team.profileFourRole", tone: "bg-[#d9e0eb]" },
  { initials: "NP", nameKey: "team.profileFiveName", roleKey: "team.profileFiveRole", tone: "bg-[#eadfc9]" },
] as const;

function InitialsAvatar({
  initials,
  large = false,
  tone,
}: {
  readonly initials: string;
  readonly large?: boolean;
  readonly tone: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex aspect-square items-center justify-center rounded-[1.25rem] border border-foreground/10 ${tone} ${large ? "text-5xl sm:text-7xl" : "text-3xl"}`}
    >
      <span className="font-cooper text-foreground/70">{initials}</span>
    </div>
  );
}

function ProfileMeta({ role }: { readonly role: string }) {
  return <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{role}</p>;
}

export function Team() {
  const t = useT();

  return (
    <MarketingShell>
      <PageHeader eyebrow={t("team.eyebrow")} title={t("team.title")} titleClassName="font-cooper" lede={t("team.lede")} />

      <div className={`${styles.surface} ${styles.publicBody}`}>
        <Grain />
        <Shell className={`${styles.publicBodyContent} py-20 sm:py-28`}>
          <section aria-labelledby="team-members-heading">
            <h2 id="team-members-heading" className="sr-only">{t("team.featuredLabel")}</h2>

            <Reveal className="grid gap-8 border-b border-border pb-16 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:gap-14 md:pb-24">
              <InitialsAvatar initials="ST" large tone="bg-[#e8d8d0]" />
              <div className="flex flex-col justify-end">
                <p className="lp-eyebrow">{t("team.featuredLabel")}</p>
                <h3 className="mt-4 font-cooper text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] tracking-[-0.03em]">{t("team.featuredName")}</h3>
                <ProfileMeta role={t("team.featuredRole")} />
                <p className="mt-6 max-w-[42ch] text-[16px] leading-relaxed text-muted-foreground">{t("team.featuredBio")}</p>
                <Link className="lp-focus mt-7 min-h-6 w-fit text-sm underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground" href="#team-contact">
                  {t("team.placeholderSocial")}
                </Link>
              </div>
            </Reveal>

            <div className="grid gap-x-5 gap-y-12 py-16 sm:grid-cols-2 md:gap-x-7 md:gap-y-16 md:py-24 lg:grid-cols-3">
              {PROFILES.map((profile, index) => (
                <Reveal key={profile.roleKey} delay={index * 70} className={index === 3 ? "lg:col-start-2" : undefined}>
                  <article>
                    <InitialsAvatar initials={profile.initials} tone={profile.tone} />
                    <div className="mt-5 flex items-baseline justify-between gap-4">
                      <h3 className="font-cooper text-2xl tracking-[-0.02em]">{t(profile.nameKey)}</h3>
                      <span className="font-mono text-[10px] text-muted-foreground">0{index + 2}</span>
                    </div>
                    <ProfileMeta role={t(profile.roleKey)} />
                    <p className="mt-4 max-w-[30ch] text-sm leading-relaxed text-muted-foreground">{t("team.profileBio")}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </section>

          <Reveal className="grid gap-8 border-t border-border pt-16 md:grid-cols-2 md:gap-16 md:pt-24">
            <div>
              <p className="lp-eyebrow">{t("team.missionLabel")}</p>
              <h2 className="mt-4 max-w-[15ch] font-cooper text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] tracking-[-0.04em]">{t("team.missionTitle")}</h2>
            </div>
            <p className="max-w-[43ch] self-end text-[17px] leading-relaxed text-muted-foreground">{t("team.missionBody")}</p>
          </Reveal>

          <Reveal className="mt-20 border-y border-border py-16 sm:mt-28 sm:py-20" delay={80}>
            <section id="team-contact" aria-labelledby="team-contact-heading" className="md:flex md:items-end md:justify-between md:gap-12">
              <div>
                <p className="lp-eyebrow">{t("team.hiringLabel")}</p>
                <h2 id="team-contact-heading" className="mt-4 max-w-[15ch] font-cooper text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.03em]">{t("team.hiringTitle")}</h2>
                <p className="mt-5 max-w-[43ch] text-[16px] leading-relaxed text-muted-foreground">{t("team.hiringBody")}</p>
              </div>
              <Link className="lp-focus group mt-8 inline-flex min-h-6 w-fit items-center gap-2 text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground md:mt-0" href="/pricing">
                {t("team.hiringCta")} <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">↗</span>
              </Link>
            </section>
          </Reveal>
        </Shell>
      </div>
    </MarketingShell>
  );
}
