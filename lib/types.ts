// Shared types for the dashboard, chat history, and automation views.
// These are client-side types backed by localStorage persistence in
// lib/dashboard-store.ts. The Eve runtime owns the real session state;
// these types model the app-level metadata we layer on top.

export type ChannelId = "web" | "whatsapp" | "instagram";

/**
 * Where a contact came from. A superset of the messaging channels: a lead can
 * also arrive through a form on the site, or through a phone call the voice
 * agent answered. Neither is somewhere you can reply, but both are origins the
 * inbox has to be able to draw.
 */
export type ContactChannel = ChannelId | "form" | "voice";

export type ChannelStatus = "connected" | "disconnected" | "error";

export type ChannelInfo = {
  readonly id: ChannelId;
  readonly label: string;
  readonly status: ChannelStatus;
  readonly lastEvent?: string; // ISO timestamp
  readonly messageCount: number;
};

export type ChatSummary = {
  readonly id: string;
  readonly title: string;
  readonly channel: ChannelId;
  readonly lastMessage: string;
  readonly lastMessageAt: string; // ISO timestamp
  readonly messageCount: number;
  readonly sessionId?: string;
  readonly pinned?: boolean;
  readonly handoff?: boolean;
};

export type ContactStatus = "open" | "waiting_human" | "followup_due" | "closed";

export type Contact = {
  readonly id: string;
  readonly name: string;
  readonly phone?: string;
  readonly email?: string;
  /**
   * Platform-scoped recipient id for channels that don't use a phone number
   * as identity (the Instagram IGSID). Captured automatically
   * from the inbound message's auth context — see agent/hooks/persist.ts.
   */
  readonly externalId?: string;
  readonly channel: ContactChannel;
  readonly sessionId?: string;
  readonly crmId?: string;
  readonly status: ContactStatus;
  readonly source: string;
  readonly attributes: Record<string, string>;
  readonly lastMessage?: string;
  readonly lastMessageAt: string;
  readonly createdAt: string;
  readonly notes?: string;
};

export type LeadInput = {
  readonly name?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly source?: string;
  readonly message?: string;
  readonly channel?: ContactChannel;
  readonly attributes?: Record<string, string>;
};

// ── Forms ──────────────────────────────────────────────────────────
//
// A form is a short, multi-step questionnaire published at /f/<slug>. Its
// point is not the answers on their own: every choice carries a score, and the
// total decides how warm the lead is before anyone reads it. A submission ends
// up in the same inbox as a WhatsApp message — see `ingestLead`.

export type FormFieldType =
  /** One choice, scored. The workhorse: this is what qualifies a lead. */
  | "single_choice"
  /** Several choices, scores add up. */
  | "multi_choice"
  | "text"
  | "long_text"
  | "email"
  | "phone";

/** Which contact field an answer fills. Scored questions have no mapping —
 *  they say how good the lead is, not who it is. */
export type FormFieldMapping = "name" | "email" | "phone";

export type FormChoice = {
  readonly id: string;
  readonly label: string;
  /** Rendered before the label. Purely decorative. */
  readonly emoji?: string;
  /** Trusted, operator-authored vector markup shown instead of `emoji` — for
   *  brand marks a unicode emoji can't represent (e.g. the Facebook or Google
   *  Ads logo on a lead-source choice). Never sourced from visitor input. */
  readonly iconSvg?: string;
  /** What picking this adds to the score. Zero is a real answer, not a
   *  missing one: "I have no leads yet" is worth asking and worth nothing. */
  readonly points: number;
};

export type FormField = {
  readonly id: string;
  readonly type: FormFieldType;
  readonly label: string;
  readonly help?: string;
  readonly required: boolean;
  readonly placeholder?: string;
  /** Choice fields only. */
  readonly choices?: readonly FormChoice[];
  /** Contact-capture fields only. */
  readonly maps?: FormFieldMapping;
};

/**
 * Show this step only when an earlier answer matches. Absent means always.
 * One condition rather than a tree: the branch someone actually draws on a
 * whiteboard is "if they said X, ask this", and a rule engine that can express
 * more than that is a rule engine nobody can read back later.
 */
export type FormCondition = {
  readonly fieldId: string;
  /** Matches when the answer is any one of these choice ids. */
  readonly equals: readonly string[];
};

export type FormStep = {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly fields: readonly FormField[];
  readonly showIf?: FormCondition;
};

/** Score thresholds, inclusive. Anything under `warm` is cold. */
export type FormScoring = {
  readonly hot: number;
  readonly warm: number;
};

export type FormStatus = "draft" | "published";

