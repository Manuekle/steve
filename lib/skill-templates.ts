import type { Locale } from "./i18n/dictionaries";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Chatting01Icon,
  Tag01Icon,
  ComplaintIcon,
  Calendar02Icon,
  Target01Icon,
  Megaphone01Icon,
} from "@hugeicons/core-free-icons";

// Starting points for the owner's own skills.
//
// A blank markdown editor is a wall. Almost nobody writing their first skill
// knows that the *description* is the part the model routes on, that steps
// beat prose, or that the useful half of a procedure is the "when NOT to use
// this" section. So every template ships with all three already in place and
// the business-specific blanks marked, which turns the job from "write a
// procedure" into "fill in five lines".
//
// These mirror the shape of the authored skills in agent/skills/*.ts on
// purpose: same headings, same order. An owner who outgrows a template and
// opens one of ours next finds a document they already know how to read.
//
// ## Why the body is per locale and not a dictionary key
//
// Everything else translatable in this app is a key in lib/i18n. These are
// not, and the difference is real: a dictionary string is *chrome* the app
// renders, while a template body is a **draft the owner then edits and
// saves**. Once saved it is their document, in their language, and no longer
// tracks this file at all. Keys would put a 2 KB markdown document in both
// dictionaries — which every page loads — to be read once, by the one person
// who clicked the template.

export type SkillTemplateCategory = "ventas" | "soporte" | "operaciones" | "marketing";

/** The half of a template that changes with the reader's language. */
export type SkillTemplateContent = {
  readonly name: string;
  /** One line for the picker — what this template is for, in the owner's words. */
  readonly summary: string;
  /** Pre-filled routing hint. The owner edits it; it is never left empty. */
  readonly description: string;
  /** The procedure itself, as the editor opens it. */
  readonly markdown: string;
};

export type SkillTemplate = {
  readonly id: string;
  readonly category: SkillTemplateCategory;
  readonly icon: IconSvgElement;
  readonly accent: string;
  readonly es: SkillTemplateContent;
  readonly en: SkillTemplateContent;
};

/** The placeholder the templates use for "you have to fill this in". Shown in
 *  the editor as a warning count so nobody saves a skill that still says
 *  `[…]` in the middle of a price policy. Locale-independent on purpose: an
 *  owner writing in Spanish still sees the same marker after switching the
 *  interface to English, and a saved skill keeps whatever it was written with. */
export const TEMPLATE_PLACEHOLDER = "[completar]";

