import type { WorkflowStep } from "./types";
import type { StepPath } from "./workflow-tree";

// Pure top-down tree layout for the automation flow canvas. A "condition"
// step forks into two side-by-side columns (thenSteps / elseSteps); any
// steps that follow the condition in the same array continue below the
// taller of the two branches, re-centered on the fork's own x — matching
// how n8n/most flow tools draw an IF node's branches rejoining downstream.

export const NODE_W = 244;
export const NODE_H = 88;
const V_GAP = 56;
const H_GAP = 40;
const BRANCH_LABEL_GAP = 24;

export type XY = { readonly x: number; readonly y: number };

export type LayoutNode = {
  readonly path: StepPath;
  readonly step: WorkflowStep;
  readonly x: number; // center x
  readonly y: number; // top y
};

/** A placeholder slot where "add step" renders — an empty branch, or the tip of a chain. */
export type LayoutSlot = {
  readonly path: StepPath; // parentPath — insertion happens at index 0 (empty branch) or steps.length (chain tip)
  readonly index: number;
  readonly x: number;
  readonly y: number;
  /**
   * Where the "add here" connector should start. A chain tip sits a gap below
   * whatever precedes it, so without this the "+" floats unattached; empty
   * branch slots already sit on their fork edge and leave this undefined.
   */
  readonly from?: XY;
  /** The node this slot hangs off, as a tree address (null = the trigger). */
  readonly fromPath?: StepPath | null;
  /** As on LayoutEdge: `from` is a fork's merge point, not the node's edge. */
  readonly fromMerge?: boolean;
};

export type LayoutEdge = {
  readonly from: XY;
  readonly to: XY;
  readonly label?: "Sí" | "No";
  /**
   * Endpoints as tree addresses, alongside the auto-layout coordinates above.
   * The canvas re-anchors edges to a node's dragged position when it has one,
   * and falls back to `from`/`to` for anything it can't address.
   */
  readonly fromPath: StepPath | null; // null = the trigger node
  /**
   * True when `from` is a fork's merge point — the anchor below the taller
   * branch — rather than the source node's own edge. The canvas has to keep
   * this anchor instead of re-deriving one from the node's ports, or the
   * connector doubles back up through the branches it just passed.
   */
  readonly fromMerge?: boolean;
  readonly toPath?: StepPath; // set when the edge enters a step node
  readonly toSlot?: { readonly path: StepPath; readonly index: number }; // set when it enters an empty branch slot
};

export type ChainLayout = {
  readonly nodes: LayoutNode[];
  readonly edges: LayoutEdge[];
  readonly slots: LayoutSlot[];
  readonly width: number;
  /** Bottom-center anchor to connect whatever comes after this chain. */
  readonly bottomAnchor: XY;
};

function measureWidth(steps: readonly WorkflowStep[]): number {
  let w = NODE_W;
  for (const step of steps) {
    if (step.type === "condition") {
      const thenW = measureWidth(step.thenSteps ?? []);
      const elseW = measureWidth(step.elseSteps ?? []);
      w = Math.max(w, thenW + H_GAP + elseW);
    }
  }
  return w;
}

/**
 * Lay out one chain (array of sibling steps) centered on `centerX`, starting
 * at `startY`. `entryAnchor` is where the first node's incoming edge comes
 * from (the parent node, or null if this chain has no parent to connect to
 * yet — the caller adds that edge itself in that case).
 */
