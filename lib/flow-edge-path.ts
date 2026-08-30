import type { XY } from "./workflow-layout";

// Connector geometry for the automation canvas.
//
// Nodes expose four ports (top/right/bottom/left). A connector leaves its
// port straight, turns at right angles, and arrives straight into the target
// port — the n8n/Figma look — with the corners rounded rather than mitred.
// The curved router is the same routing with bezier control points instead of
// corners, for flows that read better as a single sweep.

export type Side = "top" | "right" | "bottom" | "left";
export type EdgeShape = "orthogonal" | "curved";

/** A node box in flow coordinates: `x` is the CENTER, `y` the TOP. */
export type NodeRect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** How far a connector runs straight out of a port before it may turn. */
export const STUB = 24;
/** Corner radius on an orthogonal route. */
export const CORNER = 12;

export const isVertical = (side: Side): boolean => side === "top" || side === "bottom";

export function anchorOn(rect: NodeRect, side: Side): XY {
  switch (side) {
    case "top":
      return { x: rect.x, y: rect.y };
    case "bottom":
      return { x: rect.x, y: rect.y + rect.h };
    case "left":
      return { x: rect.x - rect.w / 2, y: rect.y + rect.h / 2 };
    case "right":
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }
}

/** Push a point away from the node along its port's normal. */
export function outward(point: XY, side: Side, distance: number): XY {
  return {
    x: point.x + (side === "left" ? -distance : side === "right" ? distance : 0),
    y: point.y + (side === "top" ? -distance : side === "bottom" ? distance : 0),
  };
}

/**
 * Which ports two boxes should connect through, from their relative position.
 * Vertical wins ties: a flow reads top-to-bottom, so a node sitting mostly
 * below its predecessor gets the bottom→top pair even when it's offset
 * sideways as well.
 */
export function pickSides(from: NodeRect, to: NodeRect): readonly [Side, Side] {
  const dx = to.x - from.x;
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
  return dx >= 0 ? ["right", "left"] : ["left", "right"];
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

/**
 * Drop duplicate and collinear waypoints. A straight run through a stub point
 * is still one straight run: leaving it in would make `roundedPolyline` emit a
 * corner arc where the line never turns.
 */
function simplify(points: readonly XY[]): XY[] {
  const out: XY[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && near(last.x, p.x) && near(last.y, p.y)) continue;
    const before = out[out.length - 2];
    if (last && before) {
      const cross = (last.x - before.x) * (p.y - before.y) - (last.y - before.y) * (p.x - before.x);
      if (Math.abs(cross) < 0.5) out.pop();
    }
    out.push(p);
  }
  return out;
}

/**
 * Right-angle waypoints from one port to another: straight out of `fromSide`,
 * a dog-leg through the middle, straight into `toSide`.
 */
export function routePoints(from: XY, fromSide: Side, to: XY, toSide: Side): XY[] {
  const a = outward(from, fromSide, STUB);
  const b = outward(to, toSide, STUB);
  const mid: XY[] = [];

  if (isVertical(fromSide) && isVertical(toSide)) {
    // Two vertical ports: step across at the halfway height.
    if (!near(a.x, b.x)) {
      const y = (a.y + b.y) / 2;
      mid.push({ x: a.x, y }, { x: b.x, y });
    }
  } else if (!isVertical(fromSide) && !isVertical(toSide)) {
    // Two horizontal ports: step across at the halfway width.
    if (!near(a.y, b.y)) {
      const x = (a.x + b.x) / 2;
      mid.push({ x, y: a.y }, { x, y: b.y });
    }
  } else if (isVertical(fromSide)) {
    // Vertical out, horizontal in: one corner.
    mid.push({ x: a.x, y: b.y });
  } else {
    mid.push({ x: b.x, y: a.y });
  }

  return simplify([from, a, ...mid, b, to]);
}

const dist = (a: XY, b: XY) => Math.hypot(b.x - a.x, b.y - a.y);

