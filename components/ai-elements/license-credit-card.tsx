"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { SenkaMark } from "@/components/icons/senka-mark";
import { useTheme } from "@/components/theme-provider";
import { SPRING_MOUSE } from "@/lib/ease";
import { useHoverCapable } from "@/lib/hooks/use-hover-capable";
import { useI18n } from "@/lib/i18n/provider";
import type { LicenseInfo } from "@/lib/license/types";
import { cn } from "@/lib/utils";

// The Enterprise license, drawn as the card it is.
//
// Everything on the face is embossed rather than labelled: a wordmark, the
// edition, the chip, the id as a card number, who it was issued to and when it
// runs out. Nothing else. The status, the countdown and the maintenance date
// are text under the card (license-card.tsx) — putting them on the face turned
// a card into a dashboard.
//
// The card adapts to both light and dark themes: dark mode uses a deep charcoal
// gradient, while light mode uses a warm off-white card stock. Text colors
// invert accordingly.
//
// Nothing here gates anything — see lib/license/verify.ts. This is a picture
// of a fact, not a check.

export type LicenseCardTone = "valid-active" | "valid-inactive" | "missing" | "invalid";

export function licenseTone(info: LicenseInfo | null): LicenseCardTone {
  if (!info) return "missing";
  if (info.status === "missing") return "missing";
  if (info.status !== "valid") return "invalid";
  return info.maintenanceActive ? "valid-active" : "valid-inactive";
}

/** How far the card leans, in degrees, at the edge of a full drag. */
const MAX_TILT = 22;
/** Drag pixels per degree of lean. A whole card-width of travel ≈ full tilt. */
const DRAG_TO_DEG = 0.13;
/** Lean from hover alone, which should read as lighter than a drag. */
const HOVER_TILT = 11;

const SPRING_TILT = { stiffness: 260, damping: 22, mass: 0.5 } as const;
const SPRING_FLIP = { type: "spring", stiffness: 220, damping: 26, mass: 0.7 } as const;
const DRAG_RETURN = { bounceStiffness: 320, bounceDamping: 26 } as const;

/** Dark-mode card body. Pure neutral, on the same greys as the app's dark surfaces
 *  (`--background` 0.155, `--card` 0.18, `--accent` 0.23 in app/globals.css). */
const FACE_BACKGROUND_DARK =
  "radial-gradient(115% 125% at 10% -15%, oklch(0.3 0 0) 0%, transparent 58%)," +
  "linear-gradient(160deg, oklch(0.235 0 0) 0%, oklch(0.14 0 0) 55%, oklch(0.19 0 0) 100%)";

/** Light-mode card body. Warm off-white card stock with subtle depth. */
const FACE_BACKGROUND_LIGHT =
  "radial-gradient(115% 125% at 10% -15%, oklch(0.97 0 0) 0%, transparent 58%)," +
  "linear-gradient(160deg, oklch(0.96 0 0) 0%, oklch(0.92 0 0) 55%, oklch(0.94 0 0) 100%)";

/** Guilloché: two hairline gratings crossing at a shallow angle, fine enough
 *  that they read as a milled surface rather than as stripes. */
const FACE_ENGRAVING_DARK =
  "repeating-linear-gradient(72deg, oklch(1 0 0 / 0.035) 0 1px, transparent 1px 7px)," +
  "repeating-linear-gradient(-63deg, oklch(1 0 0 / 0.022) 0 1px, transparent 1px 11px)";

const FACE_ENGRAVING_LIGHT =
  "repeating-linear-gradient(72deg, oklch(0 0 0 / 0.04) 0 1px, transparent 1px 7px)," +
  "repeating-linear-gradient(-63deg, oklch(0 0 0 / 0.025) 0 1px, transparent 1px 11px)";

/** Chip contact pads, drawn rather than imported — it is eight rectangles, and
 *  it is the one thing on the face that says "card" without a word. */
function Chip() {
  return (
    <svg viewBox="0 0 44 34" aria-hidden className="h-[22px] w-[29px]">
      <defs>
        <linearGradient id="license-chip" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.86 0 0)" />
          <stop offset="42%" stopColor="oklch(0.72 0 0)" />
          <stop offset="100%" stopColor="oklch(0.55 0 0)" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="43" height="33" rx="5" fill="url(#license-chip)" />
      <g stroke="oklch(0.32 0 0 / 0.55)" strokeWidth="1.1" fill="none">
        <path d="M0 11h13M31 11h13M0 23h13M31 23h13" />
        <rect x="13" y="6" width="18" height="22" rx="3" />
        <path d="M22 6v22" />
      </g>
    </svg>
  );
}

/** UUID in, card number out: the first 16 hex digits in groups of four.
 *  A full UUID across a card face sets 32 characters in a line and stops
 *  looking like a number anyone could read back over the phone. The whole id
 *  is on the back, where there is room for it. */
