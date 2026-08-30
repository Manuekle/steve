// The five forms someone can start from.
//
// A blank builder is a worse first screen than a filled one: nobody's first
// question is "what should question one be", it's "does this thing work". Each
// template is a complete, publishable form — scored, with the contact-capture
// step already at the end — so the first thing anyone sees is their own form,
// not an empty canvas.
//
// Copy lives here in both languages rather than in the dictionaries because it
// is seed data, not UI: the strings are copied into the store on creation and
// are the operator's to edit from that moment on. A later dictionary change
// must not rewrite a form somebody already published.

import type { Locale } from "@/lib/i18n/dictionaries";
import type { Form, FormStep } from "@/lib/types";

export type FormTemplateId =
  | "lead_qualifier"
  | "feedback"
  | "event"
  | "applications"
  | "blank";

/** What the wizard asks in its second question, and what each answer starts. */
export type FormPurpose = "leads" | "feedback" | "event" | "applications" | "other";

type TemplateBody = {
  readonly name: string;
  readonly description: string;
  readonly thankYou: string;
  readonly steps: readonly FormStep[];
};

export type FormTemplate = {
  readonly id: FormTemplateId;
  readonly emoji: string;
  /** Which wizard answer this is the recommendation for. */
  readonly purpose: FormPurpose;
  /** Dictionary keys for the picker card — that copy *is* UI. */
  readonly titleKey: string;
  readonly blurbKey: string;
  readonly scoring: { readonly hot: number; readonly warm: number };
  readonly body: Record<Locale, TemplateBody>;
};

/** The last step of every template that collects people rather than opinions.
 *  Unscored: these say who the lead is, not how good it is. */
function contactStep(locale: Locale): FormStep {
  const es = locale === "es";
  return {
    id: "st-contact",
    title: es ? "¿Cómo te contactamos?" : "How do we reach you?",
    fields: [
      {
        id: "fd-name",
        type: "text",
        label: es ? "Tu nombre" : "Your name",
        required: true,
        maps: "name",
        placeholder: es ? "Nombre y apellido" : "First and last name",
      },
      {
        id: "fd-email",
        type: "email",
        label: es ? "Tu email" : "Your email",
        required: true,
        maps: "email",
        placeholder: "nombre@empresa.com",
      },
      {
        id: "fd-phone",
        type: "phone",
        label: es ? "Tu WhatsApp" : "Your WhatsApp",
        required: false,
        maps: "phone",
        placeholder: "+54 11 1234-5678",
      },
    ],
  };
}

