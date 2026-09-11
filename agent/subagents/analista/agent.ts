import { defineAgent } from "eve";
import { subagentModel } from "../../../lib/subagent-model";

// The numbers specialist.
//
// A declared subagent inherits nothing from the root — not the instructions,
// not the tools, not the sandbox (node_modules/eve/docs/subagents.mdx, "The
// isolation boundary"). That is the point here rather than a cost: the root
// agent is a salesperson talking to a customer, and the last thing a customer
// conversation needs is a second copy of itself with the whole toolbox.
//
// This one gets facts in its `message` and returns a reading of them. It has
// no access to the CRM on purpose: `pipeline` and `inbox` are gated on the
// owner's own console (lib/operator-console.ts), and a child session has no
// contact, so it would fail closed anyway. Passing the rows in the message is
// both what eve prescribes and the only shape that cannot leak an account's
// data into a delegation nobody audited.
export default defineAgent({
  description:
    "Analiza números del negocio: cifras de pipeline, conversión, precios, " +
    "márgenes, tendencias. Delegá cuando haya que sacar conclusiones de un " +
    "conjunto de datos y no solo responder una pregunta. Pasale los datos " +
    "completos en el mensaje: no ve la conversación ni la base de datos.",

  // Follows whatever provider Ajustes is set to — see lib/subagent-model.ts.
  model: subagentModel(),
});
