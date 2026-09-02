"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  AiImagineIcon,
  Add01Icon,
  SearchIcon,
  Delete01Icon,
  PencilEdit01Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  PauseIcon,
  PlayIcon,
  InformationCircleIcon,
  ArtificialIntelligence08Icon,
  BubbleChatIcon,
  Call02Icon,
} from "@hugeicons/core-free-icons";
import {
  ModelPicker,
  ProviderStatusBadge,
  useModelCatalog,
} from "@/components/ai-elements/model-picker";
import { AgentTemplates } from "./_components/agent-templates";
import { CapabilityPicker, type CapabilityOption } from "./_components/capability-picker";
import { ChannelRouting } from "./_components/channel-routing";
import { PageSlide } from "../../_components/page-slide";
import { PageContainer } from "../../_components/page-container";
import { Card } from "../../_components/dashboard-card";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Beam } from "@/components/ui/beam";
import { StatusBadge } from "@/components/ui/status-badge";
import { useT } from "@/lib/i18n/provider";
import { useToast } from "@/components/toast-provider";
import { useCelebrate } from "@/components/use-celebrate";
import { fetchJson, networkUiError, readApiError, uiErrorMessage, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/types";
import { toCapabilityIds } from "@/lib/agent-capabilities";

/** Skeleton for the Agents page — header + search, routing bar, then agent rows. */
function AgentsSkeleton() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-28" />
          <SkeletonBar className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBar className="h-6 w-24 rounded-full" />
          <SkeletonBar className="h-9 w-9 rounded-lg sm:w-28" />
        </div>
      </header>
      <SkeletonBar className="h-9 w-full rounded-lg" />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
        <SkeletonBar className="mb-3 h-3.5 w-40" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBar key={i} className="h-7 w-28 rounded-full" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-soft)]"
          >
            <SkeletonBar className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-4 w-32" />
              <SkeletonBar className="h-3 w-56" />
            </div>
            <SkeletonBar className="hidden h-3 w-12 sm:block" />
            <SkeletonBar className="size-7 rounded-lg" />
            <SkeletonBar className="size-7 rounded-lg" />
            <SkeletonBar className="size-7 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const t = useT();
  const { toast } = useToast();
  const celebrate = useCelebrate();
  const reduce = useReducedMotion();
  // Only models the configured provider actually serves can be assigned;
  // the server rejects anything else on save.
  const { data: catalog, loading: catalogLoading } = useModelCatalog();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Create form state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSystemPrompt, setNewSystemPrompt] = useState("");
  const [newTools, setNewTools] = useState<string[]>([]);
  const [newModel, setNewModel] = useState<string | null>(null);

  // AI optimization state
  const [aiDescription, setAiDescription] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [aiError, setAiError] = useState<UiError | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [editTools, setEditTools] = useState<string[]>([]);
  const [editModel, setEditModel] = useState<string | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Failures from the list and from every mutation share one banner.
  const [error, setError] = useState<UiError | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{ agents?: Agent[] }>("/api/agents", t);
    if (result.ok) {
      setAgents(result.data.agents ?? []);
      setError(null);
      return true;
    }
    setError(result.error);
    return false;
  }, [t]);

  /** Send a change and refresh. Returns false — leaving the form open, with
   *  the message on screen — when the server refused, instead of closing the
   *  editor and throwing away what was typed. */
  const send = useCallback(
    async (init: RequestInit & { url?: string }): Promise<boolean> => {
      const { url = "/api/agents", ...rest } = init;
      const result = await fetchJson(url, t, rest);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setError(null);
      await load();
      return true;
    },
    [load, t],
  );

  useEffect(() => {
    void load().finally(() => setIsLoading(false));
  }, []);

  const optimizeWithAI = async () => {
    if (!aiDescription.trim()) return;
    setIsOptimizing(true);
    setAiError(null);
    try {
      const res = await fetch("/api/agents/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: aiDescription.trim() }),
      });
      if (!res.ok) {
        // The server answers in English by design; the code it sends is what
        // carries over into the other language.
        setAiError(await readApiError(res, t));
        return;
      }
      const data = await res.json();
      const cfg = data.config as {
        name: string;
        description: string;
        systemPrompt: string;
        tools: string[];
      };
      setNewName(cfg.name);
      setNewDescription(cfg.description);
      setNewSystemPrompt(cfg.systemPrompt);
      setNewTools(toCapabilityIds(cfg.tools));
    } catch (err) {
      setAiError(networkUiError(err));
    } finally {
      setIsOptimizing(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.tools.some((tool) => tool.toLowerCase().includes(q)),
    );
  }, [agents, search]);

  // Lowercased so a template counts as hired however the name was cased when
  // it was saved or edited.
  const hiredNames = useMemo(
    () => new Set(agents.map((agent) => agent.name.trim().toLowerCase())),
    [agents],
  );

  const [capabilities, setCapabilities] = useState<CapabilityOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchJson<{ capabilities: CapabilityOption[] }>(
        "/api/agents/capabilities",
        t,
      );
      if (!cancelled && result.ok) setCapabilities(result.data.capabilities);
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const createAgent = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const tools = newTools;
    void send({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDescription.trim(),
        systemPrompt: newSystemPrompt.trim(),
        tools,
        model: newModel,
      }),
    }).then((ok) => {
      if (!ok) return;
      setNewName("");
      setNewDescription("");
      setNewSystemPrompt("");
      setNewTools([]);
      setNewModel(null);
      setShowCreate(false);
    });
  };

  const startEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setEditName(agent.name);
    setEditDescription(agent.description);
    setEditSystemPrompt(agent.systemPrompt);
    setEditTools(toCapabilityIds(agent.tools));
    setEditModel(agent.model ?? null);
  };

  const saveEdit = (id: string) => {
    const tools = editTools;
    void send({
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: id,
        name: editName.trim(),
        description: editDescription.trim(),
        systemPrompt: editSystemPrompt.trim(),
        tools,
        model: editModel,
      }),
    }).then((ok) => {
      if (ok) setEditingId(null);
    });
  };

  const toggleStatus = (id: string) => {
    void send({
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: id, toggleStatus: true }),
    });
  };

  const remove = (id: string) => {
    void send({
      url: `/api/agents?agentId=${encodeURIComponent(id)}`,
      method: "DELETE",
    }).then((ok) => {
      if (!ok) return;
      setDeletingId(null);
      setExpandedId(null);
      toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
    });
  };

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      <Skeleton className="min-h-[400px]" isLoading={isLoading} skeleton={<AgentsSkeleton />}>
        <div className="content-enter">
          <ErrorBanner
            className="mb-6"
            error={error}
            onRetry={() => void load()}
            onDismiss={() => setError(null)}
          />
          <header className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t("agents.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("agents.subtitle")}</p>
            </div>
            <span className="flex items-center gap-2">
            <ProviderStatusBadge data={catalog} />
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition-all duration-150 hover:border-input hover:bg-accent"
              onClick={() => setShowCreate(!showCreate)}
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              <span className="hidden sm:inline">{t("agents.new")}</span>
            </button>
            </span>
          </header>

          {/* Search */}
          {agents.length > 0 && (
            <div className="relative mb-4">
              <HugeiconsIcon icon={SearchIcon} size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("agents.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("agents.search")}
                className="pl-9"
              />
            </div>
          )}

          {/* Create form — accordion */}
          <motion.div layout>
            <motion.div
              initial={false}
              animate={{ height: showCreate ? "auto" : 0, opacity: showCreate ? 1 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
              style={{ overflow: "hidden" }}
            >
              <Card className="mb-6">
                <form onSubmit={createAgent} className="space-y-4 p-5">
                  <p className="text-sm font-medium">{t("agents.createAgent")}</p>

                  {/* AI optimization */}
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <HugeiconsIcon icon={ArtificialIntelligence08Icon} size={14} strokeWidth={1.75} className="text-primary" />
                      <span>{t("agents.createWithAI")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("agents.aiDescription")}</p>
                    <div className="flex gap-2">
                      <Input
                        aria-label={t("agents.aiPlaceholder")}
                        value={aiDescription}
                        onChange={(e) => setAiDescription(e.target.value)}
                        placeholder={t("agents.aiPlaceholder")}
                        className="flex-1"
                        autoComplete="off"
                      />
                      <Beam className="self-center" colorVariant="mono" strength={isOptimizing ? 0.9 : 0.55}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          // `outline` paints a translucent surface; the beam's
                          // core renders behind the child, so it needs an
                          // opaque one to sit on.
                          className="bg-card"
                          disabled={isOptimizing || !aiDescription.trim()}
                          onClick={optimizeWithAI}
                        >
                          <HugeiconsIcon icon={ArtificialIntelligence08Icon} size={14} strokeWidth={1.75} />
                          {isOptimizing ? t("agents.optimizing") : t("agents.optimizeWithAI")}
                        </Button>
                      </Beam>
                    </div>
                    {aiError && (
                      <p className="text-xs text-destructive">{uiErrorMessage(t, aiError)}</p>
                    )}
                  </div>

                  {newName && (
                    <p className="text-xs text-muted-foreground">{t("agents.aiResult")}</p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">{t("agents.name")}</span>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={t("agents.namePlaceholder")}
                        autoComplete="off"
                        data-1p-ignore="true"
                        required
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">{t("agents.description")}</span>
                      <Input
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder={t("agents.descriptionPlaceholder")}
                        autoComplete="off"
                        data-1p-ignore="true"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">{t("agents.systemPrompt")}</span>
                    <Textarea
                      value={newSystemPrompt}
                      onChange={(e) => setNewSystemPrompt(e.target.value)}
                      placeholder={t("agents.systemPromptPlaceholder")}
                      rows={4}
                      className="resize-y"
                    />
                  </label>
                  <div className="block space-y-1.5 text-sm">
                    <span className="font-medium">{t("agents.tools")}</span>
                    <CapabilityPicker
                      options={capabilities}
                      value={newTools}
                      onChange={setNewTools}
                    />
                  </div>
                  <div className="block space-y-1.5 text-sm">
                    <span className="font-medium">{t("agents.model")}</span>
                    <div>
                      <ModelPicker
                        models={catalog?.models ?? []}
                        value={newModel}
                        onChange={setNewModel}
                        autoLabel={catalog?.tasks?.chat}
                        loading={catalogLoading}
                        size="md"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{t("agents.modelHelp")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">{t("agents.create")}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)}>{t("agents.cancel")}</Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          </motion.div>

          {/* Which agent answers what. Above the list because it is the
              decision that gives every agent's capability list its meaning. */}
          {agents.length > 0 ? (
            <div className="mb-6">
              <ChannelRouting agents={agents} />
            </div>
          ) : null}

          {/* Agent list */}
          {filtered.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={AiImagineIcon} size={20} strokeWidth={1.75} />
                </div>
                <p className="text-sm font-medium">{t("agents.empty")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("agents.emptyHint")}</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((agent) => {
                const isExpanded = expandedId === agent.id;
                const isEditing = editingId === agent.id;
                const isActive = agent.status === "active";
                return (
                  <Card key={agent.id}>
                    <div className="flex items-center gap-3 px-5 py-4">
                      <div className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-xl shadow-[var(--shadow-inset)]",
                        isActive ? "bg-muted text-muted-foreground" : "bg-muted/50 text-muted-foreground/50",
                      )}>
                        <HugeiconsIcon icon={AiImagineIcon} size={20} strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{agent.name}</p>
                          <StatusBadge status={isActive ? "active" : "paused"} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {agent.description ||
                            toCapabilityIds(agent.tools)
                              .map((id) => t(`capability.${id}`))
                              .join(", ") ||
                            t("agents.createdAt") + " " + relativeTime(agent.createdAt)}
                        </p>
                      </div>
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {relativeTime(agent.createdAt)}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button asChild aria-label={t("agents.chatAction")} size="icon-sm" variant="ghost">
                            <Link href={`/agents/${agent.id}/chat`}>
                              <HugeiconsIcon icon={BubbleChatIcon} size={14} strokeWidth={1.75} />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("agents.chatAction")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button asChild aria-label={t("agents.callAction")} size="icon-sm" variant="ghost">
                            <Link href={`/agents/${agent.id}/voice`}>
                              <HugeiconsIcon icon={Call02Icon} size={14} strokeWidth={1.75} />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("agents.callAction")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={isActive ? t("agents.deactivate") : t("agents.activate")}
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => toggleStatus(agent.id)}
                          >
                            <HugeiconsIcon icon={isActive ? PauseIcon : PlayIcon} size={14} strokeWidth={1.75} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{isActive ? t("agents.deactivate") : t("agents.activate")}</TooltipContent>
                      </Tooltip>
                      <Button
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? t("agents.hideDetails") : t("agents.showDetails")}
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setExpandedId(isExpanded ? null : agent.id)}
                      >
                        <span className="t-icon-swap" data-state={isExpanded ? "b" : "a"}>
                          <span className="t-icon" data-icon="a">
                            <HugeiconsIcon icon={ChevronDownIcon} size={14} strokeWidth={1.75} />
                          </span>
                          <span className="t-icon" data-icon="b">
                            <HugeiconsIcon icon={ChevronUpIcon} size={14} strokeWidth={1.75} />
                          </span>
                        </span>
                      </Button>
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
                          style={{ overflow: "hidden" }}
                        >
                          <div className="border-t border-border px-5 py-4 text-xs text-muted-foreground space-y-3">
                            {/* Read ↔ edit, side by side: the read view leaves to the left and
                                the form arrives from the right, so the direction says which way
                                you moved. Cancel plays it in reverse. */}
                            <PageSlide
                              page={isEditing ? 2 : 1}
                              first={
                                // The vertical rhythm has to live inside the
                                // page now: the parent's space-y only reaches
                                // its own direct children, and that is the
                                // slider.
                                <div className="space-y-3">
                                  <div className="flex items-center gap-1.5">
                                    <HugeiconsIcon icon={InformationCircleIcon} size={12} strokeWidth={1.75} />
                                    <span className="font-medium text-foreground">{t("agents.description")}:</span>
                                    <span>{agent.description || "—"}</span>
                                  </div>
                                  {agent.systemPrompt && (
                                    <div>
                                      <p className="font-medium text-foreground mb-1">{t("agents.systemPrompt")}:</p>
                                      <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-[11px] leading-relaxed">{agent.systemPrompt}</pre>
                                    </div>
                                  )}
                                  {toCapabilityIds(agent.tools).length > 0 && (
                                    <div>
                                      <p className="font-medium text-foreground">{t("agents.tools")}:</p>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {/* Capability labels, not the raw ids the
                                            field used to hold. */}
                                        {toCapabilityIds(agent.tools).map((id) => (
                                          <span key={id} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                            {t(`capability.${id}`)}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex gap-2 pt-2 border-t border-border">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => startEdit(agent)}
                                    >
                                      <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={1.75} />
                                      {t("agents.edit")}
                                    </Button>
                                    {/* Voice is its own screen: a call has a
                                        playground, a phone number and a
                                        transcript, none of which fit in a
                                        row of buttons. */}
                                    <Button asChild size="sm" variant="outline">
                                      <Link href={`/agents/${agent.id}/chat`}>
                                        <HugeiconsIcon icon={BubbleChatIcon} size={14} strokeWidth={1.75} />
                                        {t("agents.chatAction")}
                                      </Link>
                                    </Button>
                                    <Button asChild size="sm" variant="outline">
                                      <Link href={`/agents/${agent.id}/voice`}>
                                        <HugeiconsIcon icon={Call02Icon} size={14} strokeWidth={1.75} />
                                        {t("agents.callAction")}
                                      </Link>
                                    </Button>
                                    {deletingId === agent.id ? (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-destructive">{t("agents.deleteConfirm")}</span>
                                        <Button size="sm" variant="destructive" onClick={() => remove(agent.id)}>
                                          {t("agents.delete")}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)}>
                                          {t("agents.cancel")}
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => setDeletingId(agent.id)}
                                      >
                                        <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                                        {t("agents.delete")}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              }
                              second={
                                <div className="space-y-3">
                                  <label className="block space-y-1">
                                    <span className="font-medium text-foreground">{t("agents.name")}</span>
                                    <Input
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      className="h-8 text-xs"
                                    />
                                  </label>
                                  <label className="block space-y-1">
                                    <span className="font-medium text-foreground">{t("agents.description")}</span>
                                    <Input
                                      value={editDescription}
                                      onChange={(e) => setEditDescription(e.target.value)}
                                      className="h-8 text-xs"
                                    />
                                  </label>
                                  <label className="block space-y-1">
                                    <span className="font-medium text-foreground">{t("agents.systemPrompt")}</span>
                                    <Textarea
                                      value={editSystemPrompt}
                                      onChange={(e) => setEditSystemPrompt(e.target.value)}
                                      className="text-xs resize-y"
                                      rows={4}
                                    />
                                  </label>
                                  <div className="block space-y-1">
                                    <span className="font-medium text-foreground">{t("agents.tools")}</span>
                                    <CapabilityPicker
                                      compact
                                      options={capabilities}
                                      value={editTools}
                                      onChange={setEditTools}
                                    />
                                  </div>
                                  <div className="block space-y-1">
                                    <span className="font-medium text-foreground">{t("agents.model")}</span>
                                    <div>
                                      <ModelPicker
                                        models={catalog?.models ?? []}
                                        value={editModel}
                                        onChange={setEditModel}
                                        autoLabel={catalog?.tasks?.chat}
                                        loading={catalogLoading}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => saveEdit(agent.id)}>
                                      {t("agents.save")}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                      {t("agents.cancel")}
                                    </Button>
                                  </div>
                                </div>
                              }
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                );
              })}
            </div>
          )}

          <AgentTemplates
            hiredNames={hiredNames}
            onError={setError}
            onCustom={() => {
              setShowCreate(true);
              window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
            }}
            onHired={(name) => {
              void load();
              // The first agent is the moment the product starts working for
              // you. The fourth is staffing, and staffing does not need
              // confetti — after this the toast carries it alone.
              celebrate({ once: "agent-hired" });
              toast({
                title: t("agents.templatesHiredToast", { name }),
                description: t("agents.templatesHiredToastDesc"),
                status: "success",
              });
            }}
          />
        </div>
      </Skeleton>
    </PageContainer>
  );
}