const LEAD_QUALIFIER: Record<Locale, TemplateBody> = {
  es: {
    name: "Calificador de leads",
    description: "Puntúa cada respuesta y separa los resultados en calientes y tibios.",
    thankYou: "Listo. Te escribimos en menos de 24 horas.",
    steps: [
      {
        id: "st-source",
        title: "¿De dónde vienen tus leads?",
        description: "Elegí el principal.",
        fields: [
          {
            id: "fd-source",
            type: "single_choice",
            label: "¿De dónde vienen tus leads?",
            required: true,
            choices: [
              { id: "ch-none", emoji: "🚫", label: "Todavía no tengo leads", points: 0 },
              { id: "ch-facebook", label: "Anuncios de Facebook", points: 12 },
              { id: "ch-google", label: "Anuncios de Google", points: 12 },
              { id: "ch-outbound", emoji: "📞", label: "Outbound", points: 8 },
              { id: "ch-lists", emoji: "📋", label: "Listas internas", points: 5 },
              { id: "ch-other", emoji: "➕", label: "De otro lado", points: 5 },
            ],
          },
        ],
      },
      {
        id: "st-volume",
        title: "¿Cuántos te llegan por mes?",
        fields: [
          {
            id: "fd-volume",
            type: "single_choice",
            label: "¿Cuántos leads recibís por mes?",
            required: true,
            choices: [
              { id: "ch-v0", label: "Menos de 10", points: 0 },
              { id: "ch-v10", label: "Entre 10 y 50", points: 6 },
              { id: "ch-v50", label: "Entre 50 y 200", points: 12 },
              { id: "ch-v200", label: "Más de 200", points: 16 },
            ],
          },
        ],
      },
      {
        id: "st-urgency",
        title: "¿Para cuándo lo necesitás?",
        // Sólo a quien ya tiene leads: preguntarle el plazo a alguien que
        // todavía no arrancó no distingue nada.
        showIf: {
          fieldId: "fd-source",
          equals: ["ch-facebook", "ch-google", "ch-outbound", "ch-lists", "ch-other"],
        },
        fields: [
          {
            id: "fd-urgency",
            type: "single_choice",
            label: "¿Cuándo querés resolverlo?",
            required: true,
            choices: [
              { id: "ch-now", emoji: "🔥", label: "Esta semana", points: 12 },
              { id: "ch-month", label: "Este mes", points: 8 },
              { id: "ch-quarter", label: "En los próximos meses", points: 3 },
              { id: "ch-looking", label: "Sólo estoy mirando", points: 0 },
            ],
          },
        ],
      },
    ],
  },
  en: {
    name: "Lead qualifier",
    description: "Scores every answer and splits the results into hot and warm.",
    thankYou: "Done. We'll be in touch within 24 hours.",
    steps: [
      {
        id: "st-source",
        title: "Where do your leads come from?",
        description: "Pick the main one.",
        fields: [
          {
            id: "fd-source",
            type: "single_choice",
            label: "Where do your leads come from?",
            required: true,
            choices: [
              { id: "ch-none", emoji: "🚫", label: "No leads yet", points: 0 },
              { id: "ch-facebook", label: "Facebook Ads", points: 12 },
              { id: "ch-google", label: "Google Ads", points: 12 },
              { id: "ch-outbound", emoji: "📞", label: "Outbound", points: 8 },
              { id: "ch-lists", emoji: "📋", label: "In-house lists", points: 5 },
              { id: "ch-other", emoji: "➕", label: "Somewhere else", points: 5 },
            ],
          },
        ],
      },
      {
        id: "st-volume",
        title: "How many arrive each month?",
        fields: [
          {
            id: "fd-volume",
            type: "single_choice",
            label: "How many leads do you get per month?",
            required: true,
            choices: [
              { id: "ch-v0", label: "Fewer than 10", points: 0 },
              { id: "ch-v10", label: "10 to 50", points: 6 },
              { id: "ch-v50", label: "50 to 200", points: 12 },
              { id: "ch-v200", label: "More than 200", points: 16 },
            ],
          },
        ],
      },
      {
        id: "st-urgency",
        title: "When do you need this?",
        showIf: {
          fieldId: "fd-source",
          equals: ["ch-facebook", "ch-google", "ch-outbound", "ch-lists", "ch-other"],
        },
        fields: [
          {
            id: "fd-urgency",
            type: "single_choice",
            label: "When do you want this solved?",
            required: true,
            choices: [
              { id: "ch-now", emoji: "🔥", label: "This week", points: 12 },
              { id: "ch-month", label: "This month", points: 8 },
              { id: "ch-quarter", label: "In the next few months", points: 3 },
              { id: "ch-looking", label: "Just looking", points: 0 },
            ],
          },
        ],
      },
    ],
  },
};

const FEEDBACK: Record<Locale, TemplateBody> = {
  es: {
    name: "Opiniones de clientes",
    description: "Una encuesta corta de satisfacción con una pregunta NPS.",
    thankYou: "Gracias. Leemos todas las respuestas.",
    steps: [
      {
        id: "st-nps",
        title: "¿Nos recomendarías?",
        description: "De 0 a 10.",
        fields: [
          {
            id: "fd-nps",
            type: "single_choice",
            label: "¿Qué tan probable es que nos recomiendes?",
            required: true,
            choices: [
              { id: "ch-detractor", emoji: "🙁", label: "0 a 6 — no lo haría", points: 0 },
              { id: "ch-passive", emoji: "😐", label: "7 u 8 — tal vez", points: 5 },
              { id: "ch-promoter", emoji: "🙂", label: "9 o 10 — seguro", points: 15 },
            ],
          },
        ],
      },
      {
        id: "st-why",
        title: "¿Por qué?",
        fields: [
          {
            id: "fd-why",
            type: "long_text",
            label: "Contanos por qué elegiste ese número",
            required: false,
            placeholder: "Lo que se te ocurra",
          },
        ],
      },
    ],
  },
  en: {
    name: "Customer feedback",
    description: "A short satisfaction survey with one NPS question.",
    thankYou: "Thank you. We read every response.",
    steps: [
      {
        id: "st-nps",
        title: "Would you recommend us?",
        description: "From 0 to 10.",
        fields: [
          {
            id: "fd-nps",
            type: "single_choice",
            label: "How likely are you to recommend us?",
            required: true,
            choices: [
              { id: "ch-detractor", emoji: "🙁", label: "0 to 6 — I wouldn't", points: 0 },
              { id: "ch-passive", emoji: "😐", label: "7 or 8 — maybe", points: 5 },
              { id: "ch-promoter", emoji: "🙂", label: "9 or 10 — definitely", points: 15 },
            ],
          },
        ],
      },
      {
        id: "st-why",
        title: "Why?",
        fields: [
          {
            id: "fd-why",
            type: "long_text",
            label: "Tell us why you picked that number",
            required: false,
            placeholder: "Whatever comes to mind",
          },
        ],
      },
    ],
  },
};

