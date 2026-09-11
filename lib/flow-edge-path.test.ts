import { describe, it, expect } from "vitest";
import {
  anchorOn,
  edgeGeometry,
  pickSides,
  pointAlongPolyline,
  pointOnGeometry,
  portOffset,
  connectionWaypoint,
  routePoints,
  roundedPolyline,
  STUB,
  type NodeRect,
} from "./flow-edge-path";

const rect = (x: number, y: number): NodeRect => ({ x, y, w: 244, h: 88 });

describe("flow-edge-path", () => {
  it("uses one shared rail for a dragged connection between two right ports", () => {
    const geometry = edgeGeometry({ x: 0, y: 0 }, "right", { x: 0, y: 200 }, "right", "orthogonal", { x: 180, y: 75 });
    expect(geometry.points).toEqual([{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 200 }, { x: 0, y: 200 }]);
    expect(geometry).toMatchObject({ handle: { x: 180, y: 100 }, handleAxis: "x" });
  });

  it("mirrors the same route for left ports without a dangling midpoint spur", () => {
    const geometry = edgeGeometry({ x: 0, y: 0 }, "left", { x: 0, y: 200 }, "left", "orthogonal", { x: -180, y: 125 });
    expect(geometry.points).toEqual([{ x: 0, y: 0 }, { x: -180, y: 0 }, { x: -180, y: 200 }, { x: 0, y: 200 }]);
    expect(geometry).toMatchObject({ handle: { x: -180, y: 100 } });
  });
  it("puts each port on its own edge of the box", () => {
    const r = rect(100, 200);
    expect(anchorOn(r, "top")).toEqual({ x: 100, y: 200 });
    expect(anchorOn(r, "bottom")).toEqual({ x: 100, y: 288 });
    expect(anchorOn(r, "left")).toEqual({ x: -22, y: 244 });
    expect(anchorOn(r, "right")).toEqual({ x: 222, y: 244 });
  });

  it("picks bottom→top for a node below, and sides for one beside", () => {
    expect(pickSides(rect(0, 0), rect(0, 300))).toEqual(["bottom", "top"]);
    expect(pickSides(rect(0, 300), rect(0, 0))).toEqual(["top", "bottom"]);
    expect(pickSides(rect(0, 0), rect(600, 10))).toEqual(["right", "left"]);
    expect(pickSides(rect(600, 0), rect(0, 10))).toEqual(["left", "right"]);
  });

  it("keeps every orthogonal segment axis-aligned", () => {
    const points = routePoints({ x: 0, y: 0 }, "bottom", { x: 300, y: 400 }, "top");
    expect(points.length).toBeGreaterThan(2);
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const axisAligned = Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5;
      expect(axisAligned).toBe(true);
    }
  });

  it("leaves and enters along the port normal, clearing the stub before turning", () => {
    const points = routePoints({ x: 0, y: 0 }, "bottom", { x: 300, y: 400 }, "top");
    const first = points[1]!;
    const lastCorner = points[points.length - 2]!;
    // First leg runs straight down out of the bottom port...
    expect(first.x).toBe(0);
    expect(first.y).toBeGreaterThanOrEqual(STUB);
    // ...and the final leg runs straight down into the top port.
    expect(lastCorner.x).toBe(300);
    expect(400 - lastCorner.y).toBeGreaterThanOrEqual(STUB);
  });

  it("collapses a straight run to two points — no phantom corners", () => {
    const points = routePoints({ x: 0, y: 0 }, "bottom", { x: 0, y: 400 }, "top");
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 400 },
    ]);
  });

  it("rounds corners without overshooting a short segment", () => {
    const d = roundedPolyline(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 40, y: 10 },
      ],
      12,
    );
    // The corner radius is clamped to half the shortest neighbouring segment
    // (5 here), so the arc starts at y=5 rather than backtracking past 0.
    expect(d).toContain("L 0 5");
    expect(d).toContain("Q 0 10");
  });

  it("samples the midpoint of a straight connector at its actual middle", () => {
    const { point } = pointAlongPolyline(
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
      0.5,
    );
    expect(point).toEqual({ x: 0, y: 50 });
  });

  it("reports the travel angle, for pointing an arrowhead", () => {
    const down = pointAlongPolyline([{ x: 0, y: 0 }, { x: 0, y: 100 }], 0.5);
    expect(down.angle).toBe(90);
    const right = pointAlongPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0.5);
    expect(right.angle).toBe(0);
  });

  it("samples a curved connector off its bezier, not its chord", () => {
    // A symmetric bottom→top sweep does cross its own chord midpoint...
    const symmetric = edgeGeometry({ x: 0, y: 0 }, "bottom", { x: 200, y: 200 }, "top", "curved");
    expect(pointOnGeometry(symmetric, 0.5).point.x).toBeCloseTo(100);
    expect(pointOnGeometry(symmetric, 0.5).point.y).toBeCloseTo(100);
    // ...but an asymmetric one does not, which is why sampling the chord is
    // not good enough for parking a label or a "+".
    const asymmetric = edgeGeometry({ x: 0, y: 0 }, "right", { x: 200, y: 200 }, "top", "curved");
    const mid = pointOnGeometry(asymmetric, 0.5).point;
    expect(mid.x === 100 && mid.y === 100).toBe(false);
  });

  it("emits a path for both shapes", () => {
    for (const shape of ["orthogonal", "curved"] as const) {
      const geom = edgeGeometry({ x: 0, y: 0 }, "bottom", { x: 300, y: 400 }, "top", shape);
      expect(geom.d.startsWith("M 0 0")).toBe(true);
      expect(geom.shape).toBe(shape);
    }
  });

  it("positions anchors along a chosen side and round-trips pointer offsets", () => {
    const node = rect(100, 200);
    for (const side of ["top", "right", "bottom", "left"] as const) {
      for (const fraction of [0, 0.25, 0.75, 1]) {
        const point = anchorOn(node, side, fraction);
        expect(portOffset(node, side, point)).toBeCloseTo(fraction);
      }
    }
    expect(anchorOn(node, "top", 0)).toEqual({ x: -22, y: 200 });
    expect(anchorOn(node, "right", 1)).toEqual({ x: 222, y: 288 });
  });

  it("keeps manually routed segments orthogonal for every side combination", () => {
    for (const from of ["top", "right", "bottom", "left"] as const) {
      for (const to of ["top", "right", "bottom", "left"] as const) {
        const geometry = edgeGeometry({ x: 0, y: 0 }, from, { x: 0, y: 400 }, to, "orthogonal", { x: 120, y: 200 });
        expect(geometry.points[0]).toEqual({ x: 0, y: 0 });
        expect(geometry.points.at(-1)).toEqual({ x: 0, y: 400 });
        geometry.points.slice(1).forEach((point, index) => {
          const prior = geometry.points[index]!;
          expect(point.x === prior.x || point.y === prior.y).toBe(true);
        });
        expect(geometry.d).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it("uses the same shared rail and handle for curved and square routing", () => {
    const waypoint = { x: 180, y: 150 };
    const geometry = edgeGeometry({ x: 0, y: 0 }, "right", { x: 30, y: 400 }, "left", "curved", waypoint);
    expect(pointOnGeometry(geometry, 0).point).toEqual({ x: 0, y: 0 });
    const square = edgeGeometry({ x: 0, y: 0 }, "right", { x: 30, y: 400 }, "left", "orthogonal", waypoint);
    expect(geometry.handle).toEqual(square.handle);
    expect(geometry.points).toEqual(square.points);
    expect(geometry.handle).toEqual({ x: 15, y: 150 });
    expect(pointOnGeometry(geometry, 1).point).toEqual({ x: 30, y: 400 });
  });

  it("keeps a dragged rail centred as its endpoint nodes move", () => {
    const connection = { sourceId: "a", from: { side: "right" as const, offset: .5 }, to: { side: "right" as const, offset: .5 }, routing: { axis: "x" as const, offset: { x: 180, y: 0 } } };
    const from = { x: 50, y: 20 }, to = { x: 50, y: 260 };
    const waypoint = connectionWaypoint(connection, from, to);
    const geometry = edgeGeometry(from, "right", to, "right", "orthogonal", waypoint, connection.routing.axis);
    expect(geometry.handle).toEqual({ x: 230, y: 140 });
    expect(geometry.points).toEqual([from, { x: 230, y: 20 }, { x: 230, y: 260 }, to]);
  });

  it("keeps a vertical detour when one node moves sideways", () => {
    const geometry = edgeGeometry({ x: 0, y: 0 }, "bottom", { x: 60, y: 200 }, "top", "orthogonal", { x: 150, y: 100 }, "x");
    expect(geometry.handle).toEqual({ x: 150, y: 100 });
    expect(geometry.points.some(point => point.x === 150)).toBe(true);
  });

  it("routes away from a top port instead of doubling back through its own card", () => {
    const points = routePoints({ x: 0, y: 0 }, "top", { x: 108, y: 170 }, "right");
    expect(points[1].y).toBeLessThan(0);
    points.slice(1).forEach((point, index) => {
      const before = points[index];
      if (before.x === point.x && Math.abs(point.x) < 108) {
        expect(Math.min(before.y, point.y) >= 76 || Math.max(before.y, point.y) <= 0).toBe(true);
      }
    });
  });
});