export type Form = {
  readonly id: string;
  /** URL segment at /f/<slug>. Unique across forms. */
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly status: FormStatus;
  readonly steps: readonly FormStep[];
  readonly scoring: FormScoring;
  /** Shown after the last step. */
  readonly thankYou?: string;
  /** Where each response is POSTed, when the operator wants one. Set from the
   *  form's own Webhook card and delivered by lib/forms/webhook.ts; the
   *  Connections page only lists what is set, since a webhook belongs to a
   *  form and not to the account. */
  readonly webhookUrl?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type LeadTemperature = "hot" | "warm" | "cold";

export type FormAnswer = {
  readonly fieldId: string;
  /** Choice ids for choice fields, typed text for the rest. */
  readonly value: string | readonly string[];
};

export type FormResponse = {
  readonly id: string;
  readonly formId: string;
  readonly answers: readonly FormAnswer[];
  readonly score: number;
  readonly temperature: LeadTemperature;
  /** True until the last step is submitted. A partial response is still a
   *  lead — someone who answered two of four questions told us something. */
  readonly partial: boolean;
  /** Set once an answer identified the person well enough to ingest. */
  readonly contactId?: string;
  readonly startedAt: string;
  readonly updatedAt: string;
};

// ── Deals ──────────────────────────────────────────────────────────
//
// The money. Everything else in this app knows who a contact is, what channel
// they came from and how warm a form said they were — and then stops. A deal
// is the part where that becomes an amount somebody is trying to close.
//
// Deliberately separate from `ContactStatus`. That field is a conversation
// state (`waiting_human` is how the agent escalates), and it belongs to the
// inbox. A person can be `closed` in the inbox and still have an open deal, or
// be mid-conversation with three of them. One contact, many deals.

/** The stages, in order. `won` and `lost` are terminal. */
export type DealStage =
  | "lead"
  | "qualified"
  | "meeting"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export type Deal = {
  readonly id: string;
  /** The person this is with. A deal without a contact is a note. */
  readonly contactId: string;
  readonly title: string;
  /** In whole currency units — 1500.5 is 1500.50, not 150050 cents. Stored as
   *  written because these are quotes an operator types, not settled ledger
   *  amounts; the payments store is where exact money lives. */
  readonly value: number;
  /** ISO 4217. Per deal rather than per account: a business that quotes in two
   *  currencies is normal, and one account-wide code would quietly mislabel
   *  half its pipeline. Totals are reported per currency for the same reason. */
  readonly currency: string;
  readonly stage: DealStage;
  /** When the operator expects to know either way. Drives the forecast. */
  readonly expectedCloseAt?: string;
  readonly notes?: string;
  /** Free text, matching `Contact.source` — "form:presupuesto", "whatsapp". */
  readonly source?: string;
  /** Why it was lost. Only meaningful on a `lost` deal, and the one field
   *  that turns a pile of losses into something you can act on. */
  readonly lostReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Set when the deal first reached `won` or `lost`, cleared if it reopens. */
  readonly closedAt?: string;
};

export type AutomationTrigger = "keyword" | "schedule" | "new_chat" | "no_reply" | "webhook";

export type AutomationStatus = "active" | "paused" | "draft";

export type WorkflowStepType =
  | "message"
  | "wait"
  | "condition"
  | "ai_response"
  | "transfer_human"
  | "send_audio"
  | "send_image"
  | "send_video"
  | "http_request"
  | "notify_whatsapp"
  | "notify_team"
  | "notify_email"
  | "update_contact"
  | "log_sheet"
  | "send_payment_link"
  | "book_meeting";

export type WorkflowStep = {
  readonly id: string;
  readonly type: WorkflowStepType;
  readonly config: {
    readonly message?: string;
    readonly duration?: string;
    readonly condition?: string;
    readonly prompt?: string;
    readonly channel?: ChannelId | "all";
    readonly mediaUrl?: string;
    readonly mediaCaption?: string;
    readonly mediaPrompt?: string;
    /** http_request: outbound webhook / API call. */
    readonly url?: string;
    readonly method?: string;
    readonly body?: string;
    /** notify_whatsapp: destination number in E.164. */
    readonly phone?: string;
    /** notify_team: which service the webhook belongs to. */
    readonly service?: "slack" | "discord";
    /** notify_team: the service's incoming-webhook URL. */
    readonly webhookUrl?: string;
    /** notify_email: recipient address. Older automations put it in `phone`,
     *  which the runner still reads as a fallback. */
    readonly emailTo?: string;
    /** notify_email: subject line, `{{contact.x}}` placeholders included. */
    readonly emailSubject?: string;
    /** notify_email: which email template renders the body. Unset sends the
     *  step's own `message` as plain text. */
    readonly emailTemplate?: string;
    /** update_contact: CRM write-back. */
    readonly contactStatus?: string;
    readonly contactNote?: string;
    /** log_sheet: destination spreadsheet + tab. */
    readonly spreadsheetId?: string;
    readonly sheetName?: string;
    /** send_payment_link: which processor creates the link. Absent means
     *  "whichever one has a key", resolved at run time — see
     *  resolvePaymentProvider in lib/automation-runner.ts. */
    readonly paymentProvider?: "stripe" | "mercadopago";
    /** send_payment_link: decimal amount ("49.99") and ISO currency code. */
    readonly amount?: string;
    readonly currency?: string;
    readonly productName?: string;
    /** book_meeting: length of the slot to find and book. Default 30. */
    readonly meetingDurationMin?: string;
    /** book_meeting: event title, `{{contact.x}}` placeholders included.
     *  The step's own `message` doubles as the confirmation text sent to the
     *  contact — see runStep in lib/automation-runner.ts. */
    readonly meetingSummary?: string;
  };
  /**
   * Canvas position, in flow coordinates, once someone has dragged this node.
   * Absent means "wherever auto-layout puts it" — see lib/workflow-layout.ts.
   */
  readonly position?: { readonly x: number; readonly y: number };
  /**
   * When true, the layout engine omits the incoming edge from the previous
   * step, visually "disconnecting" this node from its predecessor.
   * The step still lives in the same steps array but renders as a floating
   * independent node on the canvas.
   */
  readonly isolated?: boolean;
  /**
   * Line style of this step's INCOMING connector. "dashed" reads as a
   * tentative / conditional hop on the canvas; the runtime doesn't care.
   */
  readonly connector?: "solid" | "dashed";
  /**
   * Muted on the canvas and skipped when the flow runs — the step stays in
   * place so it can be switched back on without rebuilding it.
   */
  readonly disabled?: boolean;
  /**
   * Branches for a "condition" step — steps to run when the condition is
   * true / false. Only meaningful when type === "condition"; the agent
   * reads these from the playbook text (see lib/automation-engine.ts
   * formatPlaybook) the same way it reads the top-level step list — there
   * is no separate deterministic branch runtime.
   */
  readonly thenSteps?: readonly WorkflowStep[];
  readonly elseSteps?: readonly WorkflowStep[];
};

export type Automation = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly trigger: AutomationTrigger;
  readonly triggerValue: string;
  readonly channel: ChannelId | "all";
  readonly status: AutomationStatus;
  readonly responseCount: number;
  readonly createdAt: string; // ISO timestamp
  readonly lastTriggeredAt?: string; // ISO timestamp
  readonly agentId?: string;
  readonly steps?: WorkflowStep[];
};