const EVENT: Record<Locale, TemplateBody> = {
  es: {
    name: "Registro a evento",
    description: "Recoge quién viene, cómo y qué necesita.",
    thankYou: "Quedaste registrado. Te mandamos los detalles por email.",
    steps: [
      {
        id: "st-attend",
        title: "¿Cómo vas a participar?",
        fields: [
          {
            id: "fd-attend",
            type: "single_choice",
            label: "¿Cómo vas a participar?",
            required: true,
            choices: [
              { id: "ch-inperson", emoji: "🎟", label: "Presencial", points: 15 },
              { id: "ch-online", emoji: "💻", label: "Online", points: 8 },
              { id: "ch-maybe", label: "Todavía no sé", points: 3 },
            ],
          },
        ],
      },
      {
        id: "st-needs",
        title: "¿Necesitás algo especial?",
        fields: [
          {
            id: "fd-needs",
            type: "multi_choice",
            label: "Marcá lo que aplique",
            required: false,
            choices: [
              { id: "ch-diet", label: "Comida vegetariana o sin TACC", points: 0 },
              { id: "ch-access", label: "Accesibilidad", points: 0 },
              { id: "ch-translation", label: "Traducción", points: 0 },
            ],
          },
        ],
      },
    ],
  },
  en: {
    name: "Event registration",
    description: "Collects who is coming, how, and what they need.",
    thankYou: "You're registered. We'll email you the details.",
    steps: [
      {
        id: "st-attend",
        title: "How will you attend?",
        fields: [
          {
            id: "fd-attend",
            type: "single_choice",
            label: "How will you attend?",
            required: true,
            choices: [
              { id: "ch-inperson", emoji: "🎟", label: "In person", points: 15 },
              { id: "ch-online", emoji: "💻", label: "Online", points: 8 },
              { id: "ch-maybe", label: "Not sure yet", points: 3 },
            ],
          },
        ],
      },
      {
        id: "st-needs",
        title: "Anything you need?",
        fields: [
          {
            id: "fd-needs",
            type: "multi_choice",
            label: "Tick whatever applies",
            required: false,
            choices: [
              { id: "ch-diet", label: "Vegetarian or gluten-free food", points: 0 },
              { id: "ch-access", label: "Accessibility", points: 0 },
              { id: "ch-translation", label: "Translation", points: 0 },
            ],
          },
        ],
      },
    ],
  },
};

const APPLICATIONS: Record<Locale, TemplateBody> = {
  es: {
    name: "Postulaciones y solicitudes",
    description: "Sirve igual para vacantes que para pedidos de trabajo.",
    thankYou: "Recibimos tu solicitud. Te respondemos pronto.",
    steps: [
      {
        id: "st-about",
        title: "¿Qué estás buscando?",
        fields: [
          {
            id: "fd-kind",
            type: "single_choice",
            label: "¿Qué estás buscando?",
            required: true,
            choices: [
              { id: "ch-job", emoji: "📄", label: "Postularme a una vacante", points: 10 },
              { id: "ch-quote", emoji: "💼", label: "Pedir un presupuesto", points: 15 },
              { id: "ch-info", label: "Sólo información", points: 2 },
            ],
          },
        ],
      },
      {
        id: "st-detail",
        title: "Contanos un poco más",
        fields: [
          {
            id: "fd-detail",
            type: "long_text",
            label: "¿En qué te podemos ayudar?",
            required: true,
            placeholder: "Cuanto más concreto, mejor",
          },
        ],
      },
    ],
  },
  en: {
    name: "Applications and requests",
    description: "Works the same for job openings and for work requests.",
    thankYou: "We got your request. We'll answer soon.",
    steps: [
      {
        id: "st-about",
        title: "What are you after?",
        fields: [
          {
            id: "fd-kind",
            type: "single_choice",
            label: "What are you after?",
            required: true,
            choices: [
              { id: "ch-job", emoji: "📄", label: "Applying to an opening", points: 10 },
              { id: "ch-quote", emoji: "💼", label: "Asking for a quote", points: 15 },
              { id: "ch-info", label: "Just information", points: 2 },
            ],
          },
        ],
      },
      {
        id: "st-detail",
        title: "Tell us a bit more",
        fields: [
          {
            id: "fd-detail",
            type: "long_text",
            label: "What can we help you with?",
            required: true,
            placeholder: "The more specific, the better",
          },
        ],
      },
    ],
  },
};

