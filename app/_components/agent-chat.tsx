"use client";

import {
  Client,
  type ClientAuth,
  type ClientSession,
  type HandleMessageStreamEvent,
  isCurrentTurnBoundaryEvent,
  type SessionState,
} from "eve/client";
import { useEveAgent } from "eve/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Add01Icon, AlertCircleIcon, Logout01Icon } from "@hugeicons/core-free-icons";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Orb } from "@/components/ui/orb";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Beam } from "@/components/ui/beam";
import { saveConversation } from "@/lib/dashboard-store";
import { AgentMessage } from "./agent-message";
import {
  ModelPicker,
  ProviderStatusBadge,
  useModelCatalog,
} from "@/components/ai-elements/model-picker";

const AGENT_NAME = "steve";
const MONITORING_HREF = process.env.NEXT_PUBLIC_MONITORING_URL;
const CHAT_STORAGE_KEY = "steve:eve-chat:v1";

// Tabs for the landing screen — each category shows different
// starter prompts so the SlidingTabs pill has a real purpose. Both the
// tab label and the prompts are dictionary keys, resolved at render time
// so they follow the language toggle.
const PROMPT_TABS: readonly { id: string; label: string; prompts: readonly string[] }[] = [
  {
    id: "chat",
    label: "chat.tabChat",
    prompts: ["chat.promptChat1", "chat.promptChat2", "chat.promptChat3"],
  },
  {
    id: "automate",
    label: "chat.tabAutomate",
    prompts: ["chat.promptAutomate1", "chat.promptAutomate2", "chat.promptAutomate3"],
  },
  {
    id: "analyze",
    label: "chat.tabAnalyze",
    prompts: ["chat.promptAnalyze1", "chat.promptAnalyze2", "chat.promptAnalyze3"],
  },
];

type AgentStatus = ReturnType<typeof useEveAgent>["status"];
export type AgentAuthMode = "basic" | "local" | "session" | "misconfigured";

type BasicCredentials = {
  readonly password: string;
  readonly username: string;
};

type SavedEveChat = {
  readonly events?: readonly HandleMessageStreamEvent[];
  readonly session?: SessionState;
};

// Helper type for deriving conversation metadata from Eve messages.
type MessageLike = {
  readonly role: string;
  readonly parts: readonly { readonly type: string; readonly text?: string }[];
};

