import { describe, expect, it } from "vitest";
import { connectWorkflowSteps, stripPositions } from "./workflow-tree";
import { parseStoredSteps } from "./workflow-schema";
import type { WorkflowConnection, WorkflowStep } from "./types";

const connection: WorkflowConnection = {
  sourceId: "source", from: { side: "right", offset: 0.2 }, to: { side: "left", offset: 0.8 }, waypoint: { x: 140, y: 90 },
};
const step = (id: string): WorkflowStep => ({ id, type: "message", config: {}, position: { x: 50, y: 100 } });

describe("editable workflow connections", () => {
  it("preserves node positions, custom routing and runtime flags through saved JSON", () => {
    const original = [{ ...step("target"), connection, disabled: true, isolated: true, connector: "dashed" as const }];
    expect(parseStoredSteps(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
  it("persists a relative routing offset without retaining the legacy absolute waypoint", () => {
    const { waypoint: _waypoint, ...ports } = connection;
    const original = [{ ...step("target"), connection: { ...ports, routing: { axis: "x", offset: { x: 180, y: 0 } } } }];
    expect(parseStoredSteps(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
  it("rejects non-finite points and out-of-bounds port offsets", () => {
    expect(parseStoredSteps([{ ...step("target"), connection: { ...connection, from: { side: "right", offset: 2 } } }])).toBeUndefined();
    expect(parseStoredSteps([{ ...step("target"), position: { x: Infinity, y: 0 } }])).toBeUndefined();
  });
  it("reconnects to a nested source after earlier root indexes shift, without moving cards", () => {
    const target = step("target");
    const source = step("source");
    const tree: WorkflowStep[] = [target, { ...step("branch"), type: "condition", thenSteps: [source] }, step("last")];
    const next = connectWorkflowSteps(tree, [1, "then", 0], [0], connection);
    expect(next.map(s => s.id)).toEqual(["branch", "last"]);
    expect(next[0].thenSteps?.map(s => s.id)).toEqual(["source", "target"]);
    expect(next[0].thenSteps?.[1]).toMatchObject({ position: target.position, connection, isolated: false });
    expect(tree[0]).toBe(target);
  });
  it("editing a branch connection never pulls the child into the parent chain", () => {
    const tree: WorkflowStep[] = [{ ...step("source"), type: "condition", thenSteps: [step("target")] }];
    const next = connectWorkflowSteps(tree, [0], [0, "then", 0], connection);
    expect(next).toHaveLength(1);
    expect(next[0].thenSteps?.[0].connection).toEqual(connection);
  });
  it("refuses connections that move an ancestor into its own subtree", () => {
    const tree: WorkflowStep[] = [{ ...step("target"), type: "condition", thenSteps: [step("source")] }];
    expect(connectWorkflowSteps(tree, [0, "then", 0], [0], connection)).toEqual(tree);
  });
  it("reset layout removes custom routes without clearing disabled flags", () => {
    expect(stripPositions([{ ...step("target"), connection, disabled: true }])[0]).toEqual({ id: "target", type: "message", config: {}, disabled: true });
  });
});
