import { defineTool } from "eve/tools";
import { z } from "zod";
import { listDocuments } from "../../lib/knowledge-store";
import { RagError, searchKnowledge } from "../../lib/rag";

// Retrieval over the documents uploaded in the Conocimiento page: prices,
// catalogs, policies, scripts — anything the business wrote down that the
// model was never trained on.

export default defineTool({
  description:
    "Search the business knowledge base (documents uploaded by the team: price lists, " +
    "catalogs, policies, FAQs, manuals). Use this BEFORE answering any question about " +
    "prices, products, services, hours, policies, or internal procedures — the answer is " +
    "usually in a document rather than in your training data. Quote the retrieved text " +
    "and name the source document.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("What to look for, phrased as the user would say it. Search in the user's language."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("How many passages to return. Default 5."),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    results: z
      .array(
        z.object({
          document: z.string(),
          excerpt: z.string(),
          score: z.number(),
        }),
      )
      .optional(),
    message: z.string(),
  }),
  async execute(input) {
    try {
      const matches = await searchKnowledge(input.query, { limit: input.limit ?? 5 });

      if (matches.length === 0) {
        // Distinguish "nothing indexed" from "indexed, no match": the first is
        // a setup gap the agent should say out loud, the second means the
        // answer genuinely isn't in the documents.
        const documents = await listDocuments();
        return {
          found: false,
          message:
            documents.length === 0
              ? "The knowledge base is empty. No documents have been uploaded yet."
              : `No passage in the ${documents.length} indexed document(s) matches that query.`,
        };
      }

      return {
        found: true,
        results: matches.map((match) => ({
          document: match.doc_name,
          excerpt: match.text,
          score: Number(match.score.toFixed(4)),
        })),
        message: `Found ${matches.length} passage(s).`,
      };
    } catch (error) {
      if (error instanceof RagError) {
        return { found: false, message: error.message };
      }
      return { found: false, message: "Knowledge search failed." };
    }
  },
});
