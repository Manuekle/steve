"use client";

import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  AiSearch01Icon,
  ArrowUp02Icon,
  BulbIcon,
  CodeIcon,
  GlobalSearchIcon,
  Image01Icon,
  PaperclipIcon,
  CallSpark02Icon,
  StopIcon,
  ToolCaseIcon,
  XIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { ChatDropdown } from "./chat-dropdown";
import {
  ChatAttachmentsPreview,
  type PendingAttachment,
} from "./chat-attachments";
import {
  AgentMentionDropdown,
  type DropdownActionItem,
} from "./agent-mention-dropdown";
import { type MentionableAgent } from "@/lib/chat-agents";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ChatInputSubmitPayload = {
  readonly text: string;
  readonly files: File[];
  readonly mentionedAgent?: MentionableAgent | null;
  readonly toolMode?: string | null;
};

const MIN_CHARS = 1;
const MAX_CHARS = 4000;

function buildToolsMenu(t: (key: string) => string) {
  return [
    {
      id: "image",
      label: t("chat.toolImage"),
      icon: Image01Icon,
      promptPrefix: t("chat.promptPrefixImage"),
    },
    {
      id: "web",
      label: t("chat.toolWeb"),
      icon: GlobalSearchIcon,
      promptPrefix: t("chat.promptPrefixWeb"),
    },
    {
      id: "code",
      label: t("chat.toolCode"),
      icon: CodeIcon,
      promptPrefix: t("chat.promptPrefixCode"),
    },
    {
      id: "research",
      label: t("chat.toolResearch"),
      icon: AiSearch01Icon,
      promptPrefix: t("chat.promptPrefixResearch"),
    },
    {
      id: "reason",
      label: t("chat.toolReason"),
      icon: BulbIcon,
      promptPrefix: t("chat.promptPrefixReason"),
    },
  ] as const;
}