const BLANK: Record<Locale, TemplateBody> = {
  es: {
    name: "Formulario sin título",
    description: "",
    thankYou: "¡Gracias!",
    steps: [
      {
        id: "st-first",
        title: "Tu primera pregunta",
        fields: [
          {
            id: "fd-first",
            type: "single_choice",
            label: "Tu primera pregunta",
            required: true,
            choices: [
              { id: "ch-a", label: "Primera opción", points: 10 },
              { id: "ch-b", label: "Segunda opción", points: 5 },
            ],
          },
        ],
      },
    ],
  },
  en: {
    name: "Untitled form",
    description: "",
    thankYou: "Thank you!",
    steps: [
      {
        id: "st-first",
        title: "Your first question",
        fields: [
          {
            id: "fd-first",
            type: "single_choice",
            label: "Your first question",
            required: true,
            choices: [
              { id: "ch-a", label: "First option", points: 10 },
              { id: "ch-b", label: "Second option", points: 5 },
            ],
          },
        ],
      },
    ],
  },
};

export const FORM_TEMPLATES: readonly FormTemplate[] = [
  {
    id: "lead_qualifier",
    emoji: "🎯",
    purpose: "leads",
    titleKey: "forms.template.leadQualifier",
    blurbKey: "forms.template.leadQualifierBlurb",
    // The qualifier is the one template whose whole point is the split, so its
    // thresholds sit where a full-marks answer lands hot and a half-hearted
    // one lands warm — see the points above.
    scoring: { hot: 28, warm: 12 },
    body: LEAD_QUALIFIER,
  },
  {
    id: "feedback",
    emoji: "📝",
    purpose: "feedback",
    titleKey: "forms.template.feedback",
    blurbKey: "forms.template.feedbackBlurb",
    // NPS: promoters run hot, passives warm, detractors cold.
    scoring: { hot: 15, warm: 5 },
    body: FEEDBACK,
  },
  {
    id: "event",
    emoji: "🎟",
    purpose: "event",
    titleKey: "forms.template.event",
    blurbKey: "forms.template.eventBlurb",
    scoring: { hot: 15, warm: 8 },
    body: EVENT,
  },
  {
    id: "applications",
    emoji: "📄",
    purpose: "applications",
    titleKey: "forms.template.applications",
    blurbKey: "forms.template.applicationsBlurb",
    scoring: { hot: 15, warm: 10 },
    body: APPLICATIONS,
  },
  {
    id: "blank",
    emoji: "✍",
    purpose: "other",
    titleKey: "forms.template.blank",
    blurbKey: "forms.template.blankBlurb",
    scoring: { hot: 10, warm: 5 },
    body: BLANK,
  },
];

export function getTemplate(id: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((template) => template.id === id);
}

/** The template the wizard puts first for a given answer. Everything else
 *  stays on the picker — a recommendation is not a decision. */
export function recommendedTemplate(purpose: FormPurpose): FormTemplateId {
  return FORM_TEMPLATES.find((template) => template.purpose === purpose)?.id ?? "blank";
}

/** A template turned into the form body to store. Ids are namespaced per form
 *  by the store, so two forms from the same template never collide. */
export function templateToForm(
  template: FormTemplate,
  locale: Locale,
): Pick<Form, "name" | "description" | "steps" | "scoring" | "thankYou"> {
  const body = template.body[locale] ?? template.body.es;
  return {
    name: body.name,
    description: body.description,
    thankYou: body.thankYou,
    scoring: template.scoring,
    // Feedback is the one template that is not collecting a person, but an
    // opinion — and an anonymous survey gets more answers than a signed one.
    steps: template.id === "feedback" ? body.steps : [...body.steps, contactStep(locale)],
  };
}
