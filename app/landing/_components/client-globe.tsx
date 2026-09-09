"use client";

import createGlobe from "cobe";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useStageLive } from "./demo-cursor";

/**
 * A client, placed on the world. `id` is the cobe marker id; `name` and `logo`
 * are what the rail under the globe sets, not anything drawn on the canvas.
 */
export type GlobeClient = {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly logo?: string;
  readonly name: string;
};

/** Whether `<html>` currently carries `.dark` — `ThemeProvider` toggles this
 *  class directly rather than following `prefers-color-scheme`, so a media
 *  query alone would miss a manual switch. Watched rather than read once:
 *  the globe should recolour the moment `ThemeToggle` flips it, not only on
 *  the next mount. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

/** Grayscale only — no accent invented for a globe the rest of the page has no
 *  colour on. `dark` is cobe's own land/ocean contrast dial rather than a
 *  colour, so it sits in here with the two that are: on this page's near-black
 *  ground the sphere is a hole and the dots are the object, and on white it is
 *  the other way round. */
function palette(dark: boolean): {
  baseColor: [number, number, number];
  dark: number;
  glowColor: [number, number, number];
  mapBrightness: number;
} {
  return {
    baseColor: dark ? [0.28, 0.28, 0.28] : [1, 1, 1],
    dark: dark ? 1 : 0,
    // The atmosphere. Kept well under cobe's own demo value, because a rim is
    // a proportion of a radius: what reads as a highlight on the 600px globe
    // in the docs is, at this size, a white ring with a planet inside it.
    glowColor: dark ? [0.12, 0.12, 0.12] : [1, 1, 1],
    mapBrightness: dark ? 8 : 6,
  };
}

/**
 * The globe. Cobe draws the sphere, the dot-mapped landmass and a pin per
 * client, and that is all this draws.
 *
 * It used to hang a wordmark off every pin, anchored to the marker's live
 * screen position through cobe's CSS Anchor Positioning support. The rail
 * under the section names the clients now, and two lists of the same names in
 * one section is one list too many — the pins say "here", the rail says who,
 * and neither has to shout over the other. It also took the labels' one real
 * problem with it: clients cluster, six businesses in one region put their
 * pins within a few dozen pixels of each other, and six labels hanging off
 * that stack into an unreadable pile.
 *
 * Cobe draws one frame per `update()` and runs no loop of its own, so the
 * `requestAnimationFrame` below is not the animation — it is the rendering.
 * This component used to pass an `onRender` callback instead, which is cobe
 * v1's API: v2 ignores it, so the globe was drawn exactly once, at creation —
 * and the land map is a data-URI image that has not finished decoding by then.
 * The only frame ever drawn was the one with an empty land texture, which is
 * why the section showed a featureless ball with markers floating on it.
 */
