"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Timer01Icon,
  Delete01Icon,
  SearchIcon,
  Clock01Icon,
  CheckIcon,
  CancelCircleIcon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator } from "../../_components/dashboard-card";
import { KpiBars, KpiCard } from "../../_components/kpi-card";
import { StatusBadge, type StatusVariant } from "../../_components/channel-badge";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useI18n } from "@/lib/i18n/provider";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useSound } from "@/components/sound-provider";
import { fullTime, relativeTime, timeUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Reminder, ReminderStatus } from "@/lib/types";

/** Reminder status → the shared badge vocabulary the rest of the app uses. */
const STATUS_VARIANT: Record<ReminderStatus, StatusVariant> = {
  pending: "pending",
  sent: "success",
  cancelled: "expired",
};

const STATUS_LABEL: Record<ReminderStatus, string> = {
  // Singular: this one labels a single reminder, not the section of them.
  pending: "reminders.statusPending",
  sent: "reminders.sent",
  cancelled: "reminders.cancelled",
};

export default function RemindersPage() {
  const { t } = useI18n();
  const { cue } = useSound();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<UiError | null>(null);

  const fetchReminders = useCallback(async () => {
    const result = await fetchJson<{ reminders?: Reminder[] }>("/api/reminders", t);
    if (result.ok) {
      setReminders(result.data.reminders ?? []);
      setError(null);
    } else {
      // A list that silently stays empty on a failed load reads as "you have
      // no reminders", which is the wrong thing to believe.
      setError(result.error);
    }
    setIsLoading(false);
  }, [t]);

  useEffect(() => {
    void fetchReminders();
  }, [fetchReminders]);

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: t("reminders.confirmDelete") }))) return;
    // `droplet` glides down and away — a deletion is a dismissal, not a win.
    cue("droplet");
    // Optimistic: the row exits immediately and comes back if the server
    // refuses, rather than the list sitting still until the round trip lands.
    const previous = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== id));
    const result = await fetchJson(`/api/reminders?id=${encodeURIComponent(id)}`, t, {
      method: "DELETE",
    });
    if (!result.ok) {
      setReminders(previous);
      setError(result.error);
      toast({ title: t("common.somethingWentWrong"), description: t("common.somethingWentWrongDescription"), status: "error" });
    } else {
      toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
    }
  };

  const counts = useMemo(
    () => ({
      pending: reminders.filter((r) => r.status === "pending").length,
      sent: reminders.filter((r) => r.status === "sent").length,
      cancelled: reminders.filter((r) => r.status === "cancelled").length,
    }),
    [reminders],
  );

  /** One status's share of every reminder, for the meter on its tile. */
  const share = (count: number) => (reminders.length > 0 ? count / reminders.length : 0);

  const matches = useCallback(
    (list: Reminder[]) => {
      const q = search.trim().toLowerCase();
      if (!q) return list;
      return list.filter((r) => r.message.toLowerCase().includes(q));
    },
    [search],
  );

  // Pending first and soonest-first — the list is a queue, so the next thing
  // to happen belongs at the top. History runs newest-first instead.
  const pending = useMemo(
    () =>
      matches(reminders.filter((r) => r.status === "pending")).sort(
        (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
      ),
    [reminders, matches],
  );
  const history = useMemo(
    () =>
      matches(reminders.filter((r) => r.status !== "pending")).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [reminders, matches],
  );

  const searching = search.trim().length > 0;
  const noMatches = searching && pending.length === 0 && history.length === 0;

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      {confirmDialog}
      <Skeleton
        className="min-h-[500px]"
        isLoading={isLoading}
        skeleton={<RemindersSkeleton />}
      >
        <div className="content-enter">
          <ErrorBanner
            className="mb-6"
            error={error}
            onRetry={() => void fetchReminders()}
            onDismiss={() => setError(null)}
          />

          <header className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t("reminders.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("reminders.subtitle")}
              </p>
            </div>
            {reminders.length > 0 ? (
              <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] sm:inline-flex">
                <HugeiconsIcon
                  icon={Clock01Icon}
                  size={16}
                  strokeWidth={1.75}
                  className="text-muted-foreground"
                />
                <span>
                  <span className="tabular-nums">{counts.pending}</span>{" "}
                  {t("reminders.pending").toLowerCase()}
                </span>
              </div>
            ) : null}
          </header>

          {reminders.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={Timer01Icon} size={20} strokeWidth={1.75} />
                </div>
                <p className="text-sm font-medium">{t("reminders.emptyTitle")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {t("reminders.emptyDescription")}
                </p>
              </div>
            </Card>
          ) : (
            <>
              {/* Stats bar */}
              <div className="mb-6 grid grid-cols-3 gap-4">
                {/* Each second line says what happens next to that pile,
                    which is what someone reading a reminder count wants to
                    know — not a repeat of the status word above it. */}
                <KpiCard
                  icon={Clock01Icon}
                  label={t("reminders.pending")}
                  sub={t(counts.pending > 0 ? "reminders.pendingSub" : "reminders.pendingSubNone")}
                  value={counts.pending}
                  visual={<KpiBars ratio={share(counts.pending)} tone="warning" />}
                />
                <KpiCard
                  icon={CheckIcon}
                  label={t("reminders.sentCount")}
                  sub={t(counts.sent > 0 ? "reminders.sentSub" : "reminders.sentSubNone")}
                  value={counts.sent}
                  visual={<KpiBars ratio={share(counts.sent)} tone="positive" />}
                />
                <KpiCard
                  icon={CancelCircleIcon}
                  label={t("reminders.cancelledCount")}
                  sub={t(counts.cancelled > 0 ? "reminders.cancelledSub" : "reminders.cancelledSubNone")}
                  value={counts.cancelled}
                  visual={<KpiBars ratio={share(counts.cancelled)} />}
                />
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <HugeiconsIcon
                  icon={SearchIcon}
                  size={16}
                  strokeWidth={1.75}
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label={t("reminders.searchPlaceholder")}
                  placeholder={t("reminders.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {noMatches ? (
                <Card>
                  <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                      <HugeiconsIcon icon={SearchIcon} size={20} strokeWidth={1.75} />
                    </div>
                    <p className="text-sm font-medium">{t("reminders.noResults")}</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      {t("reminders.noResultsHint")}
                    </p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-6">
                  <ReminderSection
                    title={t("reminders.pending")}
                    count={pending.length}
                    items={pending}
                    reduce={reduce}
                    onDelete={handleDelete}
                  />
                  <ReminderSection
                    title={t("reminders.history")}
                    count={history.length}
                    items={history}
                    reduce={reduce}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Skeleton>
    </PageContainer>
  );
}

/** One titled group of reminder rows. Renders nothing when empty, so a page
 *  with no history doesn't carry a lone heading over blank space. */
function ReminderSection({
  title,
  count,
  items,
  reduce,
  onDelete,
}: {
  readonly title: string;
  readonly count: number;
  readonly items: readonly Reminder[];
  readonly reduce: boolean | null;
  readonly onDelete?: (id: string) => void;
}) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {title}
        <span className="tabular-nums text-muted-foreground/60">{count}</span>
      </h2>
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {items.map((reminder) => (
            <motion.div
              key={reminder.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -16 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              layout
            >
              <ReminderRow reminder={reminder} onDelete={onDelete} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

/** A reminder, in the same card anatomy the automations list uses: an inset
 *  icon tile, title + description, a status badge, and the row's actions. */
function ReminderRow({
  reminder,
  onDelete,
}: {
  readonly reminder: Reminder;
  readonly onDelete?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const done = reminder.status !== "pending";

  return (
    <Card>
      <CardHeader>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl shadow-[var(--shadow-inset)]",
            done ? "bg-muted text-muted-foreground" : "bg-accent text-foreground",
          )}
        >
          <HugeiconsIcon icon={Timer01Icon} size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className={cn("truncate", done && "text-muted-foreground")}>
              {reminder.message}
            </CardTitle>
            <StatusBadge
              status={STATUS_VARIANT[reminder.status]}
              label={t(STATUS_LABEL[reminder.status])}
            />
          </div>
          <CardDescription>
            {t("reminders.scheduledFor")} {fullTime(reminder.datetime, locale)}
          </CardDescription>
        </div>
        {onDelete ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => void onDelete(reminder.id)}
                aria-label={t("reminders.delete")}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
              >
                <HugeiconsIcon icon={Delete01Icon} size={16} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("reminders.delete")}</TooltipContent>
          </Tooltip>
        ) : null}
      </CardHeader>

      <CardSeparator />

      <div className="flex flex-wrap items-center gap-4 px-5 py-3 text-xs text-muted-foreground">
        {/* A pending reminder is in the future, so it counts down. A closed
            one has its outcome in the badge already — repeating it here would
            just be the same word twice on one card. */}
        {done ? null : (
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.75} />
            {timeUntil(reminder.datetime, locale)}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          {t("reminders.created")} · {relativeTime(reminder.created_at, locale)}
        </span>
      </div>
    </Card>
  );
}

function RemindersSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <div className="space-y-3 p-5">
              <SkeletonBar className="h-3" width="45%" />
              <SkeletonBar className="h-6" width="30%" />
            </div>
          </Card>
        ))}
      </div>
      <SkeletonBar className="h-9 w-full rounded-lg" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <div className="flex items-center gap-3 px-5 pt-5 pb-4">
              <SkeletonBar className="size-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBar className="h-3.5" width="45%" />
                <SkeletonBar className="h-3" width="30%" />
              </div>
            </div>
            <CardSeparator />
            <div className="px-5 py-3">
              <SkeletonBar className="h-3" width="35%" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
