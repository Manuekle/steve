import { defineAgent } from "eve";
import { subagentModel } from "../../../lib/subagent-model";

// The writing specialist.
//
// Split out because writing well and answering fast are different jobs with
// different prompts. The root agent is optimised for a two-sentence WhatsApp
// reply; a proposal, a follow-up sequence or an ad needs a different voice and
// a lot more room, and putting both sets of instructions in one prompt makes
// each worse.
//
// It writes and returns text. It cannot send anything — no channel tools, no
// send_media, no payment links — so a delegation can never turn into a message
// somebody receives without the root agent (and the operator's own rules)
// deciding to send it.
export default defineAgent({
  description:
    "Escribe textos largos o cuidados: propuestas, secuencias de seguimiento, " +
    "descripciones de producto, posts, respuestas delicadas. Delegá cuando el " +
    "texto importe más que la velocidad. Pasale en el mensaje a quién le " +
    "escribe, qué tiene que lograr, el tono y los datos duros. Devuelve el " +
    "texto; no lo envía.",

  // Follows whatever provider Ajustes is set to — see lib/subagent-model.ts.
  model: subagentModel(),
});
