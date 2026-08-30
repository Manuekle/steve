/**
 * A confetti burst, drawn on a throwaway canvas over the whole viewport.
 *
 * No dependency and no React state: call it from an event handler and it
 * mounts, animates and cleans itself up. Reserved for moments the user
 * actually won something — an automation going live, not every save.
 */

type BurstOptions = {
  /** Burst origin in viewport coordinates. Defaults to the centre-top third. */
  readonly x?: number;
  readonly y?: number;
  /** Particle count. Kept modest on purpose: this is a punctuation mark. */
  readonly count?: number;
};

/** Restrained next to a monochrome interface — three accents and two greys. */
const COLORS = ["#4f7cff", "#22c55e", "#f59e0b", "#e5e7eb", "#94a3b8"];

const GRAVITY = 0.32;
const DRAG = 0.985;
const LIFE_MS = 1400;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  angle: number;
  spin: number;
  color: string;
};

export function fireConfetti(options: BurstOptions = {}): void {
  if (typeof window === "undefined") return;
  // Motion here is decoration with no informational value, so it's the first
  // thing to go when someone has asked for less of it.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: "none",
    zIndex: "9999",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(canvas);

  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  context.scale(dpr, dpr);

  const originX = options.x ?? width / 2;
  const originY = options.y ?? height / 3;
  const count = options.count ?? 90;

  const particles: Particle[] = Array.from({ length: count }, () => {
    // A cone aimed upward, wide enough to look thrown rather than sprayed.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 6 + Math.random() * 9;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 5,
      h: 3 + Math.random() * 4,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    };
  });

  const start = performance.now();
  let frame = 0;

  const tick = (now: number) => {
    const elapsed = now - start;
    if (elapsed >= LIFE_MS) {
      canvas.remove();
      return;
    }
    // Fade the whole burst out over its last third rather than popping.
    const fade = Math.max(0, Math.min(1, (LIFE_MS - elapsed) / (LIFE_MS * 0.4)));
    context.clearRect(0, 0, width, height);
    context.globalAlpha = fade;

    for (const p of particles) {
      p.vx *= DRAG;
      p.vy = p.vy * DRAG + GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;

      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.angle);
      context.fillStyle = p.color;
      context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      context.restore();
    }

    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);

  // A navigation mid-burst would otherwise leave the canvas parked on top of
  // the next page.
  window.addEventListener(
    "pagehide",
    () => {
      cancelAnimationFrame(frame);
      canvas.remove();
    },
    { once: true },
  );
}

/** Burst from an element's centre — for a button that just did the thing. */
export function fireConfettiFrom(element: HTMLElement | null, options: BurstOptions = {}): void {
  if (!element) {
    fireConfetti(options);
    return;
  }
  const rect = element.getBoundingClientRect();
  fireConfetti({
    ...options,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  });
}
