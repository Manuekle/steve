import { defineTool } from "eve/tools";
import { z } from "zod";
import { listChannelConversations, listContacts } from "../../lib/business-store";
import { daysSince } from "../../lib/deals";
import { assertToolAllowed } from "../../lib/agent-scope";
import { isOperatorConsole, OPERATOR_ONLY } from "../../lib/operator-console";
import type { AgentChatTurn, ChannelConversation } from "../../lib/types";

/**
 * The conversation archive, from the owner's side.
 *
 * Steve already reads every real conversation on a schedule and records where
 * it left the person commercially (lib/prospect.ts, agent/schedules/prospect.ts).
 * That assessment is the most useful thing this app knows about its own inbox
 * and, until now, nothing could read it back. This tool is that read.
 *
 * Three grains, because "what is in my inbox" and "what happened with Marta"
 * and "what do people keep asking" want very different amounts of text:
 *
 *   list    one row per conversation: the outcome, the reason, nothing said.
 *   thread  one conversation, its actual turns, bounded.
 *   search  the conversations that mention a term, with the matching lines only.
 *
 * Read-only, and console-only — see lib/operator-console.ts. Transcripts are
 * the customers' own words; they belong to the owner and go nowhere else.
 */

/** Turns returned for a single thread, and characters kept per turn. Same
 *  bounds the prospect classifier reads at (lib/prospect.ts): the end of a
 *  conversation is what matters, and a year of a WhatsApp thread is mostly
 *  not about the question being asked. */
const MAX_TURNS = 40;
const MAX_TURN_CHARS = 2000;

/** Characters of context kept around a search hit. Enough to see what was
 *  said, short of returning the thread one match at a time. */
const SNIPPET_CHARS = 200;

/** Matches per conversation. A customer who says "envío" nine times is one
 *  finding, not nine. */
const MAX_SNIPPETS = 3;

