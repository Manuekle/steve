import { describe, it, expect } from "vitest";
import { layoutChain, NODE_W, NODE_H } from "./workflow-layout";
import { newStep } from "./workflow-tree";
import type { WorkflowStep } from "./types";

describe("workflow-layout", () => {
  it("stacks a linear chain vertically at the same x", () => {
    const steps: WorkflowStep[] = [newStep("message"), newStep("wait"), newStep("ai_response")];
    const result = layoutChain(steps, [], 0, 0, null);
    expect(result.nodes).toHaveLength(3);
    expect(new Set(result.nodes.map((n) => n.x)).size).toBe(1);
    const ys = result.nodes.map((n) => n.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(new Set(ys).size).toBe(3); // strictly increasing, no overlap
  });

  it("forks a condition step into two non-overlapping columns", () => {
    const cond: WorkflowStep = {
      ...newStep("condition"),
      thenSteps: [newStep("message")],
      elseSteps: [newStep("message"), newStep("wait")],
    };
    const result = layoutChain([cond], [], 0, 0, null);
    const thenNode = result.nodes.find((n) => n.path.includes("then"));
    const elseNode = result.nodes.find((n) => n.path.includes("else"));
    expect(thenNode).toBeDefined();
    expect(elseNode).toBeDefined();
    // Columns must not overlap: centers separated by at least one node width.
    expect(Math.abs(thenNode!.x - elseNode!.x)).toBeGreaterThanOrEqual(NODE_W);
  });

  it("gives both branches an add-step slot even when empty", () => {
    const cond = newStep("condition");
    const result = layoutChain([cond], [], 0, 0, null);
    const thenSlot = result.slots.find((s) => s.path.join("/") === "0/then" && s.index === 0);
    const elseSlot = result.slots.find((s) => s.path.join("/") === "0/else" && s.index === 0);
    expect(thenSlot).toBeDefined();
    expect(elseSlot).toBeDefined();
    expect(thenSlot!.x).not.toBe(elseSlot!.x);
  });

  it("continues the parent chain below the taller branch, back on the fork's own x", () => {
    const cond: WorkflowStep = {
      ...newStep("condition"),
      thenSteps: [newStep("message"), newStep("message"), newStep("message")],
      elseSteps: [newStep("message")],
    };
    const after = newStep("transfer_human");
    const result = layoutChain([cond, after], [], 100, 0, null);
    const afterNode = result.nodes.find((n) => n.path.length === 1 && n.path[0] === 1);
    expect(afterNode?.x).toBe(100);
    const thenNodes = result.nodes.filter((n) => n.path.includes("then"));
    const maxThenY = Math.max(...thenNodes.map((n) => n.y));
    expect(afterNode!.y).toBeGreaterThan(maxThenY);
  });

  it("every edge endpoint matches a real node or slot position", () => {
    const cond: WorkflowStep = { ...newStep("condition"), thenSteps: [newStep("message")], elseSteps: [] };
    const result = layoutChain([cond], [], 0, 0, null);
    const knownPoints = new Set([
      ...result.nodes.map((n) => `${n.x},${n.y}`),
      ...result.slots.map((s) => `${s.x},${s.y}`),
    ]);
    for (const edge of result.edges) {
      expect(knownPoints.has(`${edge.to.x},${edge.to.y}`)).toBe(true);
    }
  });

  it("drops the branch connector when a branch's first step is isolated", () => {
    const cond: WorkflowStep = {
      ...newStep("condition"),
      thenSteps: [{ ...newStep("message"), isolated: true }],
      elseSteps: [newStep("message")],
    };
    const result = layoutChain([cond], [], 0, 0, null);
    const labels = result.edges.map((e) => e.label).filter(Boolean);
    expect(labels).toEqual(["No"]);
    // The step still gets laid out — it just floats as its own flow.
    expect(result.nodes.some((n) => n.path.join("/") === "0/then/0")).toBe(true);
  });

  it("hangs the chain-tip slot off the merge point, not the condition", () => {
    const cond: WorkflowStep = {
      ...newStep("condition"),
      thenSteps: [newStep("message"), newStep("message")],
      elseSteps: [newStep("message")],
    };
    const result = layoutChain([cond], [], 0, 0, null);
    const tip = result.slots.find((s) => s.path.length === 0);
    const condNode = result.nodes.find((n) => n.path.join("/") === "0")!;
    const lowestBranch = Math.max(
      ...result.nodes.filter((n) => n.path.length > 1).map((n) => n.y + NODE_H),
    );
    // Starting the tail at the condition's own bottom would run it back up
    // through the fork; it has to start below the taller branch instead.
    expect(tip?.from?.y).toBe(lowestBranch);
    expect(tip!.from!.y).toBeGreaterThan(condNode.y + NODE_H);
    // ...and stay on the fork's own centre line.
    expect(tip?.from?.x).toBe(condNode.x);
    expect(tip?.x).toBe(condNode.x);
  });
});