function towards(from: XY, to: XY, distance: number): XY {
  const len = dist(from, to);
  if (len === 0) return from;
  const k = Math.min(1, distance / len);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

/** Polyline with quadratic corners — square routing that still reads soft. */
export function roundedPolyline(points: readonly XY[], radius = CORNER): string {
  if (points.length < 2) return "";
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const corner = points[i]!;
    const next = points[i + 1]!;
    // Never round more than half a segment, or neighbouring corners collide.
    const r = Math.min(radius, dist(prev, corner) / 2, dist(corner, next) / 2);
    const enter = towards(corner, prev, r);
    const exit = towards(corner, next, r);
    d += ` L ${enter.x} ${enter.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

/** Bezier whose control points leave and enter along the port normals. */
export function curvedPolyline(from: XY, fromSide: Side, to: XY, toSide: Side): string {
  const reach = Math.max(48, Math.min(180, dist(from, to) * 0.45));
  const c1 = outward(from, fromSide, reach);
  const c2 = outward(to, toSide, reach);
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

function cubicAt(p0: XY, p1: XY, p2: XY, p3: XY, t: number): XY {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** A point on a polyline at `t` of its total length, plus its travel angle. */
export function pointAlongPolyline(points: readonly XY[], t: number): { point: XY; angle: number } {
  if (points.length === 0) return { point: { x: 0, y: 0 }, angle: 0 };
  if (points.length === 1) return { point: points[0]!, angle: 0 };
  const segments = points.slice(1).map((p, i) => dist(points[i]!, p));
  const total = segments.reduce((sum, s) => sum + s, 0);
  if (total === 0) return { point: points[0]!, angle: 0 };
  let remaining = total * Math.min(1, Math.max(0, t));
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!;
    if (remaining <= seg || i === segments.length - 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const k = seg === 0 ? 0 : Math.min(1, remaining / seg);
      return {
        point: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }
    remaining -= seg;
  }
  const last = points[points.length - 1]!;
  return { point: last, angle: 0 };
}

export type EdgeGeometry = {
  /** SVG path data. */
  readonly d: string;
  /** Waypoints (orthogonal) or bezier control polygon (curved). */
  readonly points: readonly XY[];
  readonly fromSide: Side;
  readonly toSide: Side;
  readonly shape: EdgeShape;
};

/** Route one connector between two anchor points on known port sides. */
export function edgeGeometry(
  from: XY,
  fromSide: Side,
  to: XY,
  toSide: Side,
  shape: EdgeShape,
): EdgeGeometry {
  if (shape === "curved") {
    const reach = Math.max(48, Math.min(180, dist(from, to) * 0.45));
    const points = [from, outward(from, fromSide, reach), outward(to, toSide, reach), to];
    return { d: curvedPolyline(from, fromSide, to, toSide), points, fromSide, toSide, shape };
  }
  const points = routePoints(from, fromSide, to, toSide);
  return { d: roundedPolyline(points), points, fromSide, toSide, shape };
}

/** Where to park a label, a "+", or an arrowhead so it sits ON the connector. */
export function pointOnGeometry(geom: EdgeGeometry, t: number): { point: XY; angle: number } {
  if (geom.shape === "curved") {
    const [p0, p1, p2, p3] = geom.points as readonly [XY, XY, XY, XY];
    const point = cubicAt(p0, p1, p2, p3, t);
    const ahead = cubicAt(p0, p1, p2, p3, Math.min(1, t + 0.01));
    return { point, angle: (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI };
  }
  return pointAlongPolyline(geom.points, t);
}

/** Pull an endpoint back along the connector, so a line stops short of a "+". */
export function backOff(from: XY, to: XY, distance: number): XY {
  const len = dist(from, to);
  if (len <= distance) return to;
  return { x: to.x - ((to.x - from.x) / len) * distance, y: to.y - ((to.y - from.y) / len) * distance };
}