/** Extract the first user message as a conversation title. */
function deriveTitle(messages: readonly MessageLike[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "Nueva conversación";
  const textPart = firstUser.parts.find((p) => p.type === "text");
  const text = textPart?.text ?? "Nueva conversación";
  return text.length > 50 ? `${text.slice(0, 50)}…` : text;
}

/** Extract the last assistant text as a preview. */
function deriveLastMessage(messages: readonly MessageLike[]): string {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return "";
  const textPart = lastAssistant.parts.find((p) => p.type === "text");
  const text = textPart?.text ?? "";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function Pill({
  children,
  href,
  title,
}: {
  readonly children: ReactNode;
  readonly href?: string;
  readonly title?: string;
}) {
  const className =
    "inline-flex items-center rounded-full border border-border bg-card/50 px-2.5 py-0.5 font-medium text-muted-foreground text-xs shadow-[var(--shadow-inset)] transition-all duration-150 hover:border-input hover:text-foreground";
  if (href) {
    return (
      <a
        className={cn(className, "hover:bg-accent")}
        href={href}
        rel="noreferrer"
        target="_blank"
        title={title}
      >
        {children}
      </a>
    );
  }
  return (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

export function AgentChat({ authMode }: { readonly authMode: AgentAuthMode }) {
  const [credentials, setCredentials] = useState<BasicCredentials>();

  if (authMode === "misconfigured") {
    return <AuthConfigurationError />;
  }

  if (authMode === "basic" && !credentials) {
    return <BasicAuthForm onAuthenticated={setCredentials} />;
  }

  const auth: ClientAuth | undefined = credentials
    ? { basic: { username: credentials.username, password: credentials.password } }
    : undefined;

  return (
    <AgentSession
      auth={auth}
      onSignOut={credentials ? () => setCredentials(undefined) : undefined}
    />
  );
}

function AgentSession({
  auth,
  onSignOut,
}: {
  readonly auth?: ClientAuth;
  readonly onSignOut?: () => void;
}) {
  const [saved, setSaved] = useState<SavedEveChat>();
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void restoreSavedChat(auth, controller.signal).then(setSaved);
    return () => controller.abort();
  }, [auth]);

  if (!saved) {
    return <AgentLoading />;
  }

  return (
    <ConnectedAgentSession
      auth={auth}
      key={resetKey}
      onSignOut={onSignOut}
      onReset={() => {
        clearSavedChat();
        setSaved({});
        setResetKey((k) => k + 1);
      }}
      saved={saved}
    />
  );
}

function ConnectedAgentSession({
  auth,
  onReset,
  onSignOut,
  saved,
}: {
  readonly auth?: ClientAuth;
  readonly onReset: () => void;
  readonly onSignOut?: () => void;
  readonly saved: SavedEveChat;
}) {
  const t = useT();
  const [clientSession] = useState(() => {
    const client = new Client({
      host: window.location.origin,
      auth,
      maxReconnectAttempts: 20,
      preserveCompletedSessions: true,
      redirect: "error",
    });
    return client.session(saved.session);
  });
  const eventsRef = useRef<HandleMessageStreamEvent[]>([...(saved.events ?? [])]);
  const sessionRef = useRef<SessionState>(clientSession.state);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persist = (immediately = false) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    const write = () =>
      saveChat({ events: eventsRef.current, session: sessionRef.current });
    if (immediately) {
      write();
    } else {
      persistTimerRef.current = setTimeout(write, 100);
    }
  };

  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    [],
  );

  const agent = useEveAgent({
    initialEvents: saved.events ?? [],
    session: clientSession,
    onEvent(event) {
      eventsRef.current.push(event);
      sessionRef.current = clientSession.state;
      persist();
    },
    onFinish(snapshot) {
      eventsRef.current = [...snapshot.events];
      sessionRef.current = snapshot.session;
      persist(true);
    },
    onSessionChange(session) {
      sessionRef.current = session;
      persist(true);
    },
  });
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  // ── Model choice ────────────────────────────────────────────────────────
  // The picker cannot talk to Eve directly, so the choice is registered
  // server-side (see lib/chat-model-store) and the agent's resolver reads it
  // back by session id. `null` leaves the per-task default in place.
  const { data: catalog, loading: catalogLoading } = useModelCatalog();
  const [chatModel, setChatModel] = useState<string | null>(null);

  const registerModel = useCallback(
    (model: string | null) => {
      setChatModel(model);
      const sessionId = sessionRef.current.sessionId;
      if (model === null) {
        if (!sessionId) return;
        void fetch(`/api/chat-model?sessionId=${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
        }).catch(() => {});
        return;
      }
      void fetch("/api/chat-model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, sessionId }),
      }).catch(() => {});
    },
    [],
  );

  // A new chat has no session id when the model is picked, so the choice is
  // parked server-side and claimed by the first turn. Once the id exists,
  // bind it explicitly so later turns in this chat keep the same model.
  useEffect(() => {
    const sessionId = sessionRef.current.sessionId;
    if (!chatModel || !sessionId) return;
    void fetch("/api/chat-model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: chatModel, sessionId }),
    }).catch(() => {});
  }, [chatModel, agent.status]);

  const modelPicker = (
    <ModelPicker
      models={catalog?.models ?? []}
      value={chatModel}
      onChange={registerModel}
      autoLabel={catalog?.tasks?.chat}
      loading={catalogLoading}
      disabled={isBusy}
    />
  );


  const isEmpty = agent.data.messages.length === 0;

  const [promptTab, setPromptTab] = useState(PROMPT_TABS[0].id);
  const activePromptTab = PROMPT_TABS.find((t) => t.id === promptTab) ?? PROMPT_TABS[0];

  // Save conversation summary to dashboard store when the agent
  // finishes a turn and has messages.
  const prevStatusRef = useRef(agent.status);
  useEffect(() => {
    const wasBusy = prevStatusRef.current === "submitted" || prevStatusRef.current === "streaming";
    const isReady = agent.status === "ready";
    if (wasBusy && isReady && agent.data.messages.length > 0) {
      try {
        const summary = {
          title: deriveTitle(agent.data.messages),
          channel: "web" as const,
          lastMessage: deriveLastMessage(agent.data.messages),
          lastMessageAt: new Date().toISOString(),
          messageCount: agent.data.messages.length,
          sessionId: sessionRef.current.sessionId,
        };
        saveConversation(summary);
        void fetch("/api/contacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat: summary,
            contact: {
              name: summary.title,
              sessionId: summary.sessionId,
              channel: "web",
              source: "web",
              lastMessage: summary.lastMessage,
              lastMessageAt: summary.lastMessageAt,
            },
          }),
        }).catch(() => {
          // Best-effort server mirror
        });
      } catch {
        // Best-effort
      }
    }
    prevStatusRef.current = agent.status;
  }, [agent.status, agent.data.messages]);

  const send = async (input: Parameters<typeof agent.send>[0]) => {
    const result = agent.send(input);
    void persistSessionWhenAccepted(clientSession, eventsRef, sessionRef);
    await result;
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text || isBusy) return;

    await send({ message: text });
  };

  const handleStop = async () => {
    if (!(await waitForSessionId(clientSession, 1_000))) {
      agent.stop();
      return;
    }

    try {
      await clientSession.cancel();
    } catch {
      agent.stop();
    }
  };

  const handleNewChat = async () => {
    if (isBusy) await handleStop();
    agent.stop();
    agent.reset();
    clearSavedChat();
    eventsRef.current = [];
    setChatModel(null);
    onReset();
  };

  const handleSignOut = async () => {
    if (isBusy) await handleStop();
    agent.stop();
    agent.reset();
    clearSavedChat();
    onSignOut?.();
  };

  const composer = (
    <PromptInput
      onSubmit={handleSubmit}
      emptyErrorMessage={t("chat.emptyMessage")}
    >
      <PromptInputTextarea placeholder={t("chat.sendPlaceholder")} />
      <PromptInputSubmit onStop={() => void handleStop()} status={agent.status} />
    </PromptInput>
  );

  return (
    <div className="page-enter relative flex h-full flex-col overflow-hidden">
      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 bg-pattern bg-pattern-grid bg-pattern-fade opacity-20" />
      ) : null}
      {isEmpty ? null : (
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5">
            <StatusDot status={agent.status} />
            <span className="truncate font-medium text-sm">{AGENT_NAME}</span>
          </span>
          <span className="flex items-center gap-2">
            <ProviderStatusBadge data={catalog} />
            {modelPicker}
            <Button
              onClick={() => void handleNewChat()}
              size="sm"
              title={t("chat.newConversation")}
              variant="ghost"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              <span className="hidden sm:inline">{t("chat.newChat")}</span>
            </Button>
            {onSignOut ? (
              <Button
                onClick={() => void handleSignOut()}
                size="icon-sm"
                title={t("chat.signOut")}
                variant="ghost"
              >
                <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.75} />
                <span className="sr-only">{t("chat.signOut")}</span>
              </Button>
            ) : null}
          </span>
        </header>
      )}

    {agent.error ? (
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 sm:px-6">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm shadow-[var(--shadow-soft)]">
          <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">{t("chat.requestFailed")}</p>
            <p className="mt-0.5 text-muted-foreground">{agent.error.message}</p>
          </div>
        </div>
      </div>
    ) : null}

    {isEmpty ? null : (
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
          {agent.data.messages.map((message, index) => (
            <AgentMessage
              canRespond={!isBusy}
              isStreaming={
                agent.status === "streaming" && index === agent.data.messages.length - 1
              }
              key={message.id}
              message={message}
              onInputResponses={(inputResponses) => send({ inputResponses })}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    )}

    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6",
        isEmpty
          ? "flex max-w-xl flex-1 flex-col items-center justify-center gap-8 pb-[10vh]"
          : "max-w-3xl shrink-0 pb-6",
      )}
    >
      {isEmpty ? (
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-4xl font-semibold sm:text-5xl">
            <span className="text-muted-foreground/40">st</span>
            <span className="text-foreground">eve</span>
          </h1>
          <p className="max-w-sm text-balance text-sm leading-relaxed text-muted-foreground">
            {t("chat.tagline")}
          </p>
          {MONITORING_HREF ? (
            <Pill href={MONITORING_HREF} title={t("chat.hostMetrics")}>
              {t("chat.liveMetrics")}
            </Pill>
          ) : null}
          {onSignOut ? (
            <Button onClick={() => void handleSignOut()} size="sm" variant="ghost">
              <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.75} />
              {t("chat.signOut")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="w-full">{composer}</div>
      {isEmpty ? (
        <div className="flex w-full flex-col items-center gap-5">
          {/* The header carries the picker once a chat is under way; on the
              empty screen there is no header, and this is the moment the
              choice actually matters. */}
          <div className="flex items-center gap-2">
            <ProviderStatusBadge data={catalog} />
            {modelPicker}
          </div>
          <SlidingTabs
            onValueChange={setPromptTab}
            tabs={PROMPT_TABS.map(({ id, label }) => ({ id, label: t(label) }))}
            value={promptTab}
          />
          <div className="flex flex-wrap items-center justify-center gap-2">
            {activePromptTab.prompts.map((promptKey) => (
              // The chip surface goes opaque here: the beam's core is painted
              // behind the child, and `bg-card/50` let it read through.
              <Beam active={!isBusy} colorVariant="mono" key={promptKey} strength={0.4}>
                <button
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground shadow-[var(--shadow-inset)] transition-all duration-150 hover:bg-accent hover:text-accent-foreground hover:border-input active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  disabled={isBusy}
                  onClick={() => void send({ message: t(promptKey) })}
                  type="button"
                >
                  {t(promptKey)}
                </button>
              </Beam>
            ))}
          </div>
        </div>
      ) : null}
    </div>
    </div>
  );
}

function BasicAuthForm({
  onAuthenticated,
}: {
  readonly onAuthenticated: (credentials: BasicCredentials) => void;
}) {
  const t = useT();
  const [error, setError] = useState<string>();
  const [isSafeOrigin, setIsSafeOrigin] = useState<boolean>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsSafeOrigin(window.location.protocol === "https:");
  }, []);

  if (isSafeOrigin === undefined) {
    return <AgentLoading />;
  }

  if (!isSafeOrigin) {
    return <SecureConnectionRequired />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = {
      username: String(form.get("username") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };
    if (!credentials.username || !credentials.password) return;

    setError(undefined);
    setIsSubmitting(true);
    try {
      const client = new Client({
        host: window.location.origin,
        auth: { basic: credentials },
        redirect: "error",
      });
      await client.info();
      onAuthenticated(credentials);
    } catch {
      setError(t("auth.incorrectCredentials"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-elevated)]">
        <p className="text-xs font-medium uppercase text-muted-foreground">steve</p>
        <h1 className="mt-3 text-2xl font-semibold">{t("auth.signIn")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("auth.signInDescription")}
        </p>
        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("auth.username")}</span>
            <Input autoComplete="username" name="username" required />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("auth.password")}</span>
            <Input autoComplete="current-password" name="password" required type="password" />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? t("auth.checking") : t("auth.continue")}
          </Button>
        </form>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          {t("auth.credentialsNote")}
        </p>
      </section>
    </div>
  );
}

function AgentLoading() {
  const t = useT();
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
      <Orb state="connecting" size={64} />
      <p className="text-sm">{t("chat.loadingAgent")}</p>
    </div>
  );
}

function SecureConnectionRequired() {
  const t = useT();
  return (
    <div className="flex h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-destructive/20 bg-destructive/5 p-7 shadow-[var(--shadow-elevated)]">
        <div className="flex items-start gap-3.5">
          <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <h1 className="text-lg font-semibold">{t("auth.httpsRequired")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("auth.httpsRequiredDesc")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function AuthConfigurationError() {
  const t = useT();
  return (
    <div className="flex h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-destructive/20 bg-destructive/5 p-7 shadow-[var(--shadow-elevated)]">
        <div className="flex items-start gap-3.5">
          <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <h1 className="text-lg font-semibold">{t("auth.notConfigured")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("auth.notConfiguredDesc")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function loadSavedChat(): SavedEveChat {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedEveChat) : {};
  } catch {
    return {};
  }
}

async function restoreSavedChat(
  auth: ClientAuth | undefined,
  abortSignal: AbortSignal,
): Promise<SavedEveChat> {
  const saved = loadSavedChat();
  const events = [...(saved.events ?? [])];
  const lastEvent = events.at(-1);

  if (
    !saved.session?.sessionId ||
    (lastEvent !== undefined && isCurrentTurnBoundaryEvent(lastEvent))
  ) {
    return saved;
  }

  try {
    const client = new Client({ host: window.location.origin, auth, redirect: "error" });
    const session = client.session(saved.session);
    const signal = AbortSignal.any([abortSignal, AbortSignal.timeout(10_000)]);

    while (!signal.aborted) {
      for await (const event of session.stream({ startIndex: events.length, signal })) {
        events.push(event);
        const nextSession = sessionStateAfterEvent(session.state, event, events.length);
        const restored = {
          events,
          session: nextSession,
        };
        saveChat(restored);
        if (isCurrentTurnBoundaryEvent(event)) return restored;
        if (event.type === "input.requested" || event.type === "authorization.required") {
          return restored;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return {
      events,
      session: { ...session.state, streamIndex: events.length },
    };
  } catch {
    // If we streamed no new events, the session likely doesn't exist —
    // start fresh instead of hanging, and clear the stale localStorage entry.
    if (events.length === (saved.events?.length ?? 0)) {
      clearSavedChat();
      return {
        events: [],
        session: undefined,
      };
    }
    // Otherwise this was a mid-restore timeout/abort: events fetched so far
    // were already persisted via saveChat() in the loop above, so keep them
    // instead of discarding real progress.
    return {
      events,
      session: saved.session,
    };
  }
}

async function persistSessionWhenAccepted(
  session: ClientSession,
  eventsRef: { readonly current: readonly HandleMessageStreamEvent[] },
  sessionRef: { current: SessionState },
) {
  if (!(await waitForSessionId(session, 5_000))) return;
  sessionRef.current = session.state;
  saveChat({ events: eventsRef.current, session: session.state });
}

async function waitForSessionId(session: ClientSession, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!session.state.sessionId && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(session.state.sessionId);
}

function sessionStateAfterEvent(
  state: SessionState,
  event: HandleMessageStreamEvent,
  streamIndex: number,
): SessionState {
  if (event.type === "session.waiting") {
    return { ...state, continuationToken: event.data.continuationToken, streamIndex };
  }
  if (event.type === "session.completed" || event.type === "session.failed") {
    return { streamIndex };
  }
  return { ...state, streamIndex };
}

function saveChat(chat: SavedEveChat) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chat));
  } catch {
    // Chat remains usable when storage is unavailable or full.
  }
}

function clearSavedChat() {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    // Signing out still clears in-memory credentials and session state.
  }
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const tone =
    status === "error"
      ? "bg-destructive"
      : isLive
        ? "bg-foreground"
        : status === "ready"
          ? "bg-muted-foreground"
          : "bg-muted-foreground/40";

  return (
    <span className="relative flex size-1.5">
      {isLive ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-40",
            tone,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-1.5 rounded-full transition-colors", tone)} />
    </span>
  );
}
