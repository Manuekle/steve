"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@/components/icons/icon";
import { PinIcon, Delete01Icon, MessageCircleIcon } from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Card } from "../../_components/dashboard-card";
import { ChannelIcon } from "../../_components/channel-badge";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { InputClear } from "@/components/ai-elements/input-clear";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton, ChatsSkeleton } from "@/components/ai-elements/skeleton";
import { Pagination } from "@/components/ai-elements/pagination";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useT } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import { getChats, mergeChats, togglePin as togglePinLocal, deleteChat as deleteChatLocal } from "@/lib/dashboard-store";
import type { ChatSummary, ChannelId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePolling } from "@/lib/use-polling";

const CHAT_STORAGE_KEY = "steve:eve-chat:v1";

/** The Eve session the main chat page would reopen right now, if any. */
function openSessionId(): string | undefined {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return undefined;
    return (JSON.parse(raw) as { session?: { sessionId?: string } }).session?.sessionId;
  } catch {
    return undefined;
  }
}

function clearOpenChat() {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    // Best-effort
  }
}

/** Point the main chat page at a conversation from the history by writing its
 *  session to localStorage. The caller navigates afterwards; `AgentSession`
 *  reads this key on mount, so a client-side push picks it up.
 *
 *  A chat with no sessionId never reached Eve (imported channel rows, or a
 *  conversation that failed to connect), so it clears the key and starts fresh
 *  rather than hanging on "Loading agent…". */
function stageChatSession(chat: ChatSummary) {
  if (!chat.sessionId) {
    clearOpenChat();
    return;
  }
  try {
    localStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify({
        events: [],
        session: { sessionId: chat.sessionId, streamIndex: 0 },
      }),
    );
  } catch {
    // Best-effort restore
  }
}