export function layoutChain(
  steps: readonly WorkflowStep[],
  path: StepPath,
  centerX: number,
  startY: number,
  entryAnchor: XY | null,
  /** Tree address of the node `entryAnchor` belongs to (null = the trigger). */
  entryPath: StepPath | null = null,
): ChainLayout {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const slots: LayoutSlot[] = [];
  let y = startY;
  let prevAnchor = entryAnchor;
  let prevPath: StepPath | null = entryPath;
  // Whether `prevAnchor` is a fork's merge point rather than a node edge.
  let prevMerge = false;
  let width = NODE_W;

  steps.forEach((step, i) => {
    const stepPath = [...path, i];
    const top: XY = { x: centerX, y };
    // An isolated step severs its incoming edge — it floats as its own chain
    // on the canvas even though it still lives in the same steps array.
    if (prevAnchor && !step.isolated) {
      edges.push({ from: prevAnchor, to: top, fromPath: prevPath, toPath: stepPath, fromMerge: prevMerge });
    }
    nodes.push({ path: stepPath, step, x: centerX, y });
    const bottom: XY = { x: centerX, y: y + NODE_H };
    y += NODE_H + V_GAP;
    prevAnchor = bottom;
    prevPath = stepPath;
    prevMerge = false;

    if (step.type === "condition") {
      const thenSteps = step.thenSteps ?? [];
      const elseSteps = step.elseSteps ?? [];
      const thenW = measureWidth(thenSteps);
      const elseW = measureWidth(elseSteps);
      const totalForkW = thenW + H_GAP + elseW;
      width = Math.max(width, totalForkW);

      // Always fork (even with both branches still empty) so there's
      // somewhere on the canvas to add the first step into either one.
      const thenCenterX = centerX - totalForkW / 2 + thenW / 2;
      const elseCenterX = centerX + totalForkW / 2 - elseW / 2;
      const branchStartY = y + BRANCH_LABEL_GAP;

      const thenEntry: XY = { x: thenCenterX, y: branchStartY };
      const elseEntry: XY = { x: elseCenterX, y: branchStartY };
      // A branch whose first step is isolated keeps its column but loses the
      // connector, same as an isolated step mid-chain.
      if (!thenSteps[0]?.isolated) {
        edges.push({
          from: bottom,
          to: thenEntry,
          label: "Sí",
          fromPath: stepPath,
          ...(thenSteps.length > 0
            ? { toPath: [...stepPath, "then", 0] }
            : { toSlot: { path: [...stepPath, "then"], index: 0 } }),
        });
      }
      if (!elseSteps[0]?.isolated) {
        edges.push({
          from: bottom,
          to: elseEntry,
          label: "No",
          fromPath: stepPath,
          ...(elseSteps.length > 0
            ? { toPath: [...stepPath, "else", 0] }
            : { toSlot: { path: [...stepPath, "else"], index: 0 } }),
        });
      }

      let thenBottomY = branchStartY + NODE_H;
      if (thenSteps.length === 0) {
        slots.push({ path: [...stepPath, "then"], index: 0, x: thenCenterX, y: branchStartY, fromPath: stepPath });
      } else {
        const thenResult = layoutChain(thenSteps, [...stepPath, "then"], thenCenterX, branchStartY, null, stepPath);
        nodes.push(...thenResult.nodes);
        edges.push(...thenResult.edges);
        slots.push(...thenResult.slots);
        thenBottomY = thenResult.bottomAnchor.y;
      }

      let elseBottomY = branchStartY + NODE_H;
      if (elseSteps.length === 0) {
        slots.push({ path: [...stepPath, "else"], index: 0, x: elseCenterX, y: branchStartY, fromPath: stepPath });
      } else {
        const elseResult = layoutChain(elseSteps, [...stepPath, "else"], elseCenterX, branchStartY, null, stepPath);
        nodes.push(...elseResult.nodes);
        edges.push(...elseResult.edges);
        slots.push(...elseResult.slots);
        elseBottomY = elseResult.bottomAnchor.y;
      }

      const mergedY = Math.max(thenBottomY, elseBottomY);
      y = mergedY + V_GAP;
      prevAnchor = { x: centerX, y: mergedY };
      prevMerge = true;
      // Whatever follows the fork attaches to the condition node itself: the
      // branches are a detour, and the condition is the only address both
      // columns share.
      prevPath = stepPath;
    }
  });

  slots.push({
    path,
    index: steps.length,
    x: centerX,
    y,
    from: prevAnchor ?? undefined,
    fromPath: prevPath,
    fromMerge: prevMerge,
  });

  return {
    nodes,
    edges,
    slots,
    width,
    bottomAnchor: prevAnchor ?? { x: centerX, y: startY },
  };
}