export type DashboardStats = {
  readonly totalChats: number;
  readonly activeChats: number;
  readonly totalMessages: number;
  readonly automatedReplies: number;
  readonly avgResponseTime: string;
  readonly channelBreakdown: ReadonlyArray<{
    readonly channel: ChannelId;
    readonly count: number;
    readonly percentage: number;
  }>;
};

export type ActivityPoint = {
  /** Dictionary key for the weekday (`day.mon` … `day.sun`), not a label —
   *  the chart resolves it so the axis follows the language toggle. */
  readonly labelKey: string;
  readonly value: number;
};

// Calendar types
export type CalendarEvent = {
  readonly event_id: string;
  readonly link: string;
};

// Agent types
/**
 * `draft` is where an agent starts now: created from the list, opened in the
 * builder, and not yet answering anybody. Without it the only way to make a
 * new agent was a form that had to be complete before it existed at all —
 * and the builder needs something to save into from the first keystroke.
 *
 * Only `active` answers a channel; `draft` and `inactive` are both "off", and
 * are kept apart so the list can say "never turned on" instead of "paused".
 */
export type AgentStatus = "active" | "inactive" | "draft";

/**
 * The voice half of an agent.
 *
 * A phone call does not run on this app's model or tools: it runs on the
 * ElevenLabs Agents platform, which owns the ear (STT), the brain for the
 * call, and the mouth (TTS) in one low-latency pipeline. So each agent that
 * speaks has a mirror agent over there, and `elevenlabsAgentId` is the link.
 * Everything above that id is what this app sends when it syncs the mirror.
 */
