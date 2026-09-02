import { defineDynamic, defineInstructions } from "eve/instructions";
import { getBusinessIdentity, getBusinessProfile } from "../../lib/business-profile-store";

// What the agent knows about the business it answers for, in two blocks that
// carry very different weight:
//
// - The identity is what the owner typed in on the Conocimiento page: name,
//   website, contact details, legal pages. It is authoritative — the owner
//   wrote it — and it is the only place a contact detail or a link to the
//   terms should come from.
// - The profile is the AI summary generated from the website, Maps listing
//   and uploaded documents (see lib/business-analysis.ts). Deliberately
//   *background*: it tells the model who it's working for and how to sound,
//   but prices, hours, and policies still have to come from search_knowledge.
//   A summary this broad goes stale the moment a price list changes, while
//   the knowledge base gets re-indexed on every upload.
//
// The legal pages are stored as knowledge documents too, so the wording of a
// clause comes back through search_knowledge like any other policy. Only the
// links live here — those the agent should be able to hand over unprompted.
//
// Neither block saved yet adds nothing — the session keeps the general
// instructions it already had, same as persona.ts with no agent assigned.
export default defineDynamic({
  events: {
    "turn.started": async () => {
      const [identity, record] = await Promise.all([getBusinessIdentity(), getBusinessProfile()]);

      const lines: string[] = [];

      const contact = [
        identity.websiteUrl ? `Sitio web: ${identity.websiteUrl}` : null,
        identity.email ? `Email: ${identity.email}` : null,
        identity.phone ? `Teléfono: ${identity.phone}` : null,
        identity.address ? `Dirección: ${identity.address}` : null,
        identity.hours ? `Horarios: ${identity.hours}` : null,
      ].filter((line): line is string => line !== null);

      const hasIdentity =
        Boolean(identity.name || identity.description || identity.terms || identity.privacy) ||
        contact.length > 0;

      if (hasIdentity) {
        lines.push(
          "# The business (entered by the owner)",
          "",
          "These are the owner's own words and are authoritative. A contact detail",
          "or a link below can be given to a customer as-is.",
          "",
        );
        if (identity.name) lines.push(`**${identity.name}**`, "");
        if (identity.description) lines.push(identity.description, "");
        if (contact.length > 0) lines.push(...contact, "");
        if (identity.terms?.url) lines.push(`Términos y condiciones: ${identity.terms.url}`);
        if (identity.privacy?.url) lines.push(`Política de privacidad: ${identity.privacy.url}`);
        if (identity.terms || identity.privacy) {
          lines.push(
            "",
            "El texto completo de esas páginas está indexado: para citar una cláusula,",
            "buscala con `search_knowledge` en vez de resumirla de memoria.",
          );
        }
      }

      if (record) {
        const { profile } = record;
        if (lines.length > 0) lines.push("");
        lines.push(
          "# Business background (AI-generated, not authoritative)",
          "",
          "This is a summary of the business, generated from its website, Google",
          "Maps listing, and/or documents. Use it to understand who you work for and",
          "how to sound — never as the source for a price, hour, or policy. For",
          "those, `search_knowledge` still governs, per the rules above.",
          "",
          `**${profile.name}** — ${profile.industry}`,
          "",
          profile.description,
        );

        if (profile.services.length > 0) {
          lines.push("", "Servicios/productos: " + profile.services.join(", "));
        }
        if (profile.location) lines.push("", `Ubicación: ${profile.location}`);
        if (profile.hours) lines.push("", `Horarios: ${profile.hours}`);
        lines.push("", `Tono de voz: ${profile.tone}`);
        if (profile.highlights.length > 0) {
          lines.push("", "Puntos fuertes:", ...profile.highlights.map((h) => `- ${h}`));
        }
      }

      if (lines.length === 0) return;
      return defineInstructions({ markdown: lines.join("\n") });
    },
  },
});
