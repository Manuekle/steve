"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { ToolResult, ToolResultOutput } from "@/components/agents/tool-result";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { ProviderLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useT } from "@/lib/i18n/provider";
import { Beam } from "@/components/ui/beam";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { AppChrome } from "./screen-chrome";

/**
 * The chat, as `app/_components/agent-chat.tsx` renders it — and it is the one
 * screen where every part had to come from the app or it would read as a
 * generic assistant.
 *
 * Three things carry it. A user message is a filled primary pill and an
 * assistant message has no surface at all; giving the assistant a grey bubble
 * is the single thing that stops a chat mockup looking like this product. Tool
 * calls are `ToolResult` — the terminal-icon disclosure with a coloured status
 * and a copy button — not the plain `Tool` header from `tool.tsx`, which is a
 * different component the chat has never used. And the header carries the
 * provider badge and the model trigger, because a bare agent name over a
 * conversation is every chat UI ever shipped.
 *
 * Static demo: the two opening turns render as-is, the input is decorative
 * (submit is a no-op), and "New Chat" resets to OPENING.
 */

// ── Conversation model ──────────────────────────────────────────────

type ToolCall = {
  readonly name: string;
  readonly output?: string;
  readonly status: "running" | "success";
};

type Turn = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly tools?: readonly ToolCall[];
  /** Draws the block caret on the last line, as `MessageResponse` does while
   *  a real answer is still arriving. */
  readonly streaming?: boolean;
};

// ── Screen ──────────────────────────────────────────────────────────

export function ChatScreen({ empty = false }: { readonly empty?: boolean }) {
  const t = useT();

  /**
   * The two turns the section opens on. Every tool named is one that exists
   * in `agent/tools/`, spelled the way the runtime prints it — the raw name
   * off the tool part, in English snake_case.
   */
  const opening: readonly Turn[] = [
    {
      id: "seed-1",
      role: "user",
      text: t("landing.demo.chat.userMsg"),
    },
    {
      id: "seed-2",
      role: "assistant",
      text: t("landing.demo.chat.assistantMsg"),
      tools: [
        {
          name: "search_knowledge",
          status: "success",
          output: t("landing.demo.chat.toolQuery"),
        },
        {
          name: "transfer_human",
          status: "success",
          output: '{\n  "contact": "Carlos Ruiz",\n  "status": "waiting_human"\n}',
        },
      ],
    },
  ];
  const [turns, setTurns] = useState<readonly Turn[]>(empty ? [] : opening);

  // Static demo — no interactive turns.
  const handleSubmit = () => {};

  return (
    <AppChrome active="/" pattern>
      {/* No page header and no container: a 56px bar, the conversation on a
          3xl rail, and the composer pinned under it. */}
      {!empty && (
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
        <span className="flex min-w-0 items-center gap-2.5">
          {/* `StatusDot`. Idle is `bg-muted-foreground` with no halo; the halo
              belongs to a turn that is actually in flight. */}
          <span className="relative flex size-1.5">
            <span className="relative inline-flex size-1.5 rounded-full bg-muted-foreground" />
          </span>
          <span className="truncate font-medium text-sm">steve</span>
        </span>

        <span className="flex items-center gap-2">
          {/* `ProviderStatusBadge`: the provider's state and its balance, which
              is what the pill says — not the vendor's name. */}
          <StatusBadge status="connected" label={`${t("models.status.ok")} · ${t("models.balance", { amount: "18.40" })}`} />

          {/* `ModelPicker`'s trigger, down to the vendor mark and the model id
              it prints. `claude-sonnet-5` is `DEFAULT_MODELS.anthropic`; Opus
              is what the catalogue picks for automations, not for chat. */}
          <span className="inline-flex max-w-[15rem] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 font-medium text-xs shadow-[var(--shadow-inset)]">
            <ProviderLogo vendor="anthropic" size={14} />
            <span className="truncate">claude-sonnet-5</span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={14}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
          </span>

          {!empty && (
            <Button size="sm" variant="ghost" onClick={() => setTurns(opening)}>
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              <span className="hidden sm:inline">{t("chat.newChat")}</span>
            </Button>
          )}
        </span>
      </header>
      )}

      {/* New chat mirrors the real app: greeting + composer centred as one
          column, with the plan pill, model picker, Chat/Automate/Analyze
          tabs and example prompts. A written conversation sticks to the
          bottom (`use-stick-to-bottom`). */}
      {empty ? (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-4 py-6 text-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <h1 className="text-4xl font-semibold">
              <span className="text-muted-foreground/40">st</span>
              <span className="text-foreground">eve</span>
            </h1>
            <p className="max-w-sm text-balance text-sm leading-relaxed text-muted-foreground">
              {t("chat.tagline")}
            </p>
          </div>
          <div className="w-full max-w-3xl">
            <PromptInput onSubmit={handleSubmit} emptyErrorMessage={t("chat.emptyMessage")}>
              <PromptInputTextarea placeholder={t("chat.sendPlaceholder")} />
              <PromptInputSubmit status="ready" />
            </PromptInput>
          </div>
          <div className="flex w-full flex-col items-center gap-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {t("landing.demo.chat.planPill")}
            </span>
            <div className="flex items-center gap-2">
              <StatusBadge status="connected" label="Auto · openai/gpt-5-mini" />
              <Button size="sm" variant="ghost">{t("models.pick")}</Button>
            </div>
            <SlidingTabs
              value="chat"
              onValueChange={() => {}}
              tabs={[
                { id: "chat", label: t("chat.tabChat") },
                { id: "automate", label: t("chat.tabAutomate") },
                { id: "analyze", label: t("chat.tabAnalyze") },
              ]}
            />
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[t("chat.promptChat1"), t("chat.promptChat2"), t("chat.promptChat3")].map((p) => (
                <Beam active={true} colorVariant="mono" key={p} strength={0.4}>
                  <span className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground shadow-[var(--shadow-inset)]">
                    {p}
                  </span>
                </Beam>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end gap-6 overflow-hidden px-4 py-6 sm:px-6">
            {turns.slice(-4).map((turn) => (
              <Message key={turn.id} from={turn.role}>
                <MessageContent>
                  {turn.tools?.map((tool) => (
                    <ToolResult
                      key={`${turn.id}-${tool.name}`}
                      tool={tool.name}
                      title={t(tool.status === "running" ? "chat.toolRunning" : "chat.toolCompleted")}
                      status={tool.status}
                      kind="terminal"
                      // A finished call arrives collapsed, which is where the app
                      // leaves one: `collapseOnComplete` only fires on the
                      // running→done transition, so a seeded success would sit
                      // open with its payload burying the answer under it.
                      defaultOpen={tool.status === "running"}
                      collapseOnComplete
                      copyText={tool.output}
                    >
                      {tool.output ? <ToolResultOutput language="json">{tool.output}</ToolResultOutput> : null}
                    </ToolResult>
                  ))}
                  {turn.text ? (
                    <MessageResponse caret="block" isAnimating={turn.streaming}>
                      {turn.text}
                    </MessageResponse>
                  ) : null}
                </MessageContent>
              </Message>
            ))}
          </div>

          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-6 sm:px-6">
            <PromptInput onSubmit={handleSubmit} emptyErrorMessage={t("chat.emptyMessage")}>
              <PromptInputTextarea placeholder={t("chat.sendPlaceholder")} />
              <PromptInputSubmit status="ready" />
            </PromptInput>
          </div>
        </>
      )}
    </AppChrome>
  );
}
