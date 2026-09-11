import { expect, it } from "vitest";
import { parseStoredSteps, toWorkflowSteps, workflowStepSchema } from "./workflow-schema";

it("preserves AI-generated email settings when a proposal becomes stored steps", () => {
  const input = workflowStepSchema.parse({
    type: "notify_email", emailTo: "team@example.com", emailSubject: "New lead", emailTemplate: "welcome",
  });
  const stored = parseStoredSteps(toWorkflowSteps([input]));
  expect(stored?.[0].config).toMatchObject({ emailTo: "team@example.com", emailSubject: "New lead", emailTemplate: "welcome" });
});
