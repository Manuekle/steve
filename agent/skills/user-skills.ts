import { defineDynamic, defineSkill } from "eve/skills";
import { skillsForAgent } from "../../lib/skill-store";
import { agentForSession } from "../../lib/agent-scope";

// The business's own procedures, served to the model as loadable skills.
//
// Everything else under agent/skills/ ships with a release. These come out of
// lib/skill-store.ts — written in the app, started from a template, or
// promoted from a document the owner uploaded to Conocimiento — so they have
// to resolve at runtime: adding one has to work on the next turn, not the
// next deploy. That is exactly what dynamic skills are for.
//
// Resolved on `turn.started`, not `session.started`. A WhatsApp conversation
// is a session that can stay open for days; an owner who fixes the refund
// policy at noon should not have to wait for the customer to start a new one.
// The cost is one store read per turn against a document of kilobytes.
//
// ## Naming
//
// Every key is prefixed `negocio-`. A user slug is free text, and eve lets a
// dynamic skill override an authored one of the same name — a customer who
// names their skill "sales-brief" would silently replace ours, and nobody
// would ever find out why the brief changed. The prefix makes that
// impossible and also tells the model, at a glance, which procedures are the
// business's own.

/** Guard rail on the advertised surface. Eve puts every skill's description in
 *  front of the model on every turn, so an owner with sixty skills would pay
 *  for sixty descriptions per message. Newest first, which is what somebody
 *  who just wrote one expects to be live. */
const MAX_ADVERTISED = 24;

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      try {
        // Which agent is answering decides which skills apply: a skill scoped
        // to the sales agent must not load into the support agent's turn. An
        // unassigned channel resolves to `null`, which serves only the skills
        // that target every agent.
        const agent = await agentForSession(ctx.session.id);
        const skills = await skillsForAgent(agent?.id ?? null);
        if (skills.length === 0) return null;

        return Object.fromEntries(
          skills.slice(0, MAX_ADVERTISED).map((skill) => [
            `negocio-${skill.slug}`,
            defineSkill({
              // Falling back to the name is what keeps a half-filled skill
              // routable. An empty description is not "no hint", it is a
              // skill the model can never decide to load.
              description:
                skill.description.trim() ||
                `Procedimiento propio del negocio: ${skill.name}.`,
              markdown: `# ${skill.name}\n\n${skill.markdown}`,
            }),
          ]),
        );
      } catch {
        // A store that cannot be read must not fail the turn. The agent loses
        // the owner's procedures and still answers, which is strictly better
        // than a customer getting nothing.
        return null;
      }
    },
  },
});
