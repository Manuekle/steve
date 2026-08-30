"use client";

import type { ReactNode } from "react";
import { Clause } from "@/app/landing/_components/legal-page";
import { MarketingShell, PageHeader } from "@/app/landing/_components/marketing-shell";
import { Shell } from "@/app/landing/_components/primitives";
import { useT } from "@/lib/i18n/provider";

/**
 * A block of shell commands. Not run through the dictionary — commands,
 * flags and env var names are the same in every locale, only the prose
 * around them changes.
 */
function CodeBlock({ children }: { readonly children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}

/**
 * The install-and-configure guide.
 *
 * One clause per piece of the app, in the order you'd actually touch them:
 * what the machine needs, how to bring it up locally, the live checks the
 * app itself runs, then where each feature — database, model, channels,
 * knowledge base, agents, ads, tracing, production — gets configured once
 * it's running. Every fact here is checkable against README.md and the
 * pages it describes; nothing is aspirational.
 */
export function Guide() {
  const t = useT();

  return (
    <MarketingShell>
      <PageHeader
        eyebrow={t("legal.updatedOn", { updated: t("guide.updated") })}
        title={t("guide.title")}
        titleClassName="font-cooper"
        lede={t("guide.lede")}
      />

      <section className="py-16 sm:py-20">
        <Shell>
          <div className="max-w-[72ch]">
            <Clause title={t("guide.audience.title")}>
              <p>{t("guide.audience.body")}</p>
            </Clause>

            <Clause title={t("guide.requirements.title")}>
              <p>{t("guide.requirements.body")}</p>
            </Clause>

            <Clause title={t("guide.localInstall.title")}>
              <p>{t("guide.localInstall.p1")}</p>
              <CodeBlock>{`corepack enable
pnpm install --frozen-lockfile --strict-peer-dependencies
cp .env.example .env`}</CodeBlock>
              <p>{t("guide.localInstall.p2")}</p>
              <p>{t("guide.localInstall.p3")}</p>
              <CodeBlock>{`pnpm db:up
pnpm db:migrate
pnpm dev`}</CodeBlock>
              <p>{t("guide.localInstall.p4")}</p>
            </Clause>

            <Clause title={t("guide.liveSetup.title")}>
              <p>{t("guide.liveSetup.p1")}</p>
              <p>{t("guide.liveSetup.p2")}</p>
            </Clause>

            <Clause title={t("guide.database.title")}>
              <p>{t("guide.database.body")}</p>
            </Clause>

            <Clause title={t("guide.aiModel.title")}>
              <p>{t("guide.aiModel.body")}</p>
            </Clause>

            <Clause title={t("guide.channels.title")}>
              <p>{t("guide.channels.body")}</p>
            </Clause>

            <Clause title={t("guide.knowledge.title")}>
              <p>{t("guide.knowledge.body")}</p>
            </Clause>

            <Clause title={t("guide.agentsAutomations.title")}>
              <p>{t("guide.agentsAutomations.body")}</p>
            </Clause>

            <Clause title={t("guide.ads.title")}>
              <p>{t("guide.ads.body")}</p>
            </Clause>

            <Clause title={t("guide.observability.title")}>
              <p>{t("guide.observability.body")}</p>
              <CodeBlock>{`docker compose --profile observability up -d jaeger
# .env
OTEL_EXPORTER_OTLP_ENDPOINT="http://127.0.0.1:4318"`}</CodeBlock>
              <p>{t("guide.observability.p2")}</p>
            </Clause>

            <Clause title={t("guide.deployment.title")}>
              <p>{t("guide.deployment.body")}</p>
            </Clause>
          </div>
        </Shell>
      </section>
    </MarketingShell>
  );
}
