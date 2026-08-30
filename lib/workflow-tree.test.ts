import { describe, it, expect } from "vitest";
import {
  getStepAt,
  insertStepAt,
  removeStepAt,
  updateStepAt,
  moveStepAt,
  moveStepTo,
  isAncestorPath,
  ensureBranches,
  newStep,
} from "./workflow-tree";
import type { WorkflowStep } from "./types";

function withId(step: WorkflowStep, id: string): WorkflowStep {
  return { ...step, id };
}

describe("workflow-tree", () => {
  it("inserts at the top level", () => {
    const steps = insertStepAt([], [], 0, withId(newStep("message"), "a"));
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("a");
  });

  it("gets a step at a top-level index", () => {
    const steps = [withId(newStep("message"), "a"), withId(newStep("wait"), "b")];
    expect(getStepAt(steps, [1])?.id).toBe("b");
  });

  it("inserts into a condition step's then branch", () => {
    let steps: WorkflowStep[] = [withId(newStep("condition"), "cond")];
    steps = ensureBranches(steps, [0]);
    steps = insertStepAt(steps, [0, "then"], 0, withId(newStep("message"), "then-1"));
    expect(steps[0].thenSteps).toHaveLength(1);
    expect(steps[0].thenSteps![0].id).toBe("then-1");
    expect(steps[0].elseSteps).toEqual([]);
  });

  it("inserts into a nested else branch two levels deep", () => {
    let steps: WorkflowStep[] = [withId(newStep("condition"), "outer")];
    steps = ensureBranches(steps, [0]);
    steps = insertStepAt(steps, [0, "else"], 0, withId(newStep("condition"), "inner"));
    steps = ensureBranches(steps, [0, "else", 0]);
    steps = insertStepAt(steps, [0, "else", 0, "then"], 0, withId(newStep("message"), "deep"));

    expect(getStepAt(steps, [0, "else", 0, "then", 0])?.id).toBe("deep");
  });

  it("removes a step without disturbing siblings", () => {
    const steps = [withId(newStep("message"), "a"), withId(newStep("wait"), "b"), withId(newStep("message"), "c")];
    const next = removeStepAt(steps, [1]);
    expect(next.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("removes a step inside a branch", () => {
    let steps: WorkflowStep[] = [withId(newStep("condition"), "cond")];
    steps = ensureBranches(steps, [0]);
    steps = insertStepAt(steps, [0, "then"], 0, withId(newStep("message"), "keep"));
    steps = insertStepAt(steps, [0, "then"], 1, withId(newStep("message"), "drop"));
    steps = removeStepAt(steps, [0, "then", 1]);
    expect(steps[0].thenSteps!.map((s) => s.id)).toEqual(["keep"]);
  });

  it("updates a step in place, preserving its id", () => {
    let steps = [withId(newStep("message"), "a")];
    steps = updateStepAt(steps, [0], (s) => ({ ...s, config: { ...s.config, message: "hi" } }));
    expect(steps[0].id).toBe("a");
    expect(steps[0].config.message).toBe("hi");
  });

  it("moves a step up and down within the same array", () => {
    let steps = [withId(newStep("message"), "a"), withId(newStep("wait"), "b")];
    steps = moveStepAt(steps, [1], "up");
    expect(steps.map((s) => s.id)).toEqual(["b", "a"]);
    steps = moveStepAt(steps, [0], "down");
    expect(steps.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("refuses to move past the array boundary", () => {
    const steps = [withId(newStep("message"), "a")];
    expect(moveStepAt(steps, [0], "up").map((s) => s.id)).toEqual(["a"]);
    expect(moveStepAt(steps, [0], "down").map((s) => s.id)).toEqual(["a"]);
  });

  it("does not mutate the original array on any operation", () => {
    const original = [withId(newStep("message"), "a")];
    const frozen = JSON.parse(JSON.stringify(original));
    insertStepAt(original, [], 1, withId(newStep("wait"), "b"));
    removeStepAt(original, [0]);
    updateStepAt(original, [0], (s) => ({ ...s, config: { message: "x" } }));
    expect(original).toEqual(frozen);
  });

  describe("moveStepTo", () => {
    const flow = (): WorkflowStep[] => [
      withId(newStep("message"), "a"),
      { ...withId(newStep("condition"), "cond"), thenSteps: [withId(newStep("wait"), "t1")], elseSteps: [] },
      withId(newStep("transfer_human"), "c"),
    ];

    it("pulls a step out of a branch and re-parents it after the target", () => {
      const next = moveStepTo(flow(), [1, "then", 0], [], 1); // t1 runs right after "a"
      expect(next.map((s) => s.id)).toEqual(["a", "t1", "cond", "c"]);
      expect(getStepAt(next, [2])?.thenSteps).toEqual([]);
    });

    it("compensates for the removal when moving down inside the same array", () => {
      const next = moveStepTo(flow(), [0], [], 3); // "a" runs right after "c"
      expect(next.map((s) => s.id)).toEqual(["cond", "c", "a"]);
    });

    it("clears isolated, since connecting is the point of the move", () => {
      const steps: WorkflowStep[] = [
        withId(newStep("message"), "a"),
        { ...withId(newStep("wait"), "b"), isolated: true },
      ];
      const next = moveStepTo(steps, [1], [], 1);
      expect(next[1].id).toBe("b");
      expect(next[1].isolated).toBeUndefined();
    });

    it("drops the manual canvas position, which described the step's old home", () => {
      const steps: WorkflowStep[] = [
        withId(newStep("message"), "a"),
        withId(newStep("wait"), "b"),
        { ...withId(newStep("ai_response"), "c"), position: { x: -400, y: 900 }, isolated: true },
      ];
      const next = moveStepTo(steps, [2], [], 1); // c runs right after a
      expect(next.map((s) => s.id)).toEqual(["a", "c", "b"]);
      expect(next[1].position).toBeUndefined();
      expect(next[1].isolated).toBeUndefined();
    });

    it("refuses to move a step into its own subtree", () => {
      const steps = flow();
      const next = moveStepTo(steps, [1], [1, "then"], 0); // cond inside its own then
      expect(next.map((s) => s.id)).toEqual(["a", "cond", "c"]);
      expect(getStepAt(next, [1])?.thenSteps?.map((s) => s.id)).toEqual(["t1"]);
    });

    it("is a no-op when the step already sits at the target index", () => {
      const steps = flow();
      const next = moveStepTo(steps, [2], [], 2);
      expect(next.map((s) => s.id)).toEqual(["a", "cond", "c"]);
    });

    it("leaves the original steps untouched", () => {
      const original = flow();
      const frozen = JSON.parse(JSON.stringify(original));
      moveStepTo(original, [1, "then", 0], [], 1);
      expect(original).toEqual(frozen);
    });
  });

  it("isAncestorPath matches a path against itself and its descendants", () => {
    expect(isAncestorPath([1], [1, "then", 0])).toBe(true);
    expect(isAncestorPath([1], [1])).toBe(true);
    expect(isAncestorPath([1], [2])).toBe(false);
    expect(isAncestorPath([1, "then", 0], [1])).toBe(false);
  });
});
