import type { LanguageModel } from "ai";
import { resolveLanguageModel, resolveProvider, type AiProvider } from "./ai-provider";
import { FALLBACK_MODEL, pickForTask, type ModelTask } from "./model-catalog";
import { listModels } from "./provider-catalog";
import { readAccessSync } from "./model-access";

// "Use the right model for this job" in one call.
//
// Every server-side model call in the app names the task it is doing rather
// than a model id, so the choice lives in one ranked table (lib/model-catalog)
// instead of being copy-pasted as a literal into each route.

/** The id to use for a task, checked against what the provider offers. */
export async function modelIdForTask(
  task: ModelTask,
  provider: AiProvider = resolveProvider(),
): Promise<string> {
  try {
    const restricted = readAccessSync().restricted;
    // A model the account is not allowed to call is not a candidate, however
    // well it ranks — picking it would fail the request it was chosen for.
    const usable = (await listModels(provider)).filter((model) => !(model.id in restricted));
    return pickForTask(provider, task, usable);
  } catch {
    // A catalog fetch failure must not take down the feature that needed a
    // model — fall back to the id we would have picked anyway.
    return FALLBACK_MODEL[provider];
  }
}

/** A callable model for a task, routed through whichever provider is active. */
export async function languageModelForTask(
  task: ModelTask,
  provider: AiProvider = resolveProvider(),
): Promise<LanguageModel> {
  return resolveLanguageModel(await modelIdForTask(task, provider));
}
