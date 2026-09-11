#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return next(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

function loadEnv(path) {
  try {
    const contents = readFileSync(path, "utf8");
    for (const line of contents.split("\n")) {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, key, raw] = match;
      if (process.env[key]) continue;
      process.env[key] = raw.replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Optional environment files are loaded when present.
  }
}

loadEnv(new URL("../.env", import.meta.url));
loadEnv(new URL("../.env.local", import.meta.url));

const {
  createAgent,
  createDeal,
  createForm,
  createReminder,
  ingestLead,
  listAgentChats,
  listAgents,
  listChannelConversations,
  listChats,
  listContacts,
  listDeals,
  listForms,
  listReminders,
  saveAgentChat,
  saveFormResponse,
  upsertChat,
} = await import("../lib/business-store.ts");
const { accountExists } = await import("../lib/auth/store.ts");

const now = Date.now();
const iso = (offsetDays = 0, offsetHours = 0) =>
  new Date(now - offsetDays * 86_400_000 - offsetHours * 3_600_000).toISOString();

const demoContacts = [
  {
    name: "Sofía Martínez",
    email: "sofia.martinez@example.test",
    phone: "+573001234501",
    channel: "whatsapp",
    source: "whatsapp",
    status: "open",
    lastMessage: "Quiero conocer opciones para automatizar mis reservas.",
    attributes: { ciudad: "Bogotá", segmento: "servicios", prioridad: "alta" },
    notes: "Lead demo caliente para revisar flujo comercial.",
  },
  {
    name: "Carlos Ramírez",
    email: "carlos.ramirez@example.test",
    phone: "+573001234502",
    channel: "instagram",
    source: "instagram",
    status: "waiting_human",
    lastMessage: "¿Pueden enviarme una propuesta esta semana?",
    attributes: { ciudad: "Medellín", segmento: "retail", prioridad: "media" },
  },
  {
    name: "Valentina Gómez",
    email: "valentina.gomez@example.test",
    phone: "+573001234503",
    channel: "web",
    source: "web-chat",
    status: "followup_due",
    lastMessage: "Lo consulto con mi equipo y les confirmo.",
    attributes: { ciudad: "Cali", segmento: "educación", prioridad: "media" },
  },
  {
    name: "Diego Torres",
    email: "diego.torres@example.test",
    phone: "+573001234504",
    channel: "form",
    source: "form:diagnostico-demo",
    status: "closed",
    lastMessage: "Gracias, ya contratamos otra solución.",
    attributes: { ciudad: "Barranquilla", segmento: "consultoría", prioridad: "baja" },
  },
];

const contacts = [];
for (const input of demoContacts) contacts.push(await ingestLead(input));

const chatData = [
  ["demo-sofia", contacts[0], "whatsapp", "Sofía Martínez", "Quiero conocer opciones para automatizar mis reservas.", 12, true],
  ["demo-carlos", contacts[1], "instagram", "Carlos Ramírez", "¿Pueden enviarme una propuesta esta semana?", 8, false],
  ["demo-valentina", contacts[2], "web", "Valentina Gómez", "Lo consulto con mi equipo y les confirmo.", 6, false],
  ["demo-diego", contacts[3], "web", "Diego Torres", "Gracias, ya contratamos otra solución.", 4, false],
];
for (const [id, contact, channel, title, lastMessage, messageCount, pinned] of chatData) {
  await upsertChat({
    id,
    sessionId: id,
    channel,
    title,
    lastMessage,
    lastMessageAt: iso(channel === "web" ? 1 : 0),
    messageCount,
    pinned,
    handoff: contact.status === "waiting_human",
  });
}

const dealSeeds = [
  [contacts[0], "Automatización de reservas", 4800, "proposal", "COP"],
  [contacts[1], "Implementación omnicanal", 9200, "negotiation", "USD"],
  [contacts[2], "Piloto para equipo académico", 3100, "qualified", "USD"],
  [contacts[3], "Diagnóstico inicial", 1500, "lost", "USD"],
];
const deals = await listDeals();
for (const [contact, title, value, stage, currency] of dealSeeds) {
  if (!deals.some((deal) => deal.title === title && deal.contactId === contact.id)) {
    await createDeal({
      contactId: contact.id,
      title,
      value,
      currency,
      stage,
      source: contact.source,
      notes: `Seed demo para ${contact.name}.`,
      lostReason: stage === "lost" ? "Eligió otra solución" : undefined,
      expectedCloseAt: stage === "lost" ? undefined : new Date(now + 14 * 86_400_000).toISOString(),
    });
  }
}

