import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchWeb } from "../../lib/web-search";
import { searchKnowledge } from "../../lib/rag";
import { researchLead } from "../../lib/lead-research";
import { getContactBySession, setContactResearch } from "../../lib/business-store";
import { assertToolAllowed } from "../../lib/agent-scope";

export default defineTool({
  description:
    "Research the lead in this conversation: composes the business's own " +
    "knowledge base with a live web search into a short dossier (summary, " +
    "company, notable signals), and saves it on the contact. Use when the " +
    "conversation calls for knowing more about who you're talking to — not " +
    "on every message.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        "What to look up — usually the lead's name or company, plus what matters (e.g. 'Acme Corp, company size and industry').",
      ),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    summary: z.string().optional(),
    companyName: z.string().optional(),
    signals: z.array(z.string()).optional(),
    sources: z.array(z.string()).optional(),
    message: z.string(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "research_lead");

    const contact = await getContactBySession(ctx.session.id);

    const [knowledgeMatches, webResults] = await Promise.all([
      searchKnowledge(input.query, { limit: 5 }).catch(() => []),
      searchWeb(input.query),
    ]);

    const research = await researchLead({
      name: contact?.name,
      notes: contact?.notes,
      knowledge: knowledgeMatches.map((match) => match.text),
      webResults,
    });

    if (!research) {
      return { found: false, message: "Not enough material to research this lead yet." };
    }

    if (contact) await setContactResearch(contact.id, research);

    return {
      found: true,
      summary: research.summary,
      companyName: research.companyName,
      signals: [...research.signals],
      sources: [...research.sources],
      message: contact
        ? "Research saved on the contact."
        : "Research done, but there is no contact yet to save it on.",
    };
  },
});
