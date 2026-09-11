import { NODE_H, NODE_W, type XY } from "./workflow-layout";
import type { WorkflowConnection } from "./types";

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

export function anchorOn(rect: NodeRect, side: Side, offset = 0.5): XY {
  const fraction = Math.max(0, Math.min(1, offset));
  switch (side) {
    case "top":
      return { x: rect.x - rect.w / 2 + rect.w * fraction, y: rect.y };
    case "bottom":
      return { x: rect.x - rect.w / 2 + rect.w * fraction, y: rect.y + rect.h };
    case "left":
      return { x: rect.x - rect.w / 2, y: rect.y + rect.h * fraction };
    case "right":
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h * fraction };
  }
}

export function portOffset(rect: NodeRect, side: Side, point: XY): number {
  const value = isVertical(side) ? (point.x - rect.x + rect.w / 2) / rect.w : (point.y - rect.y) / rect.h;
  return Math.max(0, Math.min(1, value));
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

export function connectionWaypoint(connection: WorkflowConnection | undefined, from: XY, to: XY): XY | undefined {
  if (!connection?.routing) return connection?.waypoint;
  return { x: (from.x + to.x) / 2 + connection.routing.offset.x, y: (from.y + to.y) / 2 + connection.routing.offset.y };
}

type RoutingAxis = "x" | "y" | "xy";

export function withConnectionRouting(connection: WorkflowConnection, point: XY, reference: XY, axis: RoutingAxis): WorkflowConnection {
  const { waypoint: _legacy, ...rest } = connection;
  return { ...rest, routing: { axis, offset: { x: point.x - reference.x, y: point.y - reference.y } } };
}

/** Both halves share one rail. Transposing coordinates gives identical vertical routing. */
function parallelRoute(from: XY, fromSide: Side, to: XY, toSide: Side, waypoint?: XY, axis?: RoutingAxis): { points: XY[]; handle: XY; handleAxis: RoutingAxis } {
  const vertical = isVertical(fromSide);
  const swap = (point: XY): XY => vertical ? { x: point.y, y: point.x } : point;
  const f = swap(from), t = swap(to), desired = waypoint ? swap(waypoint) : undefined;
  const direction = fromSide === "right" || fromSide === "bottom" ? 1 : -1;
  const endDirection = toSide === "right" || toSide === "bottom" ? 1 : -1;
  const a = { x: f.x + direction * STUB, y: f.y };
  const b = { x: t.x + endDirection * STUB, y: t.y };
  const sameSide = direction === endDirection;
  const facing = !sameSide && (b.x - a.x) * direction >= 0;
  const primaryAxis = vertical ? "y" : "x";
  const secondaryAxis = vertical ? "x" : "y";
  const cross = near(f.y, t.y);
  const usePrimary = axis ? axis === primaryAxis : !cross && (sameSide || facing);

  if (usePrimary) {
    let rail = desired?.x ?? (sameSide ? (direction > 0 ? Math.max(f.x, t.x) + STUB : Math.min(f.x, t.x) - STUB) : (a.x + b.x) / 2);
    if (sameSide) rail = direction > 0 ? Math.max(rail, a.x, b.x) : Math.min(rail, a.x, b.x);
    else if (facing) rail = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), rail));
    else return parallelRoute(from, fromSide, to, toSide, waypoint, secondaryAxis);
    return { points: simplify([f, { x: rail, y: f.y }, { x: rail, y: t.y }, t].map(swap)), handle: swap({ x: rail, y: (f.y + t.y) / 2 }), handleAxis: primaryAxis };
  }

  let rail = desired?.y ?? (f.y + t.y) / 2;
  if (!facing && cross) {
    const clearance = (vertical ? NODE_W : NODE_H) / 2 + STUB;
    rail = rail < f.y ? Math.min(rail, f.y - clearance) : Math.max(rail, f.y + clearance);
  }
  const points = !waypoint && cross && facing
    ? [from, to]
    : simplify([f, a, { x: a.x, y: rail }, { x: b.x, y: rail }, b, t].map(swap));
  return { points, handle: swap({ x: (a.x + b.x) / 2, y: rail }), handleAxis: secondaryAxis };
}

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
      const forward = (last.x - before.x) * (p.x - last.x) + (last.y - before.y) * (p.y - last.y);
      if (Math.abs(cross) < 0.5 && forward >= 0) out.pop();
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
  if (isVertical(fromSide) === isVertical(toSide)) return parallelRoute(from, fromSide, to, toSide).points;
  const a = outward(from, fromSide, STUB);
  const b = outward(to, toSide, STUB);
  const mid: XY[] = [];

  if (isVertical(fromSide)) {
    const reversesOut = fromSide === "top" ? b.y > a.y : b.y < a.y;
    const reversesIn = toSide === "right" ? a.x < b.x : a.x > b.x;
    if (reversesOut || reversesIn) {
      const x = toSide === "right" ? Math.max(a.x, b.x) + NODE_W / 2 + STUB : Math.min(a.x, b.x) - NODE_W / 2 - STUB;
      mid.push({ x, y: a.y }, { x, y: b.y });
    } else mid.push({ x: a.x, y: b.y });
  } else {
    const reversesOut = fromSide === "left" ? b.x > a.x : b.x < a.x;
    const reversesIn = toSide === "bottom" ? a.y < b.y : a.y > b.y;
    if (reversesOut || reversesIn) {
      const y = toSide === "bottom" ? Math.max(a.y, b.y) + NODE_H / 2 + STUB : Math.min(a.y, b.y) - NODE_H / 2 - STUB;
      mid.push({ x: a.x, y }, { x: b.x, y });
    } else mid.push({ x: b.x, y: a.y });
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
  radius = Math.min(radius, ...points.slice(1).map((point, index) => dist(points[index]!, point) / 2));
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
  readonly curves?: readonly (readonly [XY, XY, XY, XY])[];
  readonly handle?: XY;
  readonly handleAxis?: RoutingAxis;
};