export type AgentVoice = {
  /** Off by default. Nothing is created on ElevenLabs until this is turned on. */
  readonly enabled: boolean;
  /** ElevenLabs voice id. Empty means the account default. */
  readonly voiceId?: string;
  /** What the agent says before the caller says anything. */
  readonly firstMessage?: string;
  /** ISO 639-1, passed to the mirror so pronunciation and ASR match. */
  readonly language?: string;
  /** The mirror agent on ElevenLabs. Absent until the first sync. */
  readonly elevenlabsAgentId?: string;
  /** When the mirror last received this agent's prompt and voice. */
  readonly syncedAt?: string;
  /** ElevenLabs phone number id routed to this agent, if any. */
  readonly phoneNumberId?: string;
  /**
   * The mirror's webhook tools, by tool name to ElevenLabs tool id.
   *
   * Kept per agent rather than per account because the tool URL carries the
   * agent id: that is what tells the endpoint which local agent is calling,
   * and therefore which capabilities it is allowed to use. Stored so a re-sync
   * updates the same tools instead of leaving a trail of orphans on the
   * ElevenLabs account. See lib/voice-tools.ts.
   */
  readonly toolIds?: Readonly<Record<string, string>>;
  /**
   * Why the last sync attached no tools, when it attached none. The mirror is
   * still created and can still hold a conversation — it just cannot book,
   * remind or save anything, which is invisible until someone tries.
   */
  readonly toolsWarning?: string;
};

/** One turn in a saved call transcript, mirroring the shape ElevenLabs sends
 *  on its post_call_transcription webhook. */
export type VoiceCallTurn = {
  readonly role: "agent" | "user";
  readonly message: string;
  readonly timeInCallSecs: number;
};

/** "test" — the app itself placed or previewed the call (the "Llamada de
 *  prueba" button, or the in-browser Orb call on the voice page). "real" —
 *  a caller dialed the agent's routed number. Set at call start for the two
 *  paths this app controls; anything the webhook reports without a matching
 *  pending call defaults to "real". */
export type VoiceCallSource = "test" | "real";

/**
 * A call handled by an agent's ElevenLabs mirror — the transcript persists
 * server-side because the browser is rarely present for the whole call (a
 * phone call in particular never touches it at all), and the ElevenLabs
 * conversation record is not something this app can be sure will still be
 * around whenever someone comes back to check.
 */
/** ElevenLabs' own conversation vocabulary, stored as it comes. */
export type VoiceCallStatus = "initiated" | "in-progress" | "processing" | "done" | "failed";

export type VoiceCall = {
  readonly id: string;
  /** This app's agent id, not the ElevenLabs mirror id. */
  readonly agentId: string;
  /** The ElevenLabs conversation id — also this record's natural key. */
  readonly conversationId: string;
  readonly source: VoiceCallSource;
  /** Where the call is. Absent on rows written before this was tracked. */
  readonly status?: VoiceCallStatus;
  /** Why a call ended badly, when ElevenLabs says. */
  readonly terminationReason?: string;
  /** Empty until the transcript arrives — by webhook, or by the poll in
   *  app/api/agents/[id]/voice/calls when no webhook can reach this install. */
  readonly transcript: readonly VoiceCallTurn[];
  readonly durationSecs?: number;
  /** Where the call left the person commercially. Absent until assessed. */
  readonly prospect?: ProspectAssessment;
  readonly startedAt: string;
  readonly createdAt: string;
};

// ── Prospect assessment ────────────────────────────────────────────
//
// Where a conversation left the person commercially — the question an owner
// actually asks about a pile of chats and calls ("did any of these buy?"),
// which the operational contact status (open / waiting_human / closed) does
// not answer. Written by the model over the transcript, never by a rule.

export type ProspectStage =
  /** Bought, booked, signed — the conversation closed in a sale. */
  | "won"
  /** Said no, or bought elsewhere. */
  | "lost"
  /** Price sent, terms being discussed, decision pending. */
  | "negotiating"
  /** Asked real questions and is engaged, but nothing was quoted yet. */
  | "interested"
  /** Went quiet before it went anywhere. */
  | "no_response"
  /** Wrong fit: outside the service, the area, or the budget. */
  | "unqualified"
  /** Not a sale at all — an existing customer with a support question. */
  | "support";

export type ProspectAssessment = {
  readonly stage: ProspectStage;
  /** One line, in the conversation's own language, saying what decided it. */
  readonly reason: string;
  /** What should happen next, when anything should. */
  readonly nextStep?: string;
  readonly assessedAt: string;
  /** How many turns the assessment read. A longer transcript than this is
   *  what makes it stale and worth running again. */
  readonly turnCount: number;
  /** "ai" — the model read the transcript. "manual" — a person overrode it. */
  readonly source: "ai" | "manual";
};

/** One turn of a saved playground conversation. */
export type AgentChatTurn = {
  readonly role: "user" | "assistant";
  readonly content: string;
};

