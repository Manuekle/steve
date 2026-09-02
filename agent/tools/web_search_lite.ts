import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchWeb } from "../../lib/web-search";
import { assertToolAllowed } from "../../lib/agent-scope";

export default defineTool({
  description:
    "Search the live web for current information not in the knowledge base " +
    "— news, a company's public presence, something outside this business's " +
    "own documents. Requires a Tavily connection in Settings; returns no " +
    "results (not an error) when none is configured.",
  inputSchema: z.object({
    query: z.string().min(1).describe("What to search for, as a plain query."),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    results: z
      .array(z.object({ title: z.string(), url: z.string(), content: z.string() }))
      .optional(),
    message: z.string(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "web_search_lite");
    const results = await searchWeb(input.query);
    if (results.length === 0) {
      return { found: false, message: "No results — check the Tavily connection, or rephrase the query." };
    }
    return { found: true, results: [...results], message: `Found ${results.length} result(s).` };
  },
});
