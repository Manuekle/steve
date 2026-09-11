import { describe, expect, it } from "vitest";
import { blendColor, donutHoverOffset, donutSlice, exponentialOut, hitStack, HoverTween, niceMax, sampleCurve, shares, stackRects, TAU, VectorTween } from "@/app/_components/charts/geometry";

describe("tile chart geometry", () => {
  it("keeps a single-category donut stationary throughout hover", () => {
    for (const emphasis of [0, .1, .5, 1]) {
      const [x, y] = donutHoverOffset(Math.PI / 2, emphasis, 1);
      expect(Math.abs(x) + Math.abs(y)).toBe(0);
    }
    expect(donutHoverOffset(0, 1, 3)).toEqual([6, 0]);
  });

  it("eases hover emphasis and opacity without a first-frame jump", () => {
    const hover = new HoverTween(.72);
    expect(hover.read("channel", 1, 1, 100, false)).toEqual([0, .72]);
    const middle = hover.read("channel", 1, 1, 190, false);
    expect(middle[0]).toBeGreaterThan(0);
    expect(middle[0]).toBeLessThan(1);
    expect(middle[1]).toBeGreaterThan(.72);
    expect(middle[1]).toBeLessThan(1);
    expect(hover.read("channel", 1, 1, 280, false)).toEqual([1, 1]);
  });

  it("returns gently from the currently displayed hover when interrupted", () => {
    const hover = new HoverTween();
    hover.read("campaign", 1, 1, 0, false);
    const visible = [...hover.read("campaign", 1, 1, 60, false)];
    expect(hover.read("campaign", 0, .3, 60, false)).toEqual(visible);
    const fading = hover.read("campaign", 0, .3, 100, false);
    expect(fading[0]).toBeLessThan(visible[0]);
    expect(fading[1]).toBeGreaterThan(.3);
    expect(hover.read("campaign", 1, 1, 100, false)).toEqual(fading);
    expect(hover.read("campaign", 1, 1, 280, false)).toEqual([1, 1]);
  });

  it("jumps hover under reduced motion and blends highlight colors continuously", () => {
    const hover = new HoverTween();
    expect(hover.read("band", 1, 1, 0, true)).toEqual([1, 1]);
    expect(hover.read("band", 0, .3, 1, true)).toEqual([0, .3]);
    expect(blendColor("#AFC7F9", "#2563EB", 0)).toBe("rgb(175,199,249)");
    expect(blendColor("#AFC7F9", "#2563EB", 1)).toBe("rgb(37,99,235)");
    expect(blendColor("#AFC7F9", "#2563EB", .5)).toBe("rgb(106,149,242)");
  });

  it("keeps invalid/negative values out of the denominator without inventing zero slices", () => {
    expect(shares([10, -10, NaN, Infinity, 30, 0])).toEqual([.25, 0, 0, 0, .75, 0]);
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([])).toEqual([]);
  });

  it("keeps a full circle through interrupted share morphs and reaches exact targets", () => {
    const tween = new VectorTween([.6, .3, .1]);
    tween.retarget([.1, .7, .2], 100, 500, exponentialOut);
    const visible = [...tween.read(240)];
    tween.retarget([.8, .05, .15], 240, 500, exponentialOut);
    expect(tween.read(240)).toEqual(visible);
    for (let now = 250; now <= 740; now += 10) expect(tween.read(now).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(tween.read(740)).toEqual([.8, .05, .15]);
  });

  it("reduced motion jumps a pending morph to its final values", () => {
    const tween = new VectorTween([10, 50]);
    tween.retarget([30, 100], 100, 460);
    expect(tween.read(101, true)).toEqual([30, 100]);
  });

  it("does not restart transitions when polling returns identical data", () => {
    const tween = new VectorTween([0]);
    tween.retarget([100], 0, 500);
    expect(tween.read(250)).toEqual([50]);
    tween.retarget([100], 250, 500);
    expect(tween.read(500)).toEqual([100]);
  });

  it("caps inner and outer corners below the available arc even for tiny slices", () => {
    for (const share of [1e-8, .0001, .01, .1, .99, 1]) {
      const slice = donutSlice(-Math.PI / 2, share);
      expect(slice.b).toBeGreaterThan(slice.a);
      expect(slice.corner * 2 / 55).toBeLessThan(slice.b - slice.a);
      expect(slice.corner).toBeLessThanOrEqual(6);
      expect(slice.mid).toBeCloseTo(-Math.PI / 2 + TAU * share / 2);
    }
  });

  it("interpolates a curve without overshooting source points or producing NaN for short input", () => {
    expect(sampleCurve([], .5)).toBe(0);
    expect(sampleCurve([7], .5)).toBe(7);
    expect(sampleCurve([0, 100], .5)).toBe(50);
    expect(sampleCurve([3, 9], -1)).toBe(3);
    expect(sampleCurve([3, 9], 2)).toBe(9);
    for (let x = 0; x < 1; x += .01) expect(sampleCurve([0, 100, 0], x)).toBeLessThanOrEqual(100);
  });

  it("keeps currency axes meaningful below one dollar", () => {
    expect(niceMax(.004)).toBe(.005);
    expect(niceMax(13000)).toBe(20000);
    expect(niceMax(0)).toBe(1);
    expect(niceMax(Infinity)).toBe(1);
  });

  it("uses identical geometry for stacking and hit tests, preserving branch-only gaps", () => {
    const rects = stackRects([[46, 31, 23], [0, 20, 0]], 400, 200, 120);
    const cash = rects[0];
    const qr = rects[1];
    expect(cash.y + cash.height).toBe(200);
    expect(cash.y - (qr.y + qr.height)).toBeCloseTo(4);
    expect(hitStack(rects, cash.x + 2, cash.y + 2, 400, 2)).toEqual({ column: 0, band: 0 });
    expect(hitStack(rects, cash.x + 2, cash.y - 2, 400, 2)).toEqual({ column: 0, band: null });
    expect(hitStack(rects, 10, 190, 400, 2)).toEqual({ column: 0, band: null });
    expect(hitStack(rects, 399, 190, 400, 2)).toEqual({ column: 1, band: null });
    expect(hitStack(rects, 401, 100, 400, 2)).toBeNull();
    expect(rects[3].height).toBe(0);
    expect(rects[5].height).toBe(0);
  });
});