/**
 * A text conversation someone held with an agent in the playground.
 *
 * Saved for the same reason a call transcript is: the rehearsal is where you
 * find out the prompt answers the wrong thing, and that is worth still having
 * on screen after the tab is closed and the prompt edited. It is not the
 * agent's production history — nothing here reached a customer.
 */
export type AgentChatSession = {
  readonly id: string;
  readonly agentId: string;
  /** The opening user line, trimmed — what the sidebar lists it by. */
  readonly title: string;
  readonly turns: readonly AgentChatTurn[];
  readonly startedAt: string;
  readonly updatedAt: string;
};

/**
 * A real conversation the agent held with a customer on a connected channel.
 *
 * The channel adapters run through Eve, whose durable session is the system
 * of record for what was said. This is the app's own copy, written turn by
 * turn by agent/hooks/persist.ts, and it exists because the operator's
 * screens — the transcript viewer, the prospect assessment — need to read a
 * conversation without holding an Eve session open, and need somewhere to
 * hang the assessment that is not the model's history.
 */
export type ChannelConversation = {
  readonly id: string;
  /** The Eve session this mirrors. Also its natural key. */
  readonly sessionId: string;
  readonly channel: ChannelId;
  readonly contactId?: string;
  /** The contact's name when known, the channel's own name otherwise. */
  readonly title: string;
  readonly turns: readonly AgentChatTurn[];
  readonly startedAt: string;
  readonly updatedAt: string;
  /** Where this left the person commercially. Absent until assessed. */
  readonly prospect?: ProspectAssessment;
};

/**
 * The structured half of an agent, filled in by the builder.
 *
 * `systemPrompt` stays the artifact the runtime reads — persona.ts injects it
 * verbatim and the ElevenLabs mirror is synced from it — but a free-text box
 * is a terrible thing to hand somebody who has never written a prompt. The
 * brief is what they actually answer: who the agent is, what it is for, how it
 * should sound, what it must never do, when to fetch a human. Composing that
 * into the prompt (lib/agent-brief.ts) is this app's job, not theirs.
 *
 * Nothing here repeats the business itself — name, hours, prices and policies
 * reach every conversation through agent/instructions/business-profile.ts and
 * search_knowledge. Restating them in each agent's prompt would be a second
 * copy that goes stale the day the first one is edited.
 */
export type AgentBrief = {
  /** One line: the job. "Recepcionista de la clínica". */
  readonly role: string;
  /** What a good conversation ends with — the outcome the owner wants. */
  readonly goal: string;
  /** Who is on the other side. */
  readonly audience: string;
  /** How it should sound, in the owner's words. */
  readonly tone: string;
  /** ISO 639-1, or "auto" to mirror whatever the customer writes in. */
  readonly language: string;
  /** What it opens with, when the channel gives it the first word. */
  readonly greeting: string;
  /** Standing rules — the things it should always do. */
  readonly rules: readonly string[];
  /** Hard limits — the things it must never do or promise. */
  readonly avoid: readonly string[];
  /** When to stop and fetch a person. */
  readonly handoff: string;
  /**
   * Set once someone edits the composed prompt by hand. From then on the
   * brief stops overwriting it: an owner who rewrote a paragraph should not
   * lose it because they later changed the tone field.
   */
  readonly promptCustomized?: boolean;
  readonly updatedAt?: string;
};

export type Agent = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools: string[];
  readonly createdAt: string;
  readonly status: AgentStatus;
  /** Absent on agents made before the builder existed, and on any hired
   *  straight from a template — their prompt is the whole definition. */
  readonly brief?: AgentBrief;
  /** Model id this agent runs on. Absent means "whatever the app picks for
   *  the task", which is the right default for most agents. */
  readonly model?: string | null;
  /** Voice configuration. Absent means this agent only writes. */
  readonly voice?: AgentVoice;
};

// Reminder types
/**
 * `failed` is what a reminder that came due and could not be delivered gets.
 *
 * It used to get `sent`, whatever happened: a contact on a channel with no
 * outbound transport (a form lead, a phone caller), a WhatsApp number outside
 * the 24h window with no approved template, a token Meta refused — all three
 * came out the other side marked delivered, with a green badge, and nobody
 * ever knew the person had not been reminded. See agent/schedules/reminders.ts.
 */
export type ReminderStatus = "pending" | "sent" | "failed" | "cancelled";

export type Reminder = {
  readonly id: string;
  readonly contact_id: string;
  readonly datetime: string;
  readonly message: string;
  readonly status: ReminderStatus;
  readonly created_at: string;
};