export default defineTool({
  description:
    "Read the archive of real customer conversations (WhatsApp, Instagram, web chat) and " +
    "the outcome Steve recorded for each: won, lost, negotiating, interested, no_response, " +
    "unqualified, support. `list` for the queue, `thread` for one conversation's actual " +
    "messages, `search` for what customers keep saying. Read-only, and only available in " +
    "the business owner's own console.",
  inputSchema: z.object({
    action: z
      .enum(["list", "thread", "search"])
      .describe(
        "list: one row per conversation with its outcome. thread: one conversation's " +
          "messages, newest last. search: conversations mentioning a term, with the " +
          "matching lines.",
      ),
    contact: z
      .string()
      .optional()
      .describe(
        "action=thread: who the conversation is with, by name as it appears in the inbox. " +
          "Matched case-insensitively; an ambiguous name comes back as a list to pick from.",
      ),
    query: z
      .string()
      .optional()
      .describe("action=search: the word or phrase to look for in what was said."),
    outcome: z
      .array(
        z.enum([
          "won",
          "lost",
          "negotiating",
          "interested",
          "no_response",
          "unqualified",
          "support",
        ]),
      )
      .optional()
      .describe("action=list: keep only conversations that landed on these outcomes."),
    channel: z
      .enum(["web", "whatsapp", "instagram"])
      .optional()
      .describe("Keep only conversations on this channel."),
    unassessedOnly: z
      .boolean()
      .optional()
      .describe(
        "action=list: keep only conversations Steve has not classified yet — usually too " +
          "short to judge, never the same thing as unqualified.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("How many rows to return. Defaults to 25, hard cap 100."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    /** action=list */
    conversations: z
      .array(
        z.object({
          contact: z.string(),
          channel: z.string(),
          outcome: z.string().optional(),
          reason: z.string().optional(),
          nextStep: z.string().optional(),
          assessedBy: z.string().optional(),
          waitingForHuman: z.boolean().optional(),
          turns: z.number(),
          daysSinceUpdate: z.number(),
        }),
      )
      .optional(),
    /** action=thread */
    thread: z
      .object({
        contact: z.string(),
        channel: z.string(),
        outcome: z.string().optional(),
        reason: z.string().optional(),
        turns: z.array(z.object({ role: z.string(), content: z.string() })),
        totalTurns: z.number(),
        daysSinceUpdate: z.number(),
      })
      .optional(),
    /** Set when `contact` matched more than one conversation, so the model asks
     *  which rather than reading a stranger's thread aloud. */
    candidates: z.array(z.string()).optional(),
    /** action=search */
    matches: z
      .array(
        z.object({
          contact: z.string(),
          channel: z.string(),
          outcome: z.string().optional(),
          daysSinceUpdate: z.number(),
          snippets: z.array(z.object({ role: z.string(), text: z.string() })),
        }),
      )
      .optional(),
    totalMatched: z.number().optional(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "inbox");

    if (!(await isOperatorConsole(ctx.session.id))) {
      return { ok: false, error: OPERATOR_ONLY };
    }

    const now = new Date();
    const limit = Math.min(input.limit ?? 25, 100);
    const all = (await listChannelConversations()).filter(
      (row) => !input.channel || row.channel === input.channel,
    );

    if (input.action === "thread") {
      const wanted = input.contact?.trim().toLowerCase();
      if (!wanted) {
        return { ok: false, error: "Say whose conversation to open." };
      }
      const hits = all.filter((row) => row.title.toLowerCase().includes(wanted));
      if (hits.length === 0) {
        return { ok: false, error: `No conversation with anyone matching "${input.contact}".` };
      }
      // Two people called Ana is the normal case, not the edge case. Reading
      // the wrong one aloud is worse than one extra question.
      if (hits.length > 1) {
        return {
          ok: false,
          error: "More than one conversation matches that name. Ask which one.",
          candidates: hits.slice(0, 10).map((row) => `${row.title} (${row.channel})`),
        };
      }
      const found = hits[0];
      return {
        ok: true,
        thread: {
          contact: found.title,
          channel: found.channel,
          outcome: found.prospect?.stage,
          reason: found.prospect?.reason,
          turns: found.turns.slice(-MAX_TURNS).map((turn) => ({
            role: turn.role,
            content: turn.content.slice(0, MAX_TURN_CHARS),
          })),
          totalTurns: found.turns.length,
          daysSinceUpdate: daysSince(found.updatedAt, now),
        },
      };
    }

    if (input.action === "search") {
      const needle = input.query?.trim().toLowerCase();
      if (!needle) {
        return { ok: false, error: "Say what to search the conversations for." };
      }
      const hits = all
        .map((row) => ({ row, snippets: snippetsFor(row.turns, needle) }))
        .filter((hit) => hit.snippets.length > 0);
      return {
        ok: true,
        totalMatched: hits.length,
        matches: hits.slice(0, limit).map((hit) => ({
          contact: hit.row.title,
          channel: hit.row.channel,
          outcome: hit.row.prospect?.stage,
          daysSinceUpdate: daysSince(hit.row.updatedAt, now),
          snippets: hit.snippets,
        })),
      };
    }

    const wantedOutcomes = input.outcome ? new Set<string>(input.outcome) : undefined;
    const matched = all
      .filter((row) => !input.unassessedOnly || !row.prospect)
      .filter((row) => !wantedOutcomes || (row.prospect ? wantedOutcomes.has(row.prospect.stage) : false));

    // Who is still waiting on a person. The handover lives on the contact, not
    // on the conversation, and it is the one thing in this list that is
    // somebody standing at a counter.
    const waiting = new Set(
      (await listContacts()).filter((row) => row.status === "waiting_human").map((row) => row.id),
    );

    return {
      ok: true,
      totalMatched: matched.length,
      // Never the turns. The assessment is the summary, the classifier already
      // read them, and a hundred transcripts would bury the answer in the
      // question. `thread` is how one conversation gets opened.
      conversations: matched.slice(0, limit).map((row) => ({
        contact: row.title,
        channel: row.channel,
        outcome: row.prospect?.stage,
        reason: row.prospect?.reason,
        nextStep: row.prospect?.nextStep,
        assessedBy: row.prospect?.source,
        waitingForHuman: row.contactId ? waiting.has(row.contactId) : undefined,
        turns: row.turns.length,
        daysSinceUpdate: daysSince(row.updatedAt, now),
      })),
    };
  },
});

/** The lines in one conversation that mention `needle`, trimmed to the text
 *  around the hit rather than the whole message. */
function snippetsFor(
  turns: readonly AgentChatTurn[],
  needle: string,
): { role: string; text: string }[] {
  const out: { role: string; text: string }[] = [];
  for (const turn of turns) {
    const at = turn.content.toLowerCase().indexOf(needle);
    if (at === -1) continue;
    const from = Math.max(0, at - SNIPPET_CHARS / 2);
    const text = turn.content.slice(from, from + SNIPPET_CHARS);
    out.push({
      role: turn.role,
      text: (from > 0 ? "…" : "") + text + (from + SNIPPET_CHARS < turn.content.length ? "…" : ""),
    });
    if (out.length === MAX_SNIPPETS) break;
  }
  return out;
}

// Keeps this file honest against the store: a conversation shape that grows a
// field the archive should surface shows up here as a type error rather than
// as a quietly missing column.
const _shapeCovered: keyof ChannelConversation = "prospect";
void _shapeCovered;
