import type { WorkflowStep, WorkflowStepType } from "./types";

// Addresses a step inside the recursive WorkflowStep tree. A plain number
// indexes into a steps array; "then"/"else" descends into a condition
// step's branch (the preceding number must point at a "condition" step).
// e.g. [2, "else", 1] = top-level steps[2].elseSteps[1].
export type StepPath = readonly (number | "then" | "else")[];

export function pathsEqual(a: StepPath | null, b: StepPath | null): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((seg, i) => seg === b[i]);
}

let stepIdCounter = 0;
export function newStepId(): string {
  stepIdCounter += 1;
  return `step-${Date.now()}-${stepIdCounter}`;
}

export function newStep(type: WorkflowStepType): WorkflowStep {
  return { id: newStepId(), type, config: {} };
}

function branchKey(key: "then" | "else"): "thenSteps" | "elseSteps" {
  return key === "then" ? "thenSteps" : "elseSteps";
}

/** Read the steps array a path points into (the array itself, not one element). */
function resolveArray(steps: readonly WorkflowStep[], path: StepPath): readonly WorkflowStep[] {
  if (path.length === 0) return steps;
  const [head, ...rest] = path;
  if (typeof head !== "number") {
    throw new Error("resolveArray: path must start with an index");
  }
  const step = steps[head];
  if (!step) throw new Error(`resolveArray: no step at index ${head}`);
  if (rest.length === 0) return steps;
  const [branch, ...afterBranch] = rest;
  if (branch !== "then" && branch !== "else") {
    throw new Error("resolveArray: expected 'then' or 'else' after an index");
  }
  const children = step[branchKey(branch)] ?? [];
  return resolveArray(children, afterBranch);
}

export function getStepAt(steps: readonly WorkflowStep[], path: StepPath): WorkflowStep | undefined {
  if (path.length === 0) return undefined;
  const parentArray = resolveArray(steps, path.slice(0, -1));
  const lastIndex = path[path.length - 1];
  return typeof lastIndex === "number" ? parentArray[lastIndex] : undefined;
}

/** Immutably replace the array a path resolves into. Returns a new top-level steps array. */
function replaceArrayAt(
  steps: readonly WorkflowStep[],
  path: StepPath,
  next: readonly WorkflowStep[],
): WorkflowStep[] {
  if (path.length === 0) return [...next];
  const [head, ...rest] = path;
  if (typeof head !== "number") throw new Error("replaceArrayAt: path must start with an index");
  return steps.map((step, i) => {
    if (i !== head) return step;
    if (rest.length === 0) return step; // shouldn't happen — caller resolves one level deeper
    const [branch, ...afterBranch] = rest;
    if (branch !== "then" && branch !== "else") throw new Error("replaceArrayAt: expected 'then'/'else'");
    const key = branchKey(branch);
    const children = step[key] ?? [];
    return { ...step, [key]: replaceArrayAt(children, afterBranch, next) };
  });
}

export function insertStepAt(
  steps: readonly WorkflowStep[],
  parentPath: StepPath,
  index: number,
  step: WorkflowStep,
): WorkflowStep[] {
  const target = resolveArray(steps, parentPath);
  const next = [...target.slice(0, index), step, ...target.slice(index)];
  return replaceArrayAt(steps, parentPath, next);
}

export function removeStepAt(steps: readonly WorkflowStep[], path: StepPath): WorkflowStep[] {
  const parentPath = path.slice(0, -1);
  const lastIndex = path[path.length - 1];
  if (typeof lastIndex !== "number") return [...steps];
  const target = resolveArray(steps, parentPath);
  const next = target.filter((_, i) => i !== lastIndex);
  return replaceArrayAt(steps, parentPath, next);
}

export function updateStepAt(
  steps: readonly WorkflowStep[],
  path: StepPath,
  updater: (step: WorkflowStep) => WorkflowStep,
): WorkflowStep[] {
  const parentPath = path.slice(0, -1);
  const lastIndex = path[path.length - 1];
  if (typeof lastIndex !== "number") return [...steps];
  const target = resolveArray(steps, parentPath);
  const current = target[lastIndex];
  if (!current) return [...steps];
  const next = target.map((s, i) => (i === lastIndex ? updater(s) : s));
  return replaceArrayAt(steps, parentPath, next);
}