export function ChatInput({
  onSubmit,
  onStop,
  isBusy,
  placeholder,
  initialText,
  isEmpty = false,
}: {
  readonly onSubmit: (payload: ChatInputSubmitPayload) => void | Promise<void>;
  readonly onStop: () => void | Promise<void>;
  readonly isBusy: boolean;
  readonly placeholder?: string;
  readonly initialText?: string;
  readonly isEmpty?: boolean;
}) {
  const t = useT();
  const TOOLS_MENU = buildToolsMenu(t);
  const [text, setText] = useState(initialText ?? "");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [activeToolMode, setActiveToolMode] = useState<string | null>(null);

  // Mentions
  const [mentionableAgents, setMentionableAgents] = useState<MentionableAgent[]>([]);
  const [mentionState, setMentionState] = useState<{ filter: string; index: number } | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [activeMentionAgent, setActiveMentionAgent] = useState<MentionableAgent | null>(null);
  const isMentionOpen = mentionState !== null;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetch("/api/chat/agents")
      .then((r) => r.ok ? r.json() : null)
      .then((data: { agents?: MentionableAgent[] } | null) => setMentionableAgents(data?.agents ?? []))
      .catch(() => setMentionableAgents([]));
  }, []);

  useEffect(() => {
    if (initialText !== undefined) {
      setText(initialText);
      textareaRef.current?.focus();
    }
  }, [initialText]);


  const addFiles = (files: FileList | File[]) => {
    const newItems: PendingAttachment[] = Array.from(files).map((file) => {
      const isImage = file.type.startsWith("image/");
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        isImage,
      };
    });
    setPendingAttachments((prev) => [...prev, ...newItems]);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      addFiles(pastedFiles);
    }
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length > MAX_CHARS) return;
    setText(value);

    // Auto-expand textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 260)}px`;
    }

    // Detect `@` mention trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf("@");

    if (lastAt !== -1 && (lastAt === 0 || /\s/.test(textBeforeCursor[lastAt - 1]))) {
      const filter = textBeforeCursor.slice(lastAt + 1);
      if (!/\s/.test(filter)) {
        setToolsMenuOpen(false);
        setMentionState({ filter, index: lastAt });
        setMentionSelectedIndex(0);
        return;
      }
    }
    setMentionState(null);
  };

  const handleSelectMentionAgent = (agentItem: MentionableAgent) => {
    const textBeforeAt = text.slice(0, mentionState?.index ?? text.length);
    const textAfterCursor = mentionState
      ? text.slice(mentionState.index + 1 + mentionState.filter.length)
      : "";
    const nextText = `${textBeforeAt}@${agentItem.handle} ${textAfterCursor}`;
    setText(nextText);
    setActiveMentionAgent(agentItem);
    setMentionState(null);
    setToolsMenuOpen(false);
    textareaRef.current?.focus();
  };

  const handleSelectAction = (actionItem: DropdownActionItem) => {
    if (actionItem.promptPrefix) {
      if (!text.trim()) {
        setText(actionItem.promptPrefix);
      } else if (!text.startsWith(actionItem.promptPrefix)) {
        setText(`${actionItem.promptPrefix}${text}`);
      }
    }
    setMentionState(null);
    setToolsMenuOpen(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex((prev) => prev + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionState(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleSelectTool = (tool: (typeof TOOLS_MENU)[number]) => {
    setActiveToolMode(tool.id);
    setToolsMenuOpen(false);
    if (!text.trim()) {
      setText(tool.promptPrefix);
    } else if (!text.startsWith(tool.promptPrefix)) {
      setText(`${tool.promptPrefix}${text}`);
    }
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    const rawText = text.trim();
    if ((rawText.length < MIN_CHARS && pendingAttachments.length === 0) || isBusy) return;

    let targetAgent = activeMentionAgent;
    if (!targetAgent) {
      for (const a of mentionableAgents) {
        if (rawText.toLowerCase().includes(`@${a.handle.toLowerCase()}`)) {
          targetAgent = a;
          break;
        }
      }
    }

    const filesToSend = pendingAttachments.map((item) => item.file);

    setText("");
    setPendingAttachments([]);
    setMentionState(null);
    setActiveToolMode(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    await onSubmit({
      text: rawText,
      files: filesToSend,
      mentionedAgent: targetAgent,
      toolMode: activeToolMode,
    });
  };

  const activeToolLabel = TOOLS_MENU.find((tool) => tool.id === activeToolMode)?.label ?? "Tools";

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl border border-border/40 bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]"
    >
      {/* File & Image Previews */}
      <ChatAttachmentsPreview
        attachments={pendingAttachments}
        onRemove={handleRemoveAttachment}
      />

      {/* Hidden File Picker */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        className="hidden"
        accept="image/*,.pdf,.txt,.md,.json,.csv,.doc,.docx"
      />

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder ?? "Ask anything..."}
        rows={1}
        className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none max-h-56"
      />

      {/* Mention dropdown with smooth open/close motion */}
      <AgentMentionDropdown
        open={isMentionOpen}
        anchorRef={containerRef}
        agents={mentionableAgents}
        filter={mentionState?.filter ?? ""}
        selectedIndex={mentionSelectedIndex}
        onSelectAgent={handleSelectMentionAgent}
        onSelectAction={handleSelectAction}
        onClose={() => setMentionState(null)}
        onTriggerFilePicker={() => fileInputRef.current?.click()}
        isEmpty={isEmpty}
      />

      {/* Bottom action bar with Tooltips */}
      <TooltipProvider delayDuration={150}>
        <div className="relative flex items-center gap-2 pt-4 px-0.5">
          {/* Attach button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:border-input hover:text-foreground"
                aria-label={t("chat.attachFile")}
              >
                <HugeiconsIcon icon={PaperclipIcon} size={16} strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("chat.attachFiles")}</TooltipContent>
          </Tooltip>

          {/* Tools button */}
          <div className="relative" ref={toolsMenuRef}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    setMentionState(null);
                    setToolsMenuOpen((prev) => !prev);
                  }}
                  className={cn(
                    "relative z-40 flex size-8 shrink-0 items-center justify-center rounded-xl border text-muted-foreground transition-colors hover:border-input hover:text-foreground",
                    toolsMenuOpen ? "border-border bg-accent/50" : "border-border/60",
                  )}
                  aria-label={t("chat.tools")}
                  aria-haspopup="dialog"
                  aria-expanded={toolsMenuOpen}
                >
                  <HugeiconsIcon icon={ToolCaseIcon} size={16} strokeWidth={2} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("chat.tools")}</TooltipContent>
            </Tooltip>

            <ChatDropdown
              open={toolsMenuOpen}
              onClose={() => setToolsMenuOpen(false)}
              anchorRef={toolsMenuRef}
              side={isEmpty ? "bottom" : "top"}
              label={t("chat.tools")}
              className="w-60"
            >
              <div className="min-h-0 overflow-y-auto overscroll-contain select-none p-1.5">
                <div className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground/70 border-b border-border/30 mb-1">
                  {t("chat.toolsHeader")}
                </div>
                <div className="space-y-0.5">
                  {TOOLS_MENU.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectTool(item)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors",
                        activeToolMode === item.id
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <HugeiconsIcon icon={item.icon} size={15} strokeWidth={1.75} className="shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  ))}

                  <div className="my-1 border-t border-border/30" />

                  <button
                    type="button"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      const next = text.endsWith(" ") || !text ? `${text}@` : `${text} @`;
                      setText(next);
                      setMentionState({ filter: "", index: next.length - 1 });
                      textareaRef.current?.focus();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                  >
                    <HugeiconsIcon icon={CallSpark02Icon} size={15} strokeWidth={1.75} className="text-primary shrink-0" />
                    <span>{t("chat.callAgent")}</span>
                  </button>
                </div>
              </div>
            </ChatDropdown>
          </div>

          {/* Active agent / tool label with centered XIcon */}
          {(activeMentionAgent || activeToolMode) && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-xs text-foreground select-none">
              <HugeiconsIcon
                icon={
                  activeMentionAgent
                    ? CallSpark02Icon
                    : TOOLS_MENU.find((tool) => tool.id === activeToolMode)?.icon ?? ToolCaseIcon
                }
                size={14}
                strokeWidth={2}
                className={activeMentionAgent ? "text-primary shrink-0" : "text-muted-foreground shrink-0"}
              />
              <span className="font-medium text-[12px] truncate max-w-44">
                {activeMentionAgent ? `@${activeMentionAgent.name}` : activeToolLabel}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMentionAgent(null);
                      setActiveToolMode(null);
                    }}
                    className="flex size-4 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:bg-background hover:text-foreground"
                    aria-label={t("chat.removeMode")}
                  >
                    <HugeiconsIcon icon={XIcon} size={11} strokeWidth={2.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("chat.removeMode")}</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Character counter if text is getting long */}
          {text.length > 2000 && (
            <span className="text-[11px] font-mono text-muted-foreground/60 mr-1">
              {text.length}/{MAX_CHARS}
            </span>
          )}

          {/* Send / Stop button with Tooltip */}
          {isBusy ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void onStop()}
                  className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground transition-opacity"
                  aria-label={t("chat.stopResponse")}
                >
                  <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("chat.stopResponse")}</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={text.trim().length < MIN_CHARS && pendingAttachments.length === 0}
                  className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-20 transition-opacity"
                  aria-label={t("chat.send")}
                >
                  <HugeiconsIcon icon={ArrowUp02Icon} size={15} strokeWidth={2.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("chat.send")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
