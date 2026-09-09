"use client";

/**
 * The scenes on the self-hosted cards.
 *
 * Same grammar as `capability-art.tsx` and the same kit — a small built
 * interface, still at rest, resolving under the cursor. What differs is the
 * subject: these six are the things the software does to be trustworthy rather
 * than the things it does for a customer, so every one of them is a guarantee
 * and every guarantee is a line of code.
 *
 * ── Each card names a file, and the file is real ─────────────────────
 *
 *   database  the durable state lives in the operator's own Postgres
 *   sandbox   agent/sandbox — `networkPolicy: "deny-all"` on both runtimes
 *   webhooks  lib/stripe.ts `verifyStripeWebhookSignature`, and the same
 *             scheme in lib/elevenlabs-agents.ts; Meta's channels verify an
 *             HMAC over the raw body with the App Secret
 *   keys      credentials are read on the operator's machine, not a panel
 *   allowlist lib/http-guard.ts `assertSafeUrl` — HTTPS, public host, named
 *             in the allowlist, no loopback, no private range, no raw IP
 *   traces    agent/instrumentation.ts, OpenTelemetry to the operator's
 *             own collector
 *
 * A security section is the one place on a landing page where an unearned
 * claim is not a stretch but a lie, so nothing here is written ahead of the
 * code. If a guarantee moves, its card moves with it.
 */

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Cancel01Icon,
  Database01Icon,
  GlobalIcon,
  AuthorizedIcon,
  LockKeyIcon,
  SourceCodeIcon,
  Tick02Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { at, Bloom, Brackets, Chip, Figure, Mono, Plate, Row, Scene, SwapPlate } from "./scene-kit";

// ── 01 · Tu base de datos ───────────────────────────────────────────

/**
 * Rows landing in a table that belongs to the operator.
 *
 * The claim is ownership, not capacity, so the scene is small and the label is
 * the connection string's host — `localhost`, because that is where it is when
 * you run it yourself.
 */
export function DatabaseScene() {
  return (
    <Scene>
      {/* On the connection, because that is the claim: the light is on the
          host name, and the tables under it are just what fills. */}
      <Bloom className="-top-2 left-2 h-28 w-48" />

      <div className="space-y-2">
        <Row>
          <Plate active className="size-7" icon={Database01Icon} tint="blue" />
          <Mono className="min-w-0 flex-1 truncate text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
            postgres://localhost
          </Mono>
        </Row>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((row) => (
            <span
              className="h-6 flex-1 rounded-md bg-[var(--lp-glass)] opacity-50 shadow-[inset_0_0_0_1px_var(--lp-glass-edge)] transition-opacity duration-500 group-hover:opacity-100"
              key={row}
              style={at(row * 90)}
            />
          ))}
        </div>
      </div>
    </Scene>
  );
}

// ── 02 · Sandbox aislado ────────────────────────────────────────────

/**
 * Code running with the network cut.
 *
 * The interesting half is the denial, so the globe is what changes: at rest it
 * is simply there, on hover it is struck out and the policy names itself. The
 * string is `deny-all` verbatim because that is the value in the config.
 */
export function SandboxScene() {
  return (
    <Scene>
      {/* The light is on the code, and it stops at the globe — which is the
          whole guarantee drawn as lighting: one object in the beam, the other
          one out of it. */}
      <Bloom className="-translate-x-1/2 -translate-y-1/2 top-[2rem] left-[calc(50%-1.6rem)] h-28 w-28" />

      <div className="flex flex-col items-center gap-3">
        <div className="relative flex items-center gap-5 px-5 py-2">
          <Brackets className="inset-x-0 inset-y-0" />
          <Plate active className="size-12 rounded-xl" icon={SourceCodeIcon} size={21} tint="violet" />
          <span className="relative flex size-12 items-center justify-center">
            <span className="lp-plate flex size-12 items-center justify-center rounded-xl text-muted-foreground transition-opacity duration-500 group-hover:opacity-30">
              <HugeiconsIcon icon={GlobalIcon} size={21} strokeWidth={1.75} />
            </span>
            <span
              className="absolute inset-0 flex items-center justify-center text-foreground opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={at(160)}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={2.25} />
            </span>
          </span>
        </div>
        <Chip
          className="translate-y-2 text-muted-foreground opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100"
          icon={LockKeyIcon}
          style={at(240)}
        >
          networkPolicy: deny-all
        </Chip>
      </div>
    </Scene>
  );
}

// ── 03 · Webhooks firmados ──────────────────────────────────────────

/**
 * A payload arriving with a signature, and the signature checking out.
 *
 * The comparison is the whole point — `timingSafeEqual` over an HMAC of the
 * raw body — so the scene shows two digests meeting rather than a padlock.
 * A padlock is a mood; two hashes lining up is the mechanism.
 */