/** Rounded rails as cubic segments, with one radius for every corner. */
function railCurves(points: readonly XY[], radius: number): readonly (readonly [XY, XY, XY, XY])[] {
  const curves: [XY, XY, XY, XY][] = [];
  let cursor = points[0]!;
  const r = Math.min(radius, ...points.slice(1).map((point, index) => dist(points[index]!, point) / 2));
  const line = (end: XY) => { if (dist(cursor, end) > 0.001) curves.push([cursor, cursor, end, end]); cursor = end; };
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i]!;
    const enter = towards(corner, points[i - 1]!, r);
    const exit = towards(corner, points[i + 1]!, r);
    line(enter);
    curves.push([enter,
      { x: enter.x + (corner.x - enter.x) * 2 / 3, y: enter.y + (corner.y - enter.y) * 2 / 3 },
      { x: exit.x + (corner.x - exit.x) * 2 / 3, y: exit.y + (corner.y - exit.y) * 2 / 3 }, exit]);
    cursor = exit;
  }
  line(points[points.length - 1]!);
  return curves;
}

/** Route one connector between two anchor points on known port sides. */
export function edgeGeometry(
  from: XY,
  fromSide: Side,
  to: XY,
  toSide: Side,
  shape: EdgeShape,
  waypoint?: XY,
  routingAxis?: RoutingAxis,
): EdgeGeometry {
  if (isVertical(fromSide) === isVertical(toSide)) {
    const route = parallelRoute(from, fromSide, to, toSide, waypoint, routingAxis);
    if (shape === "curved") {
      const curves = railCurves(route.points, 48);
      const d = `M ${from.x} ${from.y}` + curves.map(([, c1, c2, end]) => ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`).join("");
      return { ...route, d, curves, fromSide, toSide, shape };
    }
    return { ...route, d: roundedPolyline(route.points), fromSide, toSide, shape };
  }
  if (waypoint) {
    const a = outward(from, fromSide, STUB);
    const b = outward(to, toSide, STUB);
    if (shape === "curved") {
      const length = Math.max(1, dist(from, to));
      const reach = Math.min(80, dist(from, waypoint) / 3, dist(waypoint, to) / 3);
      const tangent = { x: (to.x - from.x) / length * reach, y: (to.y - from.y) / length * reach };
      const curves: readonly (readonly [XY, XY, XY, XY])[] = [
        [from, a, { x: waypoint.x - tangent.x, y: waypoint.y - tangent.y }, waypoint],
        [waypoint, { x: waypoint.x + tangent.x, y: waypoint.y + tangent.y }, b, to],
      ];
      const d = `M ${from.x} ${from.y}` + curves.map(([, c1, c2, end]) => ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`).join("");
      return { d, points: [from, a, waypoint, b, to], curves, fromSide, toSide, shape };
    }
    const verticalFrom = isVertical(fromSide);
    const verticalTo = isVertical(toSide);
    const detour = [verticalFrom ? { x: a.x, y: waypoint.y } : { x: waypoint.x, y: a.y }, waypoint,
      verticalTo ? { x: b.x, y: waypoint.y } : { x: waypoint.x, y: b.y }];
    const points = simplify([from, a, ...detour, b, to]);
    return { d: roundedPolyline(points), points, fromSide, toSide, shape };
  }
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
  if (geom.curves?.length) {
    const samples = geom.curves.flatMap((curve, index) => Array.from({ length: 25 }, (_, i) => ({ point: cubicAt(...curve, i / 24), curve: index, time: i / 24 })));
    const lengths = samples.slice(1).map((sample, index) => dist(samples[index]!.point, sample.point));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, t));
    for (let i = 0; i < lengths.length; i++) {
      const length = lengths[i]!;
      if (remaining <= length || i === lengths.length - 1) {
        const sample = samples[i + 1]!;
        const before = samples[i]!;
        const start = before.curve === sample.curve ? before.time : 0;
        const local = Math.max(0, Math.min(1, start + (sample.time - start) * (length ? remaining / length : 0)));
        const curve = geom.curves[sample.curve]!;
        const point = cubicAt(...curve, local);
        const ahead = cubicAt(...curve, Math.min(1, local + 0.001));
        return { point, angle: Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180 / Math.PI };
      }
      remaining -= length;
    }
  }
  if (geom.shape === "curved") {
    const curves = geom.curves ?? [geom.points as readonly [XY, XY, XY, XY]];
    const scaled = Math.max(0, Math.min(1, t)) * curves.length;
    const index = Math.min(curves.length - 1, Math.floor(scaled));
    const local = scaled - index;
    const [p0, p1, p2, p3] = curves[index]!;
    const point = cubicAt(p0, p1, p2, p3, local);
    const ahead = cubicAt(p0, p1, p2, p3, Math.min(1, local + 0.01));
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
