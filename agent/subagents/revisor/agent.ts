import { defineAgent } from "eve";
import { subagentModel } from "../../../lib/subagent-model";

// The last check before something goes out.
//
// This is the subagent that earns its keep. A model reviewing its own draft in
// the same context agrees with itself: it has the reasons it wrote each line
// still in front of it. A fresh session with only the draft, the rules and the
// documents has none of that, which is the whole reason a declared subagent
// starts with empty history — see "The isolation boundary" in
// node_modules/eve/docs/subagents.mdx.
//
// Returns a verdict, not a rewrite. If it rewrote the text it would be a
// second redactor, and nobody would ever see what was wrong with the first
// draft.
export default defineAgent({
  description:
    "Revisa un texto antes de que salga: chequea que los precios, plazos y " +
    "políticas coincidan con los documentos del negocio, y que no prometa " +
    "nada fuera de las reglas. Delegá antes de mandar cualquier cosa con " +
    "cifras o compromisos. Pasale el texto completo y para quién es. Devuelve " +
    "aprobado/rechazado con la lista de problemas.",

  // Follows whatever provider Ajustes is set to — see lib/subagent-model.ts.
  model: subagentModel(),
});