export default function ChatsPage() {
  const t = useT();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChannelId | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);

  const CHANNEL_FILTERS: ReadonlyArray<{ id: ChannelId | "all"; label: string }> = [
    { id: "all", label: t("chats.filterAll") },
    { id: "web", label: t("chats.filterWeb") },
    { id: "whatsapp", label: t("chats.filterWhatsApp") },
    { id: "instagram", label: t("chats.filterInstagram") },
  ];

  const refresh = useCallback(async () => {
    const local = getChats();
    const result = await fetchJson<{ chats?: ChatSummary[] }>("/api/contacts?limit=200", t);
    if (result.ok) {
      setChats(mergeChats(local, result.data.chats ?? []));
      setError(null);
    } else {
      // The browser's own copy still renders — the banner is there to say the
      // list may be behind the server, not to blank the page.
      setChats(local);
      setError(result.error);
    }
    setIsLoading(false);
    return result.ok;
  }, [t]);

  // `usePolling` fires once immediately — a mount effect on top of it made
  // every visit load the list twice.
  usePolling(() => void refresh(), 30_000);

  const filtered = useMemo(() => {
    let result = chats;
    if (filter !== "all") result = result.filter((c) => c.channel === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.lastMessage.toLowerCase().includes(q),
      );
    }
    return [...result].sort((a, b) => {
      // Pinned first, then by last message time
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });
  }, [chats, search, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  // A filter that shortens the list can strand you past the end; clamping on
  // render (rather than in an effect) avoids a frame of "no results" on a list
  // that does have results.
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Any change to what is being listed puts you back at the top of it.
  useEffect(() => {
    setPage(1);
  }, [search, filter, pageSize]);

  // Client-side navigation, not `window.location`: a full document load here
  // threw away the app shell and repainted the whole page just to switch route.
  // `AgentSession` reads the staged session key on mount, so a push is enough.
  const handleOpen = (chat: ChatSummary) => {
    stageChatSession(chat);
    router.push("/chat");
  };

  const handlePin = (chat: ChatSummary) => {
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, pinned: !c.pinned } : c)));
    togglePinLocal(chat.id);
    void fetchJson("/api/contacts", t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      // Same id mismatch as delete — prefer the session id.
      body: JSON.stringify({ chatId: chat.sessionId ?? chat.id, togglePin: true }),
    }).then((result) => {
      if (!result.ok) setError(result.error);
    });
  };
  const handleDelete = async (chat: ChatSummary) => {
    if (!(await confirm({ title: t("chats.confirmDelete") }))) return;
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    deleteChatLocal(chat.id);
    // The row is only half the conversation: the main chat page reopens
    // whatever session is parked in localStorage, so deleting the chat you
    // currently have open has to drop that too — otherwise it comes back on
    // the next visit and the next finished turn writes the summary again.
    if (chat.sessionId && openSessionId() === chat.sessionId) clearOpenChat();
    // Delete by session id when there is one: the server store minted its own
    // id and `mergeChats` handed this row the browser's instead, so the id in
    // `chat.id` may not match anything server-side.
    const key = chat.sessionId ?? chat.id;
    const result = await fetchJson(`/api/contacts?chatId=${encodeURIComponent(key)}`, t, {
      method: "DELETE",
    });
    if (result.ok) {
      void refresh();
      toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
    } else {
      setError(result.error);
      toast({ title: t("common.somethingWentWrong"), description: t("common.somethingWentWrongDescription"), status: "error" });
    }
  };

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
        {confirmDialog}
        <Skeleton
          className="min-h-[500px]"
          isLoading={isLoading}
          skeleton={<ChatsSkeleton />}
        >
        <div className="content-enter">
        <ErrorBanner
          className="mb-6"
          error={error}
          onRetry={() => void refresh()}
          onDismiss={() => setError(null)}
        />
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-semibold">{t("chats.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("chats.subtitle")}
          </p>
        </header>

        {/* Search + filters */}
        <div className="mb-6 space-y-3">
          <InputClear
            onChange={setSearch}
            placeholder={t("chats.searchPlaceholder")}
            clearLabel={t("chats.searchClear")}
            value={search}
          />
          <SlidingTabs
            tabs={CHANNEL_FILTERS}
            onValueChange={(id) => setFilter(id as ChannelId | "all")}
            value={filter}
          />
        </div>

        {/* Chat list */}
        {filtered.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center list-fade-in">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={MessageCircleIcon} size={20} strokeWidth={1.75} />
              </div>
              <p className="text-sm font-medium">{t("chats.noResults")}</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {search
                  ? t("chats.noResultsSearch")
                  : t("chats.noChatsInChannel")}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2" key={`${search}-${currentPage}`}>
            {visible.map((chat, i) => (
              <Card key={chat.id} className="list-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
                <div className="flex items-center gap-3 px-5 py-4">
                  {/* Channel icon */}
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                    <ChannelIcon channel={chat.channel} />
                  </div>

                  {/* Content */}
                  <button
                    aria-label={chat.sessionId ? t("chats.openConversation") : t("chats.startNewChat")}
                    onClick={() => handleOpen(chat)}
                    className="min-w-0 flex-1 text-left"
                    type="button"
                  >
                    <div className="flex items-center gap-2">
                      {chat.pinned ? (
                        <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
                      ) : null}
                      <p className="truncate text-sm font-medium hover:text-foreground">
                        {chat.title}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {chat.lastMessage}
                    </p>
                  </button>

                  {/* Meta + actions */}
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="hidden text-right sm:block">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {relativeTime(chat.lastMessageAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground/60 tabular-nums">
                        {chat.messageCount} {t("chats.msgs")}
                      </p>
                    </div>
                    {/* Icon-only controls carry the app's own tooltip, not the
                        browser's `title` — same affordance the automations and
                        reminders rows already give. `aria-label` still names
                        them for assistive tech. */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          aria-label={chat.pinned ? t("chats.unpin") : t("chats.pin")}
                          onClick={() => handlePin(chat)}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                            chat.pinned && "text-foreground",
                          )}
                          type="button"
                        >
                          <HugeiconsIcon icon={PinIcon} size={16} strokeWidth={1.75} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {chat.pinned ? t("chats.unpin") : t("chats.pin")}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          aria-label={t("chats.delete")}
                          onClick={() => void handleDelete(chat)}
                          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          type="button"
                        >
                          <HugeiconsIcon icon={Delete01Icon} size={16} strokeWidth={1.75} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{t("chats.delete")}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Pager + summary footer */}
        {filtered.length > 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <Pagination
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              page={currentPage}
              pageCount={pageCount}
              pageSize={pageSize}
            />
            <p className="text-center text-muted-foreground/60 text-xs">
              {t("chats.summary", { shown: filtered.length, total: chats.length })}
            </p>
          </div>
        ) : null}
        </div>
        </Skeleton>
    </PageContainer>
  );
}
