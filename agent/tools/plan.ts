import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  appendPlanSteps,
  createPlan,
  currentPlan,
  updatePlanSteps,
  type StepUpdate,
} from "../../lib/runtime-store";
import type { RunStepStatus } from "../../lib/types";

// The agent's own checklist, written before the work and ticked off during it.
//
// Two things this buys, and neither is bookkeeping:
//
//   1. **The operator can see the run.** A long turn with no plan is a
//      spinner: the person watching cannot tell a model that is three tool
//      calls into a six-step job from one that is stuck. The runtime page
//      renders these steps live, so "está buscando en el calendario" replaces
//      "está pensando".
//   2. **The model stays on the job.** Writing the steps first, and marking
//      each one, is the cheapest known way to stop a model from answering
//      step 1 and declaring the task finished.
//
// The plan is per session, so a follow-up message continues against the same
// checklist rather than starting a second one. `plan` with action=start
// replaces whatever was open — a new request is a new plan, and merging two
// unrelated checklists would produce a list nobody wrote.

const STATUSES = ["pending", "running", "done", "failed", "skipped"] as const;

export default defineTool({
  description:
    "Track multi-step work as a visible checklist. Call with action=start and a " +
    "list of steps BEFORE beginning any task that needs more than two tool calls " +
    "or that will take a while — a research sweep, a report, a batch of updates. " +
    "Then call action=step as you go: mark a step 'running' when you begin it and " +
    "'done' (with a one-line note of what you found) when you finish. Use " +
    "action=add when the work turns out to need steps you did not foresee, and " +
    "action=status to re-read the plan if you lose track. Do not use this for a " +
    "question you can answer in one reply.",
  inputSchema: z.object({
    action: z.enum(["start", "step", "add", "status"]),
    title: z
      .string()
      .optional()
      .describe("What the whole plan is for, in one line. Required with action=start."),
    steps: z
      .array(z.string())
      .optional()
      .describe(
        "The steps, in order, phrased as what you will do. 2-8 of them. " +
          "Required with action=start and action=add.",
      ),
    step: z
      .union([z.string(), z.number().int()])
      .optional()
      .describe("Which step to mark: its number (1-based) or its id. Required with action=step."),
    status: z
      .enum(STATUSES)
      .optional()
      .describe("The step's new state. Required with action=step."),
    note: z
      .string()
      .optional()
      .describe("One line on what happened in this step. Shown to the operator."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    planId: z.string().optional(),
    title: z.string().optional(),
    steps: z
      .array(
        z.object({
          number: z.number(),
          id: z.string(),
          title: z.string(),
          status: z.string(),
          note: z.string().optional(),
        }),
      )
      .optional(),
    remaining: z.number().optional(),
    message: z.string(),
  }),
  async execute(input, ctx) {
    const sessionId = ctx.session.id;

    const render = (plan: {
      id: string;
      title: string;
      steps: readonly { id: string; title: string; status: string; note?: string }[];
    }) => ({
      planId: plan.id,
      title: plan.title,
      steps: plan.steps.map((step, index) => ({
        number: index + 1,
        id: step.id,
        title: step.title,
        status: step.status,
        ...(step.note ? { note: step.note } : {}),
      })),
      remaining: plan.steps.filter((s) => s.status === "pending" || s.status === "running").length,
    });

    if (input.action === "start") {
      const steps = (input.steps ?? []).map((s) => s.trim()).filter(Boolean);
      if (steps.length === 0) {
        return { success: false, message: "Pasá al menos un paso en `steps`." };
      }
      const plan = await createPlan({
        sessionId,
        title: input.title?.trim() || steps[0],
        steps,
      });
      return {
        success: true,
        ...render(plan),
        message: `Plan creado con ${steps.length} paso(s). Marcá cada uno con action=step.`,
      };
    }

    const plan = await currentPlan(sessionId);
    if (!plan) {
      return {
        success: false,
        message: "No hay un plan abierto en esta conversación. Creá uno con action=start.",
      };
    }

    if (input.action === "status") {
      return { success: true, ...render(plan), message: "Plan actual." };
    }

    if (input.action === "add") {
      const steps = (input.steps ?? []).map((s) => s.trim()).filter(Boolean);
      if (steps.length === 0) {
        return { success: false, message: "Pasá al menos un paso en `steps`." };
      }
      const updated = await appendPlanSteps(plan.id, steps);
      if (!updated) return { success: false, message: "El plan ya no existe." };
      return {
        success: true,
        ...render(updated),
        message: `Agregué ${steps.length} paso(s).`,
      };
    }

    // action === "step"
    if (input.step === undefined || !input.status) {
      return { success: false, message: "Faltan `step` y `status`." };
    }
    const update: StepUpdate = {
      step: input.step,
      status: input.status as RunStepStatus,
      ...(input.note !== undefined ? { note: input.note } : {}),
    };
    const updated = await updatePlanSteps(plan.id, [update]);
    if (!updated) return { success: false, message: "El plan ya no existe." };

    const rendered = render(updated);
    return {
      success: true,
      ...rendered,
      message:
        rendered.remaining === 0
          ? "Plan completo. Respondé con el resultado."
          : `Quedan ${rendered.remaining} paso(s).`,
    };
  },
});