export function ClientGlobe({
  className,
  clients,
}: {
  /**
    * How big the sphere is and where it sits — the caller's decision, because
    * the globe is not always a square in a column. On the proof section it is
    * half off the right edge of the page, which is a size and an offset this
    * component has no way to know and no business hard-coding.
    *
    * Whatever is passed has to resolve to a square: the canvas is sized from
    * `clientWidth` in both directions, so a wrapper wider than it is tall gets
    * a sphere cropped top and bottom rather than an ellipse.
    */
  readonly className?: string;
  readonly clients: readonly GlobeClient[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<{ x: number; y: number; phi: number; theta: number } | null>(null);
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3);
  // The frame loop reads these every frame; refs rather than closing over the
  // values from render, so the loop set up once in the effect below always
  // sees the current ones instead of those from the mount it started in.
  const live = useStageLive(wrapRef);
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  const dark = useIsDark();
  const darkRef = useRef(dark);
  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let size = wrap.clientWidth;
    // Set whenever something other than the rotation changes what a frame
    // would look like — the theme, the size, the map finishing its decode — so
    // a globe that is holding still still redraws when it has a reason to.
    let dirty = true;

    // CSS pixels, not buffer pixels — which is one step off the snippet in
    // cobe's docs, deliberately. That snippet pairs `width: 600 * 2` with
    // `devicePixelRatio: 2`, and cobe then does `canvas.width = width * dpr`
    // itself: the retina doubling lands twice, and a 600px globe gets a
    // 2400×2400 buffer. On a 600px demo that is merely wasteful. This globe is
    // 62rem across, where the same arithmetic is a 16-megapixel buffer redrawn
    // every frame — so `width` is the CSS size and `devicePixelRatio` does the
    // scaling, once.
    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size,
      height: size,
      phi: 0,
      theta: 0.3,
      diffuse: 0.0,
      mapSamples: 20000,
      scale: 1,
      offset: [0, 0],
      markerColor: [0.95, 0.95, 0.95],
      markers: clients.map((client) => ({
        location: [client.lat, client.lng] as [number, number],
        size: 0.02,
        id: client.id,
      })),
      ...palette(darkRef.current),
    });

    // Cobe draws on `update()` and nothing else, so this loop is what puts
    // pixels on the canvas at all — including the first correct frame, which
    // only arrives once the map image has decoded, some milliseconds after
    // creation.
    //
    // What it does *not* do is redraw a globe with no reason to change.
    // `live` is false off screen, in a background tab, and for a visitor who
    // asked for reduced motion — the first two should cost nothing, and the
    // third should still get a globe, just one that holds still. So: a frame
    // whenever the rotation moves, a frame whenever `dirty` says the picture
    // is stale, and an empty callback the rest of the time.
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const moving = liveRef.current;
      const dragging = pointerRef.current !== null;
      if (moving && !dragging) phiRef.current += 0.0028;
      else if (!dirty && !dragging) return;
      dirty = false;
      globe.update({
        phi: phiRef.current,
        theta: thetaRef.current,
        width: size,
        height: size,
        ...palette(darkRef.current),
      });
    };
    draw();

    // The map arrives asynchronously and cobe raises no event for it. A globe
    // that is off screen at mount is not drawing, so it would have no finished
    // frame to show the moment it scrolls into view — one `dirty` on a short
    // timer covers the decode without keeping a loop running for a picture
    // nobody is looking at. It is cheap either way: the image is inlined in
    // cobe's own bundle, so nothing is fetched.
    const warm = window.setTimeout(() => {
      dirty = true;
    }, 400);

    // `ResizeObserver` always fires once right after `observe()`, even with no
    // real change. Skipping the no-op keeps that first callback from marking a
    // fresh frame stale for nothing.
    const resizeObserver = new ResizeObserver(() => {
      const next = wrap.clientWidth;
      if (next === 0 || next === size) return;
      size = next;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      dirty = true;
    });
    resizeObserver.observe(wrap);

    // `useIsDark` above keeps the ref the loop reads up to date; this is the
    // other half of a theme switch — telling a globe that is holding still
    // that its colours just changed under it.
    const themeObserver = new MutationObserver(() => {
      dirty = true;
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    return () => {
      window.clearTimeout(warm);
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      globe.destroy();
    };
    // `clients` is static content read from `content/proof.json` — changing it
    // is a redeploy, not a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInsideGlobe = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2 + 1;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    return dx * dx + dy * dy <= r * r;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isInsideGlobe(e)) return;
    pointerRef.current = { x: e.clientX, y: e.clientY, phi: phiRef.current, theta: thetaRef.current };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerRef.current !== null) {
      const dx = e.clientX - pointerRef.current.x;
      const dy = e.clientY - pointerRef.current.y;
      phiRef.current = pointerRef.current.phi + dx / 200;
      thetaRef.current = Math.max(-0.6, Math.min(0.9, pointerRef.current.theta + dy / 300));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (pointerRef.current !== null) {
      pointerRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  return (
    <div
      className={cn("pointer-events-auto relative aspect-square w-full touch-none select-none", className)}
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerEnter={(e) => {
        if (isInsideGlobe(e as unknown as React.PointerEvent)) {
          (e.currentTarget as HTMLElement).style.cursor = "grab";
        }
      }}
      onPointerMoveCapture={(e) => {
        const inside = isInsideGlobe(e as unknown as React.PointerEvent);
        (e.currentTarget as HTMLElement).style.cursor = inside && !pointerRef.current ? "grab" : pointerRef.current ? "grabbing" : "default";
      }}
    >
      <canvas className="h-full w-full rounded-full" ref={canvasRef} />
      {clients.map((m) => (
        <div
          key={m.id}
          className="pointer-events-none absolute whitespace-nowrap rounded-[4px] border border-border bg-card px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground shadow-[var(--shadow-soft)] backdrop-blur transition-opacity duration-300"
          style={
            {
              positionAnchor: `--cobe-${m.id}`,
              bottom: "anchor(top)",
              left: "anchor(center)",
              translate: "-50% 0",
              marginBottom: "10px",
              opacity: `var(--cobe-visible-${m.id}, 0)`,
            } as React.CSSProperties
          }
        >
          {m.name}
        </div>
      ))}
    </div>
  );
}