export const SKILL_TEMPLATES: readonly SkillTemplate[] = [
  {
    id: "atencion-primer-contacto",
    category: "soporte",
    icon: Chatting01Icon,
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    es: {
      name: "Primer contacto",
      summary: "Cómo saludar, qué preguntar y cuándo pasar a una persona.",
      description:
        "Usar cuando llega un mensaje de alguien que escribe por primera vez, " +
        "o cuando hay que abrir una conversación sin contexto previo.",
      markdown: `## Cuándo usarla

- Primer mensaje de un número o cuenta desconocida.
- Un lead que llega de un formulario o de un anuncio.

## Cuándo NO usarla

- Ya hay historial con esa persona — seguí el hilo, no vuelvas a presentarte.
- La persona pidió explícitamente hablar con alguien del equipo.

## Pasos

1. **Saludá y decí quién sos.** Una línea. "${TEMPLATE_PLACEHOLDER}".
2. **Preguntá qué necesita**, sin listar el catálogo entero.
3. **Buscá antes de responder.** Usá search_knowledge para precios, horarios,
   servicios y políticas. No inventes ninguno de esos cuatro.
4. **Guardá el contacto.** upsert_contact con el nombre y el canal.
5. **Cerrá con un próximo paso concreto**: una fecha, un link, una respuesta.

## Qué nunca hacemos

- Prometer plazos o descuentos que no estén en la base de conocimiento.
- Pedir datos de tarjeta o contraseñas por chat.

## Cuándo llamamos a una persona

${TEMPLATE_PLACEHOLDER} — por ejemplo: un reclamo, un pedido de factura, o
cualquier cosa que la persona pida dos veces sin quedar conforme.
`,
    },
    en: {
      name: "First contact",
      summary: "How to greet, what to ask, and when to hand over to a person.",
      description:
        "Use when a message arrives from someone writing for the first time, " +
        "or when a conversation has to be opened with no prior context.",
      markdown: `## When to use it

- First message from an unknown number or account.
- A lead arriving from a form or an ad.

## When NOT to use it

- There is already history with this person — follow the thread, do not
  introduce yourself again.
- They explicitly asked to speak to someone on the team.

## Steps

1. **Say hello and say who you are.** One line. "${TEMPLATE_PLACEHOLDER}".
2. **Ask what they need**, without listing the whole catalogue.
3. **Look it up before answering.** Use search_knowledge for prices, hours,
   services and policies. Never invent any of those four.
4. **Save the contact.** upsert_contact with the name and the channel.
5. **Close with a concrete next step**: a date, a link, an answer.

## What we never do

- Promise timelines or discounts that are not in the knowledge base.
- Ask for card details or passwords over chat.

## When we call a person in

${TEMPLATE_PLACEHOLDER} — for example: a complaint, an invoice request, or
anything the person asks twice without being satisfied.
`,
    },
  },
  {
    id: "objecion-precio",
    category: "ventas",
    icon: Tag01Icon,
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    es: {
      name: "Objeción de precio",
      summary: "Qué responder cuando dicen que es caro, sin regalar el margen.",
      description:
        "Usar cuando el cliente dice que el precio es alto, pide descuento, " +
        "compara con la competencia o pregunta si hay algo más barato.",
      markdown: `## Cuándo usarla

- "Es caro", "¿tenés algo más barato?", "me pasaron un precio mejor".
- Pedido directo de descuento.

## Cuándo NO usarla

- Todavía no dijimos el precio — primero entendé qué necesita.
- La objeción real no es el precio (plazo, confianza, alcance).

## Pasos

1. **No bajes el precio en el primer mensaje.** Nunca.
2. **Preguntá contra qué compara.** Casi siempre son dos cosas distintas.
3. **Nombrá lo que está incluido** y que el otro presupuesto probablemente no
   incluye: ${TEMPLATE_PLACEHOLDER}.
4. **Ofrecé la alternativa real**, si existe: ${TEMPLATE_PLACEHOLDER}.
5. **Si insisten**, ofrecé lo único que sí está autorizado:
   ${TEMPLATE_PLACEHOLDER} (por ejemplo, plan de pago, no descuento).

## Qué nunca hacemos

- Improvisar un porcentaje de descuento.
- Hablar mal de un competidor.

## Cuándo llamamos a una persona

Cualquier pedido de descuento por encima de ${TEMPLATE_PLACEHOLDER}.
`,
    },
    en: {
      name: "Price objection",
      summary: "What to say when they call it expensive, without giving away margin.",
      description:
        "Use when a customer says the price is high, asks for a discount, " +
        "compares with a competitor, or asks whether there is anything cheaper.",
      markdown: `## When to use it

- "That's expensive", "do you have anything cheaper?", "I was quoted less".
- A direct request for a discount.

## When NOT to use it

- The price has not been given yet — understand what they need first.
- The real objection is not price (timeline, trust, scope).

## Steps

1. **Never drop the price in the first reply.** Not once.
2. **Ask what they are comparing against.** It is almost always two different
   things.
3. **Name what is included** and what the other quote probably leaves out:
   ${TEMPLATE_PLACEHOLDER}.
4. **Offer the real alternative**, if one exists: ${TEMPLATE_PLACEHOLDER}.
5. **If they insist**, offer the only thing that is actually authorised:
   ${TEMPLATE_PLACEHOLDER} (a payment plan, say — not a discount).

## What we never do

- Improvise a discount percentage.
- Talk a competitor down.

## When we call a person in

Any discount request above ${TEMPLATE_PLACEHOLDER}.
`,
    },
  },
  {
    id: "reclamo-devolucion",
    category: "soporte",
    icon: ComplaintIcon,
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    es: {
      name: "Reclamo y devolución",
      summary: "El paso a paso de un reclamo, con los límites de lo que se promete.",
      description:
        "Usar cuando un cliente reclama por un producto o servicio, pide una " +
        "devolución, un cambio o un reembolso.",
      markdown: `## Cuándo usarla

- "Me llegó mal", "no funciona", "quiero devolverlo", "quiero que me devuelvan la plata".

## Cuándo NO usarla

- Es una consulta previa a la compra.
- Es un problema de envío que todavía está en tránsito.

## Pasos

1. **Reconocé el problema en una línea**, sin excusas y sin echar culpas.
2. **Pedí los tres datos que hacen falta**: qué compró, cuándo, y qué pasó.
3. **Chequeá la política real** con search_knowledge antes de decir qué se puede.
   Plazo de devolución: ${TEMPLATE_PLACEHOLDER}.
4. **Decí qué sigue y cuándo**, con una fecha concreta.
5. **Dejá registro.** upsert_contact con la nota del reclamo.

## Qué nunca hacemos

- Confirmar un reembolso que no está aprobado.
- Prometer una fecha de resolución que no controlamos.

## Cuándo llamamos a una persona

Siempre que el monto supere ${TEMPLATE_PLACEHOLDER}, o si la persona ya reclamó antes.
`,
    },
    en: {
      name: "Complaint and return",
      summary: "The steps of a complaint, with the limits on what gets promised.",
      description:
        "Use when a customer complains about a product or service, or asks for " +
        "a return, an exchange or a refund.",
      markdown: `## When to use it

- "It arrived damaged", "it doesn't work", "I want to return it", "I want my money back".

## When NOT to use it

- It is a pre-purchase question.
- It is a delivery problem while the parcel is still in transit.

## Steps

1. **Acknowledge the problem in one line**, with no excuses and no blame.
2. **Ask for the three things needed**: what they bought, when, and what happened.
3. **Check the real policy** with search_knowledge before saying what is possible.
   Return window: ${TEMPLATE_PLACEHOLDER}.
4. **Say what happens next and when**, with a concrete date.
5. **Leave a record.** upsert_contact with a note about the complaint.

## What we never do

- Confirm a refund that has not been approved.
- Promise a resolution date we do not control.

## When we call a person in

Whenever the amount is over ${TEMPLATE_PLACEHOLDER}, or the person has
complained before.
`,
    },
  },
  {
    id: "agenda-turno",
    category: "operaciones",
    icon: Calendar02Icon,
    accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    es: {
      name: "Agendar un turno",
      summary: "Cómo se toma una reserva sin pisar la agenda.",
      description:
        "Usar cuando alguien quiere reservar, sacar turno, agendar una reunión " +
        "o cambiar una cita existente.",
      markdown: `## Cuándo usarla

- "Quiero sacar turno", "¿tenés lugar el jueves?", "necesito cambiar mi cita".

## Cuándo NO usarla

- La persona todavía está preguntando precios o disponibilidad general.

## Pasos

1. **Mirá la agenda antes de ofrecer horarios.** Usá la herramienta calendar.
   Nunca ofrezcas un horario sin haberlo verificado.
2. **Ofrecé dos opciones concretas**, no un rango abierto.
3. **Confirmá con nombre, fecha, hora y duración** en un solo mensaje.
4. **Creá el evento** y **guardá el contacto**.
5. **Programá el recordatorio**: ${TEMPLATE_PLACEHOLDER} antes del turno.

## Datos del negocio

- Horario de atención: ${TEMPLATE_PLACEHOLDER}
- Duración estándar del turno: ${TEMPLATE_PLACEHOLDER}
- Política de cancelación: ${TEMPLATE_PLACEHOLDER}

## Qué nunca hacemos

- Confirmar dos turnos en el mismo horario.
- Agendar fuera del horario de atención sin autorización.
`,
    },
    en: {
      name: "Book an appointment",
      summary: "How a booking is taken without double-booking the calendar.",
      description:
        "Use when somebody wants to book, get an appointment, schedule a meeting " +
        "or change an existing one.",
      markdown: `## When to use it

- "I'd like an appointment", "any space on Thursday?", "I need to move my booking".

## When NOT to use it

- The person is still asking about prices or general availability.

## Steps

1. **Check the calendar before offering times.** Use the calendar tool. Never
   offer a slot you have not verified.
2. **Offer two concrete options**, not an open range.
3. **Confirm name, date, time and duration** in a single message.
4. **Create the event** and **save the contact**.
5. **Schedule the reminder**: ${TEMPLATE_PLACEHOLDER} before the appointment.

## Business details

- Opening hours: ${TEMPLATE_PLACEHOLDER}
- Standard appointment length: ${TEMPLATE_PLACEHOLDER}
- Cancellation policy: ${TEMPLATE_PLACEHOLDER}

## What we never do

- Confirm two appointments in the same slot.
- Book outside opening hours without approval.
`,
    },
  },
  {
    id: "seguimiento-lead",
    category: "ventas",
    icon: Target01Icon,
    accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    es: {
      name: "Seguimiento de un lead",
      summary: "Cuándo insistir, cuántas veces y con qué decir.",
      description:
        "Usar cuando hay que hacer seguimiento de un lead que no respondió, " +
        "o retomar una conversación que quedó fría.",
      markdown: `## Cuándo usarla

- Pasaron ${TEMPLATE_PLACEHOLDER} días sin respuesta después de una cotización.
- El lead pidió "escribime la semana que viene".

## Cuándo NO usarla

- La persona dijo que no. Un no es un no.
- Ya se le escribió tres veces sin respuesta — cerralo y anotalo.

## Pasos

1. **Leé el historial primero.** Un seguimiento que repite la pregunta anterior
   dice que nadie leyó nada.
2. **Escribí una sola cosa**: la novedad, la pregunta o el vencimiento.
3. **Dale una salida fácil.** "Si ya no aplica, decímelo y no te escribo más"
   convierte más que insistir.
4. **Actualizá el estado en el pipeline.**

## Cadencia

- Primer seguimiento: ${TEMPLATE_PLACEHOLDER}
- Segundo: ${TEMPLATE_PLACEHOLDER}
- Tercero y último: ${TEMPLATE_PLACEHOLDER}

## Qué nunca hacemos

- Mandar el mismo mensaje dos veces.
- Escribir fuera del horario de atención.
`,
    },
    en: {
      name: "Following up a lead",
      summary: "When to chase, how many times, and what to say.",
      description:
        "Use when a lead who never replied needs a follow-up, or a conversation " +
        "that went cold has to be picked back up.",
      markdown: `## When to use it

- ${TEMPLATE_PLACEHOLDER} days have passed with no reply after a quote.
- The lead said "write to me next week".

## When NOT to use it

- They said no. No means no.
- They have been written to three times with no reply — close it and note why.

## Steps

1. **Read the history first.** A follow-up that repeats the previous question
   tells them nobody read anything.
2. **Write about one thing**: the news, the question, or the deadline.
3. **Give them an easy way out.** "If this is no longer relevant, tell me and I
   won't write again" converts better than chasing.
4. **Update the stage in the pipeline.**

## Cadence

- First follow-up: ${TEMPLATE_PLACEHOLDER}
- Second: ${TEMPLATE_PLACEHOLDER}
- Third and last: ${TEMPLATE_PLACEHOLDER}

## What we never do

- Send the same message twice.
- Write outside business hours.
`,
    },
  },
  {
    id: "tono-de-marca",
    category: "marketing",
    icon: Megaphone01Icon,
    accent: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    es: {
      name: "Tono de marca",
      summary: "Cómo suena el negocio: palabras que sí, palabras que no.",
      description:
        "Usar antes de escribir cualquier texto público: un post, un anuncio, " +
        "un email o una respuesta que va a leer un cliente.",
      markdown: `Cómo suena ${TEMPLATE_PLACEHOLDER} cuando habla.

## Cuándo usarla

- Antes de escribir un post, un anuncio, un email o una respuesta pública.

## Cómo sonamos

- ${TEMPLATE_PLACEHOLDER}
- ${TEMPLATE_PLACEHOLDER}

## Cómo NO sonamos

- ${TEMPLATE_PLACEHOLDER}

## Palabras que usamos

${TEMPLATE_PLACEHOLDER}

## Palabras que no usamos

${TEMPLATE_PLACEHOLDER}

## Reglas duras

- Nada de emojis en textos de facturación o reclamos.
- Nunca prometemos resultados que no podemos medir.
- Tratamos de ${TEMPLATE_PLACEHOLDER} (vos / usted / tú), siempre igual.
`,
    },
    en: {
      name: "Brand voice",
      summary: "How the business sounds: words we use, words we don't.",
      description:
        "Use before writing anything public: a post, an ad, an email, or any " +
        "reply a customer will read.",
      markdown: `How ${TEMPLATE_PLACEHOLDER} sounds when it speaks.

## When to use it

- Before writing a post, an ad, an email or a public reply.

## How we sound

- ${TEMPLATE_PLACEHOLDER}
- ${TEMPLATE_PLACEHOLDER}

## How we do NOT sound

- ${TEMPLATE_PLACEHOLDER}

## Words we use

${TEMPLATE_PLACEHOLDER}

## Words we avoid

${TEMPLATE_PLACEHOLDER}

## Hard rules

- No emoji in billing or complaint messages.
- We never promise results we cannot measure.
- We address people as ${TEMPLATE_PLACEHOLDER}, consistently.
`,
    },
  },
];

/** One template's content in the reader's language. */
export function templateContent(
  template: SkillTemplate,
  locale: Locale,
): SkillTemplateContent {
  return locale === "en" ? template.en : template.es;
}

export function getSkillTemplate(id: string): SkillTemplate | undefined {
  return SKILL_TEMPLATES.find((template) => template.id === id);
}

/** How many blanks are still unfilled. The editor shows this so a template
 *  cannot quietly ship with `[completar]` in the middle of a price policy. */
export function countPlaceholders(markdown: string): number {
  return markdown.split(TEMPLATE_PLACEHOLDER).length - 1;
}
