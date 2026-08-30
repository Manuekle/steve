import { defineTool } from "eve/tools";
import { z } from "zod";
import { findMedia } from "../../lib/media-library";
import { countAssets, listFolders } from "../../lib/media-store";

// The lookup half of "¿tenés fotos de la mesa de roble?". Returns asset ids
// that send_stored_media then pushes to the contact — searching and sending
// are separate so the agent can show the customer what it found, or pick
// between three photos, instead of firing the first hit blind.

export default defineTool({
  description:
    "Search the business's saved photo/video/audio library (the files uploaded in the " +
    "Conocimiento page, organized in folders). Use this whenever someone asks to SEE " +
    "something — 'do you have photos of X', 'send me a picture', 'is there a video of it' — " +
    "or whenever showing a file would answer better than describing it. Returns asset ids; " +
    "pass one to send_stored_media to actually send it. This is for existing files: use " +
    "generate_media only when the customer wants something new that does not exist yet.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("What the file should show, in the user's own words — a product, a place, a model. Search in the user's language."),
    kind: z
      .enum(["image", "video", "audio"])
      .optional()
      .describe("Restrict to one media type. Omit unless the customer asked for a specific one."),
    limit: z.number().int().min(1).max(10).optional().describe("How many to return. Default 5."),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    results: z
      .array(
        z.object({
          asset_id: z.string(),
          name: z.string(),
          kind: z.string(),
          folder: z.string().nullable(),
          description: z.string(),
          tags: z.array(z.string()),
          score: z.number(),
        }),
      )
      .optional(),
    message: z.string(),
  }),
  async execute(input) {
    const matches = await findMedia(input.query, {
      limit: input.limit ?? 5,
      kind: input.kind,
    });

    if (matches.length === 0) {
      // Same distinction search_knowledge makes: an empty library is a setup
      // gap worth saying out loud, a library with no match means the file
      // genuinely isn't there and the agent should not promise to send one.
      const total = await countAssets();
      if (total === 0) {
        return {
          found: false,
          message: "The media library is empty — no photos or videos have been uploaded yet.",
        };
      }
      const folders = await listFolders();
      return {
        found: false,
        message:
          `None of the ${total} saved file(s) match that. ` +
          (folders.length > 0
            ? `Folders available: ${folders.map((f) => f.name).join(", ")}.`
            : "They are all in the root folder."),
      };
    }

    return {
      found: true,
      results: matches.map((match) => ({
        asset_id: match.id,
        name: match.name,
        kind: match.kind,
        folder: match.folder_name,
        description: match.description,
        tags: match.tags,
        score: Number(match.score.toFixed(4)),
      })),
      message: `Found ${matches.length} file(s). Send one with send_stored_media.`,
    };
  },
});