const formName = "Diagnóstico demo de automatización";
let form = (await listForms()).find((item) => item.name === formName);
if (!form) {
  form = await createForm({
    name: formName,
    description: "Formulario de ejemplo para visualizar leads cualificados.",
    status: "published",
    thankYou: "Gracias. Te contactaremos con una recomendación.",
    scoring: { hot: 7, warm: 4 },
    steps: [
      {
        id: "goal",
        title: "Tu objetivo",
        fields: [{
          id: "goal-choice",
          type: "single_choice",
          label: "¿Qué quieres mejorar primero?",
          required: true,
          choices: [
            { id: "sales", label: "Ventas", points: 3 },
            { id: "support", label: "Atención al cliente", points: 2 },
            { id: "operations", label: "Operaciones", points: 1 },
          ],
        }],
      },
      {
        id: "contact",
        title: "Datos de contacto",
        fields: [
          { id: "name", type: "text", label: "Tu nombre", required: true, maps: "name" },
          { id: "email", type: "email", label: "Tu email", required: true, maps: "email" },
        ],
      },
    ],
  });
}
const responses = await import("../lib/business-store.ts").then(({ listFormResponses }) => listFormResponses(form.id));
if (!responses.some((response) => response.id === "demo-form-response")) {
  await saveFormResponse({
    id: "demo-form-response",
    formId: form.id,
    answers: [
      { fieldId: "goal-choice", value: "sales" },
      { fieldId: "name", value: "Natalia Herrera" },
      { fieldId: "email", value: "natalia.herrera@example.test" },
    ],
    score: 8,
    temperature: "hot",
    partial: false,
    contactId: contacts[0].id,
  });
}

if (!(await listAgents()).some((agent) => agent.name === "Asistente demo comercial")) {
  await createAgent({
    name: "Asistente demo comercial",
    description: "Agente sintético para mostrar una configuración completa.",
    systemPrompt: "Eres un asistente comercial amable. Califica necesidades, responde con claridad y deriva a una persona cuando sea necesario.",
    tools: [],
    status: "active",
  });
}

const agent = (await listAgents()).find((item) => item.name === "Asistente demo comercial");
if (agent && !(await listAgentChats(agent.id)).some((chat) => chat.id === "demo-agent-chat")) {
  await saveAgentChat({
    sessionId: "demo-agent-chat",
    agentId: agent.id,
    turns: [
      { role: "user", content: "Necesito responder más rápido a mis clientes." },
      { role: "assistant", content: "Podemos empezar clasificando consultas y automatizando respuestas frecuentes." },
    ],
  });
}

for (const [contact, days, message] of [
  [contacts[0], 2, "Revisar alcance de automatización"],
  [contacts[2], -1, "Enviar seguimiento de propuesta"],
]) {
  const reminders = await listReminders(contact.id);
  if (!reminders.some((reminder) => reminder.message === message)) {
    await createReminder({
      contact_id: contact.id,
      datetime: new Date(now + days * 86_400_000).toISOString(),
      message,
      status: "pending",
    });
  }
}

const [finalContacts, finalDeals, finalChats, finalForms, finalAgents, conversations] = await Promise.all([
  listContacts(),
  listDeals(),
  listChats(),
  listForms(),
  listAgents(),
  listChannelConversations(),
]);

console.log(JSON.stringify({
  backend: process.env.WORKFLOW_POSTGRES_URL ? "postgres-local" : "file-local",
  accountExists: await accountExists("test@gmail.com"),
  counts: {
    contacts: finalContacts.length,
    deals: finalDeals.length,
    chats: finalChats.length,
    forms: finalForms.length,
    agents: finalAgents.length,
    channelConversations: conversations.length,
  },
}, null, 2));
