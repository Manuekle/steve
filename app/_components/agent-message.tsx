"use client";

import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ExternalLinkIcon, File01Icon } from "@hugeicons/core-free-icons";
import { type FormEvent, useState } from "react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { ToolResult, ToolResultOutput, type ToolResultStatus } from "@/components/agents/tool-result";
import { Orb } from "@/components/ui/orb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

export function AgentMessage({
  canRespond,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
}) {
  const t = useT();
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );
  const hasText = lastTextIndex >= 0;

  return (
    <Message
      data-optimistic={message.metadata?.optimistic ? "true" : undefined}
      from={message.role}
    >
      <MessageContent>
        {message.parts.map((part, index) => (
          <AgentMessagePart
            canRespond={canRespond}
            key={partKey(part, index)}
            onInputResponses={onInputResponses}
            part={part}
            showCaret={isStreaming && message.role === "assistant" && index === lastTextIndex}
          />
        ))}
        {/* Active composing indicator — shown when the assistant is
            streaming but hasn't emitted text content yet. */}
        {isStreaming && message.role === "assistant" && !hasText ? (
          <div className="flex items-center gap-2.5 py-1 pl-1 text-muted-foreground">
            <Orb state="composing" />
            <span className="text-xs">{t("chat.composing")}</span>
          </div>
        ) : null}
      </MessageContent>
    </Message>
  );
}

function AgentMessagePart({
  canRespond,
  onInputResponses,
  part,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
}) {
  const t = useT();
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return (
        <MessageResponse caret="block" isAnimating={showCaret}>
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return (
        <Reasoning defaultOpen isStreaming={part.state === "streaming"}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "file": {
      const label = part.filename ?? t("chat.attachment");
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3.5 py-2.5 text-sm shadow-[var(--shadow-soft)]">
          <HugeiconsIcon icon={File01Icon} size={16} strokeWidth={1.75} className="text-muted-foreground" />
          {part.url ? (
            <a
              className="inline-flex items-center gap-1 underline underline-offset-4"
              href={part.url}
              rel="noreferrer"
              target="_blank"
            >
              {label}
              <HugeiconsIcon icon={ExternalLinkIcon} size={12} strokeWidth={1.75} />
            </a>
          ) : (
            <span>{label}</span>
          )}
          <span className="text-muted-foreground">{part.mediaType}</span>
        </div>
      );
    }
    case "authorization":
      return (
        <div className="space-y-2 rounded-lg border border-border bg-card/50 px-4 py-3 text-sm shadow-[var(--shadow-soft)]">
          <p className="font-medium">{part.displayName}</p>
          <p className="text-muted-foreground">{part.description}</p>
          {part.state === "required" ? (
            <>
              {part.authorization?.instructions ? <p>{part.authorization.instructions}</p> : null}
              {part.authorization?.userCode ? (
                <code className="block w-fit rounded bg-muted px-2 py-1">
                  {part.authorization.userCode}
                </code>
              ) : null}
              {part.authorization?.url ? (
                <Button asChild size="sm">
                  <a href={part.authorization.url} rel="noreferrer" target="_blank">
                    {t("chat.signIn")}
                    <HugeiconsIcon icon={ExternalLinkIcon} size={16} strokeWidth={1.75} />
                  </a>
                </Button>
              ) : null}
            </>
          ) : (
            <p>
              {part.outcome === "authorized"
                ? t("chat.authorizationComplete")
                : t("chat.authorizationStatus", { status: part.outcome })}
            </p>
          )}
        </div>
      );
    case "dynamic-tool": {
      // A tool call is an execution disclosure: name, status, and the payload
      // it produced, collapsed once it finishes so a long run doesn't bury the
      // answer. It stays open while it needs a person.
      const needsPerson = part.state === "approval-requested" || part.state === "approval-responded";
      const output = part.errorText ?? formatToolOutput(part.output);
      return (
        <ToolResult
          tool={part.toolName}
          title={t(TOOL_STATE_KEYS[part.state] ?? "chat.toolRunning")}
          status={toolResultStatus(part.state)}
          kind="terminal"
          defaultOpen={needsPerson}
          collapseOnComplete={!needsPerson}
          copyText={output || undefined}
        >
          <InputRequestActions
            canRespond={canRespond}
            part={part}
            onInputResponses={onInputResponses}
          />
          {output ? <ToolResultOutput language="json">{output}</ToolResultOutput> : null}
        </ToolResult>
      );
    }
    default: {
      const exhaustive: never = part;
      return exhaustive;
    }
  }
}

/** Map the Eve/AI-SDK part state onto the four states the disclosure renders. */
function toolResultStatus(state: EveDynamicToolPart["state"]): ToolResultStatus {
  switch (state) {
    case "output-error":
      return "error";
    case "output-available":
      return "success";
    default:
      return "running";
  }
}

const TOOL_STATE_KEYS: Partial<Record<EveDynamicToolPart["state"], string>> = {
  "approval-requested": "chat.toolAwaitingApproval",
  "approval-responded": "chat.toolApprovalSent",
  "input-streaming": "chat.toolPending",
  "input-available": "chat.toolRunning",
  "output-available": "chat.toolCompleted",
  "output-error": "chat.toolFailed",
};

/** Tool payloads arrive as objects far more often than strings. */
function formatToolOutput(output: unknown): string {
  if (output === undefined || output === null) return "";
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function InputRequestActions({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId,
  );
  const acceptsText = inputRequest.allowFreeform || !inputRequest.options?.length;

  const handleTextResponse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = text.trim();
    if (!response || !canRespond) return;
    void onInputResponses([{ requestId: inputRequest.requestId, text: response }]);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/50 p-4 shadow-[var(--shadow-soft)]">
      <p className="text-sm text-muted-foreground">{inputRequest.prompt}</p>
      {inputResponse ? (
        <p className="font-medium text-sm">
          {t("chat.responded", { response: selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId ?? "" })}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options?.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  {
                    optionId: option.id,
                    requestId: inputRequest.requestId,
                  },
                ]);
              }}
              size="sm"
              title={option.description}
              type="button"
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </Button>
          ))}
          {acceptsText ? (
            <form className="flex min-w-64 flex-1 gap-2" onSubmit={handleTextResponse}>
              <Input
                aria-label={t("chat.responseLabel")}
                disabled={!canRespond}
                onChange={(event) => setText(event.target.value)}
                placeholder={t("chat.typeResponse")}
                value={text}
              />
              <Button disabled={!canRespond || !text.trim()} size="sm" type="submit">
                {t("chat.send")}
              </Button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "authorization":
      return `${part.type}:${part.turnId}:${part.name}`;
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}
