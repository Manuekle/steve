import type { Automation, ChannelId, Contact, WorkflowStep } from "./types";

export function parseDurationMs(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec|m|min|h|hr|d)?$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2] ?? "m";
  const factor =
    unit === "ms" ? 1
    : unit === "s" || unit === "sec" ? 1_000
    : unit === "h" || unit === "hr" ? 3_600_000
    : unit === "d" ? 86_400_000
    : 60_000;
  return amount * factor;
}

function cronFieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (range === "*") return value % step === 0;
    if (range.includes("-")) {
      const [start, end] = range.split("-").map(Number);
      if (value < start || value > end) return false;
      return (value - start) % step === 0;
    }
    return Number(range) === value;
  });
}

/** 5-field cron (minute hour day-of-month month day-of-week). UTC. */
export function cronMatches(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dom, month, dow] = parts;
  return (
    cronFieldMatches(minute, date.getUTCMinutes()) &&
    cronFieldMatches(hour, date.getUTCHours()) &&
    cronFieldMatches(dom, date.getUTCDate()) &&
    cronFieldMatches(month, date.getUTCMonth() + 1) &&
    cronFieldMatches(dow, date.getUTCDay())
  );
}

export function automationMatchesChannel(auto: Automation, channel: ChannelId): boolean {
  return auto.channel === "all" || auto.channel === channel;
}

export function matchKeyword(auto: Automation, message: string): boolean {
  if (auto.trigger !== "keyword") return false;
  const haystack = message.toLowerCase();
  return auto.triggerValue
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .some((keyword) => haystack.includes(keyword));
}

export function matchInbound(opts: {
  automations: readonly Automation[];
  channel: ChannelId;
  message: string;
  isNewSession: boolean;
}): Automation[] {
  return opts.automations.filter((auto) => {
    if (auto.status !== "active") return false;
    if (!automationMatchesChannel(auto, opts.channel)) return false;
    if (auto.trigger === "keyword") return matchKeyword(auto, opts.message);
    if (auto.trigger === "new_chat") return opts.isNewSession;
    return false;
  });
}

/** Render one step (and, for a condition step, its then/else branches) as indented lines. */
function describeStepLines(step: WorkflowStep, indent: string, index: number): string[] {
  const lines = [`${indent}${index + 1}. [${step.type}] ${describeStep(step)}`];
  if (step.type === "condition") {
    const thenSteps = step.thenSteps ?? [];
    const elseSteps = step.elseSteps ?? [];
    if (thenSteps.length > 0) {
      lines.push(`${indent}   if true:`);
      thenSteps.forEach((s, i) => lines.push(...describeStepLines(s, `${indent}     `, i)));
    }
    if (elseSteps.length > 0) {
      lines.push(`${indent}   if false:`);
      elseSteps.forEach((s, i) => lines.push(...describeStepLines(s, `${indent}     `, i)));
    }
  }
  return lines;
}

function describeStep(step: WorkflowStep): string {
  const c = step.config;
  switch (step.type) {
    case "message":
      return `Send this exact text: ${c.message ?? "(empty)"}`;
    case "wait":
      return `Wait ${c.duration ?? "a moment"} before the next step.`;
    case "condition":
      return `Evaluate: ${c.condition ?? "(unspecified)"}. Follow the matching branch below instead of continuing past this step.`;
    case "ai_response":
      return `Generate a reply. Guide: ${c.prompt ?? "be helpful and concise."}`;
    case "transfer_human":
      return `Call transfer_human. Say: ${c.message ?? "A teammate will take over."}`;
    case "send_audio":
      return c.mediaUrl
        ? `Call send_media type=audio url=${c.mediaUrl}.`
        : `Call generate_media type=audio prompt="${c.mediaPrompt ?? "a short voice clip for this step"}".`;
    case "send_image":
      return c.mediaUrl
        ? `Call send_media type=image url=${c.mediaUrl} caption=${c.mediaCaption ?? ""}.`
        : `Call generate_media type=image prompt="${c.mediaPrompt ?? "an image for this step"}" caption=${c.mediaCaption ?? ""}.`;
    case "send_video":
      return c.mediaUrl
        ? `Call send_media type=video url=${c.mediaUrl} caption=${c.mediaCaption ?? ""}.`
        : `Call generate_media type=video prompt="${c.mediaPrompt ?? "a short video for this step"}" caption=${c.mediaCaption ?? ""}.`;
    case "http_request":
      return `Call http_request method=${(c.method ?? "POST").toUpperCase()} url=${c.url ?? "(unset)"}${
        c.body ? ` body=${c.body}` : ""
      }.`;
    case "notify_whatsapp":
      return `Notify ${c.phone ?? "(no number set)"} on WhatsApp with: ${c.message ?? "(empty)"}`;
    case "notify_team":
      return `Post to ${c.service ?? "the team"}: ${c.message ?? "(empty)"}`;
    case "notify_email":
      return `Send email to ${c.emailTo ?? c.phone ?? "(no email set)"} with subject "${
        c.emailSubject ?? "(unset)"
      }"${c.emailTemplate ? ` using the "${c.emailTemplate}" template` : `: ${c.message ?? "(empty)"}`}.`;
    case "log_sheet":
      return `Log this contact to spreadsheet ${c.spreadsheetId ?? "(unset)"}${c.sheetName ? ` (${c.sheetName})` : ""}. Runs automatically on webhook triggers only — you have no tool for this, so skip it on keyword/new_chat triggers.`;
    case "send_payment_link":
      return `Send a ${c.currency ?? "usd"} ${c.amount ?? "?"} Stripe payment link for "${c.productName ?? "(unset)"}". Runs automatically on webhook triggers only — you have no tool for this, so skip it on keyword/new_chat triggers.`;
    case "update_contact":
      return `Call update_contact${c.contactStatus ? ` status=${c.contactStatus}` : ""}${
        c.contactNote ? ` note="${c.contactNote}"` : ""
      }.`;
    default:
      return step.type;
  }
}

export function formatPlaybook(automations: readonly Automation[], contact?: Contact): string {
  const active = automations.filter((a) => a.status === "active");
  const lines: string[] = ["# Active playbook"];

  if (contact) {
    lines.push("");
    lines.push("## Current contact");
    lines.push(`- id: ${contact.id}`);
    lines.push(`- name: ${contact.name}`);
    if (contact.phone) lines.push(`- phone: ${contact.phone}`);
    if (contact.email) lines.push(`- email: ${contact.email}`);
    lines.push(`- status: ${contact.status}`);
    lines.push(`- source: ${contact.source}`);
    const attrs = Object.entries(contact.attributes);
    if (attrs.length > 0) {
      lines.push(`- attributes: ${attrs.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    }
    // Note: waiting_human hard-block is handled by automations.ts instruction override.
  }

  if (active.length === 0) {
    lines.push("");
    lines.push("No active automations. Qualify the lead, persist with upsert_contact, help the user.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("When the latest user message matches a playbook, execute its steps in order before improvising.");
  for (const auto of active) {
    lines.push("");
    lines.push(`## ${auto.name} (${auto.id})`);
    lines.push(`- trigger: ${auto.trigger} = ${auto.triggerValue || "—"}`);
    lines.push(`- channel: ${auto.channel}`);
    if (auto.description) lines.push(`- ${auto.description}`);
    const steps = auto.steps ?? [];
    if (steps.length === 0) {
      lines.push("- steps: (none — respond as the AI agent)");
      continue;
    }
    lines.push("- steps:");
    steps.forEach((step, i) => {
      lines.push(...describeStepLines(step, "  ", i));
    });
  }
  return lines.join("\n");
}