function cardNumber(licenseId: string | undefined): string {
  if (!licenseId) return "•••• •••• •••• ••••";
  const flat = licenseId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 16).padEnd(16, "•");
  return flat.replace(/(.{4})(?=.)/g, "$1 ");
}

/** MM/YY, the way it is embossed on a card. `Intl` will not be pinned to two
 *  digits here — `{ month: "2-digit", year: "2-digit" }` still resolves to a
 *  bare "2/27" in es-AR — and a card that reads 2/27 in one locale and 02/27
 *  in another is not a card, it is a date field. */
function monthYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "––/––";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${month}/${String(date.getFullYear()).slice(-2)}`;
}

export function LicenseCreditCard({
  info,
  installationId,
  className,
}: {
  readonly info: LicenseInfo | null;
  readonly installationId: string | null;
  readonly className?: string;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && theme === "dark";
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const node = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  /** Set while a drag is in flight so the release does not also read as a
   *  click and flip the card the user was only moving. */
  const dragging = useRef(false);

  const payload = info?.payload ?? null;
  const interactive = !reduce;

  // ── Physics ──
  // x/y are the drag offset; hoverX/hoverY are the pointer's position inside
  // the card, -1..1. Both feed the same two rotations, so a card being
  // dragged and a card being hovered lean the same way and never fight.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const hoverX = useMotionValue(0);
  const hoverY = useMotionValue(0);

  const clampTilt = (value: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, value));
  const rotateY = useSpring(
    useTransform([x, hoverX], ([dx, hx]: number[]) => clampTilt(dx * DRAG_TO_DEG + hx * HOVER_TILT)),
    SPRING_TILT,
  );
  const rotateX = useSpring(
    useTransform([y, hoverY], ([dy, hy]: number[]) => clampTilt(-(dy * DRAG_TO_DEG) - hy * HOVER_TILT)),
    SPRING_TILT,
  );
  // A dragged card leans into the direction it is thrown. Small, and only
  // from horizontal travel — roll from vertical drag reads as a glitch.
  const rotateZ = useSpring(
    useTransform(x, (dx: number) => Math.max(-5, Math.min(5, dx * 0.022))),
    SPRING_MOUSE,
  );

  // The cast shadow moves opposite the lean, so the card looks lit from one
  // fixed place rather than carrying its own lamp around. It belongs on the
  // faces, not on the wrapper: a shadow on the wrapper never turns, so the
  // flip left a flat rectangle hanging in the air behind the moving card.
  const shadowX = useTransform(rotateY, [-MAX_TILT, MAX_TILT], [18, -18]);
  const shadowY = useTransform(rotateX, [-MAX_TILT, MAX_TILT], [8, 28]);
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 40px -18px oklch(0 0 0 / 0.5), 0 2px 5px oklch(0 0 0 / 0.2)`;

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive || !canHover || dragging.current) return;
      const rect = node.current?.getBoundingClientRect();
      if (!rect) return;
      hoverX.set(((event.clientX - rect.left) / rect.width) * 2 - 1);
      hoverY.set(((event.clientY - rect.top) / rect.height) * 2 - 1);
    },
    [canHover, hoverX, hoverY, interactive],
  );

  const onPointerLeave = useCallback(() => {
    hoverX.set(0);
    hoverY.set(0);
  }, [hoverX, hoverY]);

  /** Both faces share the surface: gradient, milling, the bevel hairline along
   *  the top edge, and the inset ring. Nothing on it moves — the roaming
   *  radial highlight that used to ride the tilt read as a spotlight sweeping
   *  the card rather than as a card catching the light. */
  const faceBg = isDark ? FACE_BACKGROUND_DARK : FACE_BACKGROUND_LIGHT;
  const engraving = isDark ? FACE_ENGRAVING_DARK : FACE_ENGRAVING_LIGHT;
  const textPrimary = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-white/40" : "text-neutral-500";
  const textSubtle = isDark ? "text-white/45" : "text-neutral-600";
  const textBody = isDark ? "text-white/90" : "text-neutral-800";
  const textSoft = isDark ? "text-white/85" : "text-neutral-700";
  const textFaint = isDark ? "text-white/70" : "text-neutral-600";
  const iconColor = isDark ? "text-white" : "text-neutral-900";
  const iconGhost = isDark ? "text-white/25" : "text-neutral-400";
  const face = cn(
    "absolute inset-0 overflow-hidden rounded-[14px] [backface-visibility:hidden]",
    textPrimary,
  );
  const surface = (
    <>
      <div className="pointer-events-none absolute inset-0" style={{ background: engraving }} />
      <div className={cn(
        "pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
        isDark ? "via-white/30" : "via-black/20",
      )} />
      <div className={cn(
        "pointer-events-none absolute inset-0 rounded-[14px] ring-1 ring-inset",
        isDark ? "ring-white/10" : "ring-black/10",
      )} />
    </>
  );

  return (
    <div className={cn("select-none", className)}>
      <div className="[perspective:1200px]">
        <motion.div
          ref={node}
          drag={interactive}
          dragSnapToOrigin
          dragElastic={0.16}
          dragMomentum={false}
          dragTransition={DRAG_RETURN}
          whileDrag={{ scale: 1.03, cursor: "grabbing" }}
          onDragStart={() => {
            dragging.current = true;
            hoverX.set(0);
            hoverY.set(0);
          }}
          onDragEnd={() => {
            // One frame is not enough — the synthetic click lands after the
            // pointerup that ends the drag, so the flag has to outlive it.
            setTimeout(() => {
              dragging.current = false;
            }, 60);
          }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onClick={() => {
            // Pointer users flip by clicking the card itself; keyboard and
            // screen-reader users get the real button under it. Making the
            // card a role="button" instead put the copy control on its back
            // inside another button, which is a thing no assistive tech can
            // describe.
            if (dragging.current) return;
            setFlipped((open) => !open);
          }}
          style={{ x, y, rotateX, rotateY, rotateZ, transformStyle: "preserve-3d" }}
          className={cn(
            "relative mx-auto aspect-[1.586] w-full max-w-[23rem] touch-none",
            interactive ? "cursor-grab" : "cursor-pointer",
          )}
        >
          <motion.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : SPRING_FLIP}
            style={{ transformStyle: "preserve-3d" }}
            className="absolute inset-0"
          >
            {/* ── Front ── */}
            <motion.div style={{ background: faceBg, boxShadow }} className={face}>
              {surface}

              <div className="relative flex h-full flex-col justify-between p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <SenkaMark className={cn("h-[18px] w-[15px]", iconColor)} />
                    <span className={cn("font-heading text-[14px] leading-none font-semibold tracking-tight", textPrimary)}>
                      senka
                    </span>
                  </span>
                  <p className={cn("truncate text-[11px]", textSubtle)}>
                    {payload?.edition ?? t("license.card.noHolder")}
                  </p>
                </div>

                <Chip />

                <p className={cn("font-mono text-[15px] tracking-[0.16em] tabular-nums", textBody)}>
                  {cardNumber(payload?.licenseId)}
                </p>

                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className={cn("text-[9px]", textMuted)}>{t("license.card.holder")}</p>
                    <p className={cn("mt-1 truncate text-[12px] tracking-wide", textBody)}>
                      {payload?.company ?? "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-[9px]", textMuted)}>{t("license.card.validThru")}</p>
                    <p className={cn("mt-1 font-mono text-[12px] tabular-nums", textBody)}>
                      {payload ? monthYear(payload.maintenanceUntil) : "––/––"}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ── Back ── */}
            <motion.div
              style={{ background: faceBg, boxShadow }}
              className={cn(face, "[transform:rotateY(180deg)]")}
            >
              {surface}

              <div className="relative flex h-full flex-col">
                <div className={cn(
                  "mt-5 h-9 w-full shadow-[inset_0_1px_0_oklch(1_0_0/0.06)]",
                  isDark
                    ? "bg-gradient-to-b from-black/85 via-black/95 to-black/80"
                    : "bg-gradient-to-b from-neutral-800/90 via-neutral-900/95 to-neutral-800/90",
                )} />

                <div className="flex min-h-0 flex-1 flex-col justify-center gap-3.5 px-5">
                  {/* Reference only. Copying the installation id happens where
                      it is actually needed — inside "replace this license", next
                      to the box you paste the new token into. */}
                  <div>
                    <p className={cn("text-[9px]", textMuted)}>
                      {t("settings.license.installationIdLabel")}
                    </p>
                    <p className={cn("mt-1 font-mono text-[11px] break-all", textSoft)}>
                      {installationId ?? "…"}
                    </p>
                  </div>

                  <div>
                    <p className={cn("text-[9px]", textMuted)}>{t("license.card.licenseId")}</p>
                    <p className={cn("mt-1 font-mono text-[11px] break-all", textFaint)}>
                      {payload?.licenseId ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end px-5 pb-5">
                  <SenkaMark className={cn("h-[15px] w-[13px]", iconGhost)} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <button
          type="button"
          aria-pressed={flipped}
          onClick={() => setFlipped((open) => !open)}
          className="rounded-md px-1.5 py-0.5 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t(flipped ? "license.card.showFront" : "license.card.showBack")}
        </button>
        {interactive ? <span>· {t("license.card.dragHint")}</span> : null}
      </div>
    </div>
  );
}
