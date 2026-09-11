"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  Delete01Icon,
  PencilEdit01Icon,
  SmartPhone01Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { Card } from "../../_components/dashboard-card";
import { KpiCard } from "../../_components/kpi-card";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useT } from "@/lib/i18n/provider";
import { fetchJson, uiErrorMessage, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import { formatE164 } from "@/lib/phone-format";
import type { Agent, PhoneNumber } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NumberDialog, type NumberDraft } from "./_components/number-dialog";

// The directory of numbers, and who answers each one.
//
// The page is a list because the question it answers is a list question:
// *which of my lines is already taken, and by whom*. Everything else — the
// capabilities, the provider ids — is detail behind an edit.
//
// The one piece of real logic on screen is the collision warning. A number
// bound to two agents does not split traffic, it crosses it, so the row of a
// number whose agent also holds another line is called out rather than left
// for somebody to notice in a transcript.

const CAPABILITY_LABEL: Record<string, string> = {
  whatsapp: "numbers.capWhatsapp",
  sms: "numbers.capSms",
  voice: "numbers.capVoice",
  instagram: "numbers.capInstagram",
};

const PROVIDER_LABEL: Record<string, string> = {
  meta: "numbers.providerMeta",
  twilio: "numbers.providerTwilio",
  elevenlabs: "numbers.providerElevenlabs",
  manual: "numbers.providerManual",
};

