import { disableTool } from "eve/tools";

// Provider web search, off.
//
// `web_search` is provider-managed: the framework ships it with a null
// inputSchema on purpose, expecting the model provider to swap in its own
// hosted tool. That swap only happens for a tool marked `type: "provider"`
// with the id `openai.web_search`; on this install the definition reaches the
// OpenAI Responses API as an ordinary function instead, and the API rejects
// the whole request:
//
//   Invalid schema for function 'web_search': schema must be a JSON Schema
//   of 'type: "object"', got 'type: "None"'.   (param: tools[24].parameters)
//
// It is a 400 on the *request*, so it does not degrade one tool call — it
// kills every turn, and a customer on WhatsApp gets an error instead of an
// answer. Disabled until the framework resolves it to the provider tool.
// Re-enable by restoring `export default webSearch` from "eve/tools/defaults"
// and re-testing against the configured model.
export default disableTool();
