import type { IconSvgElement } from "@hugeicons/react";
import {
  CallIncoming01Icon,
  Coins01Icon,
  CustomerSupportIcon,
  Megaphone01Icon,
  Rocket01Icon,
  Target01Icon,
  UserSearch01Icon,
} from "@hugeicons/core-free-icons";

// Ready-made agents — the roles a small business actually hires for, each one
// a complete configuration (prompt + tools) instead of an empty form.
//
// Only the icon and the tool set live here. Every word a person reads is a
// dictionary key, resolved at render time, so a template hired in English
// gets an English system prompt and the same template hired in Spanish gets a
// Spanish one — the prompt is saved onto the agent, so its language is a
// decision made once, at hire time.
//
// Tool names must exist in the agent's tool set (see the list in
// app/api/agents/optimize/route.ts); an invented one is dead text in a prompt.

export type AgentTemplate = {
  /** Also the dictionary namespace: `agentTemplates.<id>.*`. */
  readonly id: string;
  readonly icon: IconSvgElement;
  /** Tailwind classes for the icon tile — one accent per role so the grid
   *  reads as a team rather than a list of identical cards. */
  readonly accent: string;
  readonly tools: readonly string[];
};

/** How many bullet lines every template card shows. */
export const TEMPLATE_BULLETS = [1, 2, 3, 4] as const;

export const AGENT_TEMPLATES: readonly AgentTemplate[] = [
  {
    id: "receptionist",
    icon: CallIncoming01Icon,
    accent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    tools: ["calendar", "reminder", "upsert_contact", "transfer_human"],
  },
  {
    id: "leadQualifier",
    icon: Target01Icon,
    accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    tools: ["upsert_contact", "calendar", "transfer_human"],
  },
  {
    id: "salesFollowUp",
    icon: Megaphone01Icon,
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    tools: ["reminder", "upsert_contact", "list_automations", "transfer_human"],
  },
  {
    id: "support",
    icon: CustomerSupportIcon,
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    tools: ["upsert_contact", "http_request", "transfer_human"],
  },
  {
    id: "onboarding",
    icon: Rocket01Icon,
    accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    tools: ["reminder", "send_media", "upsert_contact", "transfer_human"],
  },
  {
    id: "hrScreener",
    icon: UserSearch01Icon,
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    tools: ["upsert_contact", "calendar", "transfer_human"],
  },
  {
    id: "collections",
    icon: Coins01Icon,
    accent: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    tools: ["reminder", "upsert_contact", "http_request", "transfer_human"],
  },
];