function NumbersSkeleton() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-32" />
          <SkeletonBar className="h-4 w-64" />
        </div>
        <SkeletonBar className="h-9 w-28 rounded-lg" />
      </header>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-4">
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="h-3 w-24" />
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function NumbersPage() {
  const t = useT();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PhoneNumber | null>(null);
  const [error, setError] = useState<UiError | null>(null);

  const load = useCallback(async () => {
    const [numbersResult, agentsResult] = await Promise.all([
      fetchJson<{ numbers?: PhoneNumber[] }>("/api/numbers", t),
      fetchJson<{ agents?: Agent[] }>("/api/agents", t),
    ]);
    if (numbersResult.ok) {
      setNumbers(numbersResult.data.numbers ?? []);
      setError(null);
    } else {
      setError(numbersResult.error);
    }
    if (agentsResult.ok) setAgents(agentsResult.data.agents ?? []);
  }, [t]);

  useEffect(() => {
    void load().finally(() => setIsLoading(false));
  }, [load]);

  const agentName = useCallback(
    (id: string | null) =>
      id ? (agents.find((a) => a.id === id)?.name ?? t("numbers.holderDeleted")) : null,
    [agents, t],
  );

  /** Agents holding more than one line. Should be empty — the store refuses
   *  the second assignment — but a directory imported or edited before that
   *  rule existed can still contain one, and silently rendering it as normal
   *  would hide exactly the problem this page is for. */
  const doubleBooked = useMemo(() => {
    const counts = new Map<string, number>();
    for (const number of numbers) {
      if (!number.agentId) continue;
      counts.set(number.agentId, (counts.get(number.agentId) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id));
  }, [numbers]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return numbers;
    return numbers.filter(
      (number) =>
        number.e164.toLowerCase().includes(needle) ||
        number.label.toLowerCase().includes(needle) ||
        (agentName(number.agentId) ?? "").toLowerCase().includes(needle),
    );
  }, [numbers, search, agentName]);

  const assignedCount = numbers.filter((number) => number.agentId).length;
  const unassignedCount = numbers.length - assignedCount;

  const save = useCallback(
    async (draft: NumberDraft): Promise<boolean> => {
      setSaving(true);
      const body = editing ? { id: editing.id, ...draft } : draft;
      const result = await fetchJson<{ number?: PhoneNumber }>("/api/numbers", t, {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaving(false);
      if (!result.ok) {
        toast({ title: uiErrorMessage(t, result.error), status: "error" });
        return false;
      }
      await load();
      toast({ title: editing ? t("numbers.updated") : t("numbers.created"), status: "success" });
      return true;
    },
    [editing, load, t, toast],
  );

  const assign = useCallback(
    async (number: PhoneNumber, agentId: string | null) => {
      const result = await fetchJson<{ number?: PhoneNumber }>("/api/numbers", t, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: number.id, assign: true, agentId }),
      });
      if (!result.ok) {
        // The refusal names the other agent, which is the whole point — a
        // generic "conflict" would send somebody hunting through the list.
        toast({ title: uiErrorMessage(t, result.error), status: "error" });
        return;
      }
      await load();
    },
    [load, t, toast],
  );

  const remove = useCallback(
    async (number: PhoneNumber) => {
      const ok = await confirm({
        title: t("numbers.deleteConfirm", { label: number.label }),
        description: t("numbers.deleteConfirmBody", { e164: formatE164(number.e164) }),
        confirmLabel: t("common.delete"),
      });
      if (!ok) return;
      const result = await fetchJson(`/api/numbers?id=${encodeURIComponent(number.id)}`, t, {
        method: "DELETE",
      });
      if (result.ok) {
        await load();
        toast({ title: t("common.deleted") });
      } else {
        toast({ title: uiErrorMessage(t, result.error), status: "error" });
      }
    },
    [confirm, load, t, toast],
  );

  if (isLoading) {
    return (
      <PageContainer maxWidth="max-w-6xl" pattern="grid">
        <NumbersSkeleton />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      <div className="content-enter">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">{t("numbers.title")}</h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {t("numbers.subtitle")}
            </p>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
            {t("numbers.add")}
          </Button>
        </header>

        {error ? <ErrorBanner error={error} onRetry={() => void load()} /> : null}

        {numbers.length > 0 ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <KpiCard
              icon={SmartPhone01Icon}
              label={t("numbers.kpiTotal")}
              value={numbers.length}
              sub={t("numbers.kpiTotalSub")}
            />
            <KpiCard
              icon={CheckmarkCircle02Icon}
              label={t("numbers.kpiAssigned")}
              value={assignedCount}
              sub={t(assignedCount > 0 ? "numbers.kpiAssignedSub" : "numbers.kpiAssignedSubNone")}
            />
            <KpiCard
              icon={AlertCircleIcon}
              label={t("numbers.kpiFree")}
              value={unassignedCount}
              sub={t(unassignedCount > 0 ? "numbers.kpiFreeSub" : "numbers.kpiFreeSubNone")}
            />
          </div>
        ) : null}

        {numbers.length > 0 ? (
          <div className="mb-6">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("numbers.search")}
            />
          </div>
        ) : null}

        {numbers.length === 0 ? (
          <Card className="p-10 text-center">
            <HugeiconsIcon
              icon={SmartPhone01Icon}
              size={28}
              strokeWidth={1.5}
              className="mx-auto mb-3 text-muted-foreground"
            />
            <p className="text-sm font-medium text-foreground">{t("numbers.empty")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              {t("numbers.emptyHint")}
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              {t("numbers.addFirst")}
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((number) => {
              const holder = agentName(number.agentId);
              const crossed = number.agentId ? doubleBooked.has(number.agentId) : false;
              return (
                <Card key={number.id} className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-sm text-foreground">
                          {formatE164(number.e164)}
                        </span>
                        <span className="text-sm text-muted-foreground">{number.label}</span>
                        {number.status === "inactive" ? (
                          <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {t("numbers.inactive")}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {number.capabilities.map((capability) => (
                          <span
                            key={capability}
                            className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {CAPABILITY_LABEL[capability]
                              ? t(CAPABILITY_LABEL[capability])
                              : capability}
                          </span>
                        ))}
                        <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {PROVIDER_LABEL[number.provider]
                            ? t(PROVIDER_LABEL[number.provider])
                            : number.provider}
                        </span>
                      </div>
                      {crossed ? (
                        <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--status-failed-fg)]">
                          <HugeiconsIcon icon={AlertCircleIcon} size={12} strokeWidth={2} />
                          {t("numbers.crossed", { agent: holder ?? "" })}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                      <Select
                        value={number.agentId ?? "none"}
                        onValueChange={(value) =>
                          void assign(number, value === "none" ? null : value)
                        }
                      >
                        <SelectTrigger
                          className={cn(
                            "h-8 w-full text-xs sm:w-44",
                            !number.agentId && "text-muted-foreground",
                          )}
                        >
                          <SelectValue placeholder={t("numbers.unassigned")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("numbers.unassigned")}</SelectItem>
                          {agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("numbers.dialogEditTitle")}
                        onClick={() => {
                          setEditing(number);
                          setDialogOpen(true);
                        }}
                      >
                        <HugeiconsIcon icon={PencilEdit01Icon} size={15} strokeWidth={1.75} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("common.delete")}
                        onClick={() => void remove(number)}
                      >
                        <HugeiconsIcon icon={Delete01Icon} size={15} strokeWidth={1.75} />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
            {filtered.length === 0 ? (
              <Card className="p-12 text-center text-sm text-muted-foreground">
                {t("numbers.noResults")} “{search}”.
              </Card>
            ) : null}
          </div>
        )}
      </div>

      {/* Remounted per target: without the key the dialog keeps the previous
          number's state and shows stale fields on the next open. */}
      <NumberDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        agents={agents}
        onSave={save}
        saving={saving}
      />
      {confirmDialog}
    </PageContainer>
  );
}
