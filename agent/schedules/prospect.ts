import { defineSchedule } from "eve/schedules";
import { scheduleCron } from "../../lib/schedule-cron";
import {
  listAllVoiceCalls,
  listChannelConversations,
  setConversationProspect,
  setVoiceCallProspect,
} from "../../lib/business-store";
import { assessProspect, isProspectStale } from "../../lib/prospect";

// Where every real conversation left the customer, kept up to date on its own.
//
// This runs on a schedule rather than at the end of each turn because a
// conversation is not over when a turn is: labelling after every message
// would pay for a model call per message and would keep relabelling a chat
// that is still being typed. A few minutes behind is the right distance.

/** Model calls per run. Bounds what a busy day can cost, and the backlog
 *  drains over the following runs. */
const MAX_PER_RUN = 8;

/** Under this, there is nothing to judge — a greeting is not an outcome. */
const MIN_TURNS = 3;

export default defineSchedule({
  cron: scheduleCron("prospect", "*/5 * * * *"),
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        let budget = MAX_PER_RUN;

        const conversations = await listChannelConversations();
        for (const conversation of conversations) {
          if (budget <= 0) break;
          if (conversation.turns.length < MIN_TURNS) continue;
          if (!isProspectStale(conversation.prospect, conversation.turns.length)) continue;
          // A person's own call stands until the conversation moves past it.
          if (conversation.prospect?.source === "manual") continue;

          budget -= 1;
          const assessment = await assessProspect({
            turns: conversation.turns,
            medium: "chat",
          });
          if (assessment) await setConversationProspect(conversation.id, assessment);
        }

        const calls = await listAllVoiceCalls();
        for (const call of calls) {
          if (budget <= 0) break;
          // The transcript arrives with the post-call webhook, so a call is
          // worth reading only once that has landed.
          if (call.transcript.length < MIN_TURNS) continue;
          if (!isProspectStale(call.prospect, call.transcript.length)) continue;
          if (call.prospect?.source === "manual") continue;

          budget -= 1;
          const assessment = await assessProspect({
            medium: "call",
            turns: call.transcript.map((turn) => ({
              role: turn.role === "user" ? ("user" as const) : ("assistant" as const),
              content: turn.message,
            })),
          });
          if (assessment) await setVoiceCallProspect(call.id, assessment);
        }
      })(),
    );
  },
});