export function WebhookScene() {
  return (
    <Scene>
      {/* Low and under the second row: the signature check is the half that
          matters, so the light is where the digests meet. */}
      <Bloom className="-bottom-6 left-0 h-32 w-56 opacity-50 transition-opacity duration-700 group-hover:opacity-100" />

      <div className="space-y-2">
        <Row>
          <Plate active className="size-7" icon={WebhookIcon} tint="emerald" />
          <Mono className="min-w-0 flex-1 truncate text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
            POST /api/webhooks
          </Mono>
        </Row>
        {/* The digest at display size, cut out of the dark. It is the thing
            being compared, so it is drawn as the object of the scene rather
            than as a 10px label in a row — the same move the payments card
            makes with its amount, for the same reason. */}
        <div className="relative pt-2">
          <span className="flex items-center gap-3">
            <SwapPlate className="size-7" delay={220} from={LockKeyIcon} to={Tick02Icon} />
            <Mono className="text-muted-foreground">sha256</Mono>
          </span>

          <span className="block">
            <Figure className="mt-1 block truncate font-mono text-[1.75rem] tracking-[-0.02em]" muted>
              a3f1…
            </Figure>
            <span className="relative mt-2 block h-3.5">
              <Mono className="absolute inset-0 text-muted-foreground transition-opacity duration-500 group-hover:opacity-0">
                verificando…
              </Mono>
              <Mono
                className="absolute inset-0 text-muted-foreground opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={at(300)}
              >
                firma válida
              </Mono>
            </span>
          </span>
        </div>
      </div>
    </Scene>
  );
}

// ── 04 · Tus claves ─────────────────────────────────────────────────

/**
 * The keys, and where they are not.
 *
 * "On your machine" is a negative claim — it is about the panel that does not
 * hold them — so the scene states the path instead of drawing a vault.
 */
export function KeysScene() {
  return (
    <Scene>
      {/* The sparsest scene in either grid — one object and one path — so it
          is the one composed most like the reference: a single thing, lit from
          directly above, with the frame marked around it and nothing else in
          the light. */}
      <div className="relative flex flex-col items-center gap-3 py-2">
        <Brackets className="-inset-x-6 -inset-y-1" />
        <Bloom className="-translate-x-1/2 -top-6 left-1/2 h-28 w-36" />

        <Plate active className="size-10 rounded-xl" icon={AuthorizedIcon} size={18} tint="amber" />
        <Chip
          className="text-muted-foreground opacity-60 transition-all duration-500 group-hover:text-muted-foreground group-hover:opacity-100"
          style={at(140)}
        >
          ~/.senka · tu servidor
        </Chip>
      </div>
    </Scene>
  );
}

// ── 05 · Allowlist de hosts ─────────────────────────────────────────

/**
 * Two outbound calls: the one that is allowed and the one that is not.
 *
 * Both hosts are shown at rest with nothing decided, and hover is the guard
 * running — a tick on the named host, a cross on the other. Drawing only the
 * allowed call would make the allowlist look like a convenience; the refusal
 * is the feature.
 */
export function AllowlistScene() {
  const hosts = [
    { allowed: true, name: "api.tu-tienda.com" },
    { allowed: false, name: "10.0.0.5" },
  ];

  return (
    <Scene>
      {/* On the host that passes. The refused one sits outside the light,
          which is the same argument the copy makes. */}
      <Bloom className="-top-4 left-0 h-28 w-52" />

      <div className="space-y-2">
        {hosts.map((host, index) => (
          <Row
            className={`transition-colors duration-500 ${host.allowed ? "group-hover:border-input" : ""}`}
            key={host.name}
            style={at(index * 90)}
          >
            <SwapPlate
              className="size-7"
              delay={180 + index * 90}
              from={GlobalIcon}
              tint="cyan"
              to={host.allowed ? Tick02Icon : Cancel01Icon}
            />
            <Mono
              className={`min-w-0 flex-1 truncate transition-all duration-500 ${
                host.allowed
                  ? "text-muted-foreground group-hover:text-foreground"
                  : "text-muted-foreground group-hover:line-through group-hover:opacity-50"
              }`}
              style={at(200 + index * 90)}
            >
              {host.name}
            </Mono>
          </Row>
        ))}
      </div>
    </Scene>
  );
}

// ── 06 · Trazas propias ─────────────────────────────────────────────

/**
 * A trace drawing itself across the operator's own collector.
 *
 * Spans of different lengths at different offsets, because that is what a
 * waterfall looks like and a row of equal bars looks like a chart. They fill
 * left to right on hover, in the order they would have been recorded.
 */
export function TracesScene() {
  const spans = [
    { left: 0, width: 100 },
    { left: 12, width: 62 },
    { left: 30, width: 38 },
    { left: 46, width: 20 },
  ];

  return (
    <Scene>
      <Bloom className="-translate-y-1/2 top-[0.9rem] left-[-1rem] h-24 w-32" />

      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <Plate active className="size-7" icon={SourceCodeIcon} tint="rose" />
          <Mono className="text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
            OpenTelemetry
          </Mono>
        </div>
        <div className="space-y-1.5">
          {spans.map((span, index) => (
            <span className="block h-2" key={span.left} style={{ paddingLeft: `${span.left}%` }}>
              <span
                className="block h-full origin-left scale-x-0 rounded-full bg-foreground/20 transition-all duration-500 group-hover:scale-x-100 group-hover:bg-foreground/45"
                style={{ ...at(index * 90), width: `${span.width}%` }}
              />
            </span>
          ))}
        </div>
      </div>
    </Scene>
  );
}

export const SECURITY_ART: Record<string, () => ReactNode> = {
  database: DatabaseScene,
  sandbox: SandboxScene,
  webhooks: WebhookScene,
  keys: KeysScene,
  allowlist: AllowlistScene,
  traces: TracesScene,
};
