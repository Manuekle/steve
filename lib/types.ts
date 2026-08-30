// Shared types for the dashboard, chat history, and automation views.
// These are client-side types backed by localStorage persistence in
// lib/dashboard-store.ts. The Eve runtime owns the real session state;
// these types model the app-level metadata we layer on top.

export type ChannelId = "web" | "whatsapp" | "messenger" | "instagram";

/**
 * Where a contact came from. A superset of the messaging channels: a lead can
 * also arrive through a form on the site, which is not somewhere you can reply
 * but is still an origin the inbox has to be able to draw.
 */
export type ContactChannel = ChannelId | "form";

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
   * as identity (Messenger PSID, Instagram IGSID). Captured automatically
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
  | "send_payment_link";

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
export type AgentStatus = "active" | "inactive";

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
export type VoiceCall = {
  readonly id: string;
  /** This app's agent id, not the ElevenLabs mirror id. */
  readonly agentId: string;
  /** The ElevenLabs conversation id — also this record's natural key. */
  readonly conversationId: string;
  readonly source: VoiceCallSource;
  /** Empty until the post_call_transcription webhook fills it in. */
  readonly transcript: readonly VoiceCallTurn[];
  readonly durationSecs?: number;
  readonly startedAt: string;
  readonly createdAt: string;
};

export type Agent = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools: string[];
  readonly createdAt: string;
  readonly status: AgentStatus;
  /** Model id this agent runs on. Absent means "whatever the app picks for
   *  the task", which is the right default for most agents. */
  readonly model?: string | null;
  /** Voice configuration. Absent means this agent only writes. */
  readonly voice?: AgentVoice;
};

// Reminder types
export type ReminderStatus = "pending" | "sent" | "cancelled";

export type Reminder = {
  readonly id: string;
  readonly contact_id: string;
  readonly datetime: string;
  readonly message: string;
  readonly status: ReminderStatus;
  readonly created_at: string;
};
