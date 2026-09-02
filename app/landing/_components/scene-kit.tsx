"use client";

/**
 * The pieces every landing scene is built from.
 *
 * Extracted the moment a second family of scenes appeared (the security cards
 * next to the capability ones). Two files with their own private copy of
 * `Plate` and `Row` is two card languages that look identical on the day they
 * are written and drift by the second edit — the page has one set of surfaces
 * and this is it.
 *
 * The vocabulary is deliberately small: a raised plate for an icon, a recessed
 * row for a record, a pill for a status, mono for a label, and a wash for the
 * edge a scene runs off. Anything a scene needs beyond these five is either a
 * one-off worth writing inline, or a sixth piece that belongs here.
 *
 * ── The motion contract ──────────────────────────────────────────────
 *
 * Everything animates on `group-hover` and nothing animates on its own. The
 * resting frame is the *before* and hover plays the *after*, so a card is
 * never mid-thought when still. `prefers-reduced-motion` cuts every transition
 * in globals.css, which leaves that resting frame — already complete.
 */

import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import type { CSSProperties, ReactNode } from "react";

/**
 * The stage's contents.
 *
 * In flow, not absolutely positioned. It used to be `absolute inset-0`, which
 * meant a scene taller than its stage simply overflowed and got sliced by the
 * card — rows cut through the middle, a calendar with its last week missing, a
 * fade pressed into service as a lid on content that was never meant to run
 * off. Half the section looked like a screenshot that had been cropped wrong,
 * and no amount of edge treatment fixes that.
 *
 * Now the stage grows to hold what is in it and the row equalises the cards
 * beside it. A scene that wants to bleed says so by asking for a fade; a scene
 * that does not, fits.
 *
 * The horizontal inset is here rather than in each scene: twelve scenes each
 * choosing their own is twelve chances for one to be four pixels out of line
 * with the heading above it.
 */
export function Scene({ children }: { readonly children: ReactNode }) {
  return <div className="flex h-full w-full flex-col justify-center px-7">{children}</div>;
}

/** Shorthand for the one inline style every animated part of a scene needs. */
export function at(ms: number): CSSProperties {
  return { transitionDelay: `${ms}ms` };
}

/**
 * The raised plate an icon sits on — `--muted` with the app's inset bevel and
 * a drop, the same treatment the sidebar and the KPI cards use. `active` lifts
 * it to full contrast on hover, for the one plate a scene is about.
 */
export function Plate({
  active,
  className = "",
  icon,
  size = 14,
}: {
  readonly active?: boolean;
  readonly className?: string;
  readonly icon: IconSvgElement;
  readonly size?: number;
}) {
  return (
    <span
      className={`lp-plate flex shrink-0 items-center justify-center rounded-[10px] transition-colors duration-500 ${
        active ? "text-muted-foreground group-hover:text-foreground" : "text-muted-foreground/70"
      } ${className}`}
    >
      <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} />
    </span>
  );
}

/**
 * A plate that swaps its icon on hover, cross-faded in place. Half these
 * scenes turn on exactly this — a file becoming a tick, a timer becoming an
 * alarm — and doing it by hand each time is four elements and two delays that
 * drift apart.
 */
export function SwapPlate({
  className = "",
  delay = 0,
  from,
  size = 14,
  to,
}: {
  readonly className?: string;
  readonly delay?: number;
  readonly from: IconSvgElement;
  readonly size?: number;
  readonly to: IconSvgElement;
}) {
  return (
    <span className={`relative shrink-0 ${className}`}>
      <Plate
        className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-0"
        icon={from}
        size={size}
      />
      <span
        className="lp-plate absolute inset-0 flex items-center justify-center rounded-[10px] text-foreground opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={at(delay)}
      >
        <HugeiconsIcon icon={to} size={size} strokeWidth={2} />
      </span>
    </span>
  );
}

/** A recessed row — the shape of a contact, a document, a booking. */
export function Row({
  children,
  className = "",
  style,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  return (
    <div
      className={`lp-panel flex items-center gap-3 rounded-xl px-3.5 py-3 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** A pill. The status the scene is arguing for, usually arriving on hover. */
export function Chip({
  children,
  className = "",
  icon,
  style,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly icon?: IconSvgElement;
  readonly style?: CSSProperties;
}) {
  return (
    <span
      className={`lp-panel inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] ${className}`}
      style={style}
    >
      {icon ? <HugeiconsIcon icon={icon} size={11} strokeWidth={2.25} /> : null}
      {children}
    </span>
  );
}

/** Mono micro-copy, the size every scene labels itself at. */
export function Mono({
  children,
  className = "",
  style,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  return (
    <span className={`font-mono text-[10px] ${className}`} style={style}>
      {children}
    </span>
  );
}

/**
 * The washes that dissolve a scene into the card at the edges it runs off.
 *
 * Both edges, not just the bottom. A scene is a fragment of a longer interface
 * — a list that continues, a week with more days in it — and cutting it off
 * with a hard line says "cropped screenshot" where the fade says "there is
 * more of this". Which edge a card needs depends on where its copy sits, so a
 * scene asks for the one it wants rather than getting both by default.
 */
export function FadeBottom() {
  return <div className="lp-fade-b pointer-events-none absolute inset-x-0 bottom-0 z-30 h-10" />;
}

export function FadeTop() {
  return <div className="lp-fade-t pointer-events-none absolute inset-x-0 top-0 z-30 h-9" />;
}

