// Shared types for the dashboard, chat history, and automation views.
// These are client-side types backed by localStorage persistence in
// lib/dashboard-store.ts. The Eve runtime owns the real session state;
// these types model the app-level metadata we layer on top.

export type ChannelId = "web" | "whatsapp" | "messenger" | "instagram";

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
  readonly channel: ChannelId | "form";
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
  readonly channel?: ChannelId | "form";
  readonly attributes?: Record<string, string>;
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
    /** update_contact: CRM write-back. */
    readonly contactStatus?: string;
    readonly contactNote?: string;
    /** log_sheet: destination spreadsheet + tab. */
    readonly spreadsheetId?: string;
    readonly sheetName?: string;
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