export function moveStepAt(steps: readonly WorkflowStep[], path: StepPath, dir: "up" | "down"): WorkflowStep[] {
  const parentPath = path.slice(0, -1);
  const lastIndex = path[path.length - 1];
  if (typeof lastIndex !== "number") return [...steps];
  const target = resolveArray(steps, parentPath);
  const newIndex = dir === "up" ? lastIndex - 1 : lastIndex + 1;
  if (newIndex < 0 || newIndex >= target.length) return [...steps];
  const next = [...target];
  [next[lastIndex], next[newIndex]] = [next[newIndex]!, next[lastIndex]!];
  return replaceArrayAt(steps, parentPath, next);
}

/** Ensure a condition step has thenSteps/elseSteps arrays (even if empty), for adding the first branch step. */
export function ensureBranches(steps: readonly WorkflowStep[], path: StepPath): WorkflowStep[] {
  return updateStepAt(steps, path, (step) => ({
    ...step,
    thenSteps: step.thenSteps ?? [],
    elseSteps: step.elseSteps ?? [],
  }));
}

/** True when `ancestor` addresses `descendant` itself or one of its parents. */
export function isAncestorPath(ancestor: StepPath, descendant: StepPath): boolean {
  if (ancestor.length > descendant.length) return false;
  return ancestor.every((seg, i) => seg === descendant[i]);
}

/**
 * Re-parent a step (and everything under it) to `toIndex` inside the array at
 * `toParent`. This is what a canvas connection does: dropping node B onto
 * node A's out-port means "B now runs after A", which in a tree model is a
 * move, not a new pointer.
 *
 * Moving clears `isolated` — re-attaching a floating node is the whole point —
 * and drops any manual canvas position, which described the step's old home
 * and would otherwise leave it stranded away from the chain it just joined.
 * Moves that would put a step inside its own subtree are refused (they'd
 * orphan the branch), as is a move that lands where the step already is.
 */
export function moveStepTo(
  steps: readonly WorkflowStep[],
  from: StepPath,
  toParent: StepPath,
  toIndex: number,
): WorkflowStep[] {
  const moving = getStepAt(steps, from);
  if (!moving) return [...steps];
  const fromIndex = from[from.length - 1];
  if (typeof fromIndex !== "number") return [...steps];
  // A step can't become its own descendant.
  if (isAncestorPath(from, toParent)) return [...steps];

  const fromParent = from.slice(0, -1);
  const sameArray = pathsEqual(fromParent, toParent);
  // Removing the step first shifts every later index in that same array down
  // by one, so a target past the old position has to come back one slot.
  const index = sameArray && toIndex > fromIndex ? toIndex - 1 : toIndex;

  // Already in the right place. Wiring an isolated step to the neighbour it
  // was severed from lands here, and still has to restore the connection.
  if (sameArray && index === fromIndex) {
    if (!moving.isolated) return [...steps];
    return updateStepAt(steps, from, ({ isolated: _isolated, ...step }) => step as WorkflowStep);
  }

  const { isolated: _isolated, position: _position, ...reattached } = moving;
  return insertStepAt(removeStepAt(steps, from), toParent, index, reattached as WorkflowStep);
}

/**
 * Drop every manual canvas position, branches included, so the layout engine
 * takes the flow back. Shared by the flow editor's "reset layout" and by the
 * landing's live canvas, which runs the same handlers.
 */
export function stripPositions(steps: readonly WorkflowStep[]): WorkflowStep[] {
  return steps.map(({ position: _position, ...step }) => ({
    ...step,
    ...(step.thenSteps ? { thenSteps: stripPositions(step.thenSteps) } : {}),
    ...(step.elseSteps ? { elseSteps: stripPositions(step.elseSteps) } : {}),
  }));
}
