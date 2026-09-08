"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  ChartHistogramIcon,
  Clock01Icon,
  Delete01Icon,
  MoneyBag02Icon,
  PanelLeftIcon,
} from "@hugeicons/core-free-icons";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { RankedBars } from "../../_components/chart";
import { DealDialog } from "./_components/deal-dialog";
import { useEdgeFade } from "./_components/use-edge-fade";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import {
  DEAL_STAGES,
  OPEN_STAGES,
  STAGE_PROBABILITY,
  averageWonValue,
  byStage,
  formatMoney,
  isOverdue,
  isStale,
  pipelineTotals,
  winRate,
  wonBySource,
  type CurrencyTotals,
} from "@/lib/deals";
import { useI18n } from "@/lib/i18n/provider";
import { timeUntil } from "@/lib/format";
import type { Contact, Deal, DealStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DockReopenButton } from "@/app/_components/dock-reopen-button";
import { StatusBadge } from "@/components/ui/status-badge";

/**
 * The sales pipeline.
 *
 * Built on the workspace shell the email, automation and form screens use: a
 * toolbar across the top, the work filling the middle, and a resizable dock on
 * the right holding what you read rather than what you move.
 *
 * It did not start there. The first version was a scrolling page with eight
 * summary tiles stacked above the board, so the deals — the only thing anyone
 * opens this screen to touch — began below the fold, and the page scrolled
 * vertically while the board scrolled sideways underneath it. The numbers are
 * in the dock now and the board owns the whole middle: two axes became one,
 * and nothing you came here for is behind a scroll.
 */

const DOCK_MIN = 300;
const DOCK_MAX = 480;
const DOCK_WIDTH_KEY = "steve:pipeline-dock-width";
const DOCK_OPEN_KEY = "steve:pipeline-dock-open";

type DockTab = "summary" | "analysis";

/** A card moving between columns is unmounted from one list and mounted in
 *  another, so `layout` alone has nothing to interpolate — `layoutId` is what
 *  makes motion treat the two as the same card and slide it across. Shared
 *  with the form builder's rail so the two boards settle the same way. */
const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;

/** Ink density rather than hue, matching the CRM board: a stage is read by how
 *  filled its marker is, not by a colour that would make this look like a
 *  different product. Won and lost are the exception — those two are the only
 *  places in the pipeline where a colour carries meaning. */
const STAGE_DOT: Record<DealStage, string> = {
  lead: "bg-foreground/20",
  qualified: "bg-foreground/35",
  meeting: "bg-foreground/50",
  proposal: "bg-foreground/65",
  negotiation: "bg-foreground/80",
  won: "bg-[var(--status-success-fg)]",
  lost: "bg-destructive/60",
};

export default function PipelinePage() {
  const { locale, t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const reduced = useReducedMotion();
  const board = useEdgeFade<HTMLDivElement>();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Part of the dialog's key: `editing?.id ?? "new"` is constant for every
   *  new deal, so the second one opened would still hold the first's title. */
  const [dialogNonce, setDialogNonce] = useState(0);

  const [dockOpen, setDockOpen] = useState(true);
  const [dockWidth, setDockWidth] = useState(340);
  const [dockTab, setDockTab] = useState<DockTab>("summary");
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const load = useCallback(async () => {
    const [dealResult, contactResult] = await Promise.all([
      fetchJson<{ deals: Deal[] }>("/api/deals", t),
      fetchJson<{ contacts: Contact[] }>("/api/contacts", t),
    ]);
    setIsLoading(false);
    if (!dealResult.ok) {
      setError(dealResult.error);
      return;
    }
    setError(null);
    setDeals(dealResult.data.deals);
    if (contactResult.ok) setContacts(contactResult.data.contacts ?? []);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Dock geometry ────────────────────────────────────────────────

  useEffect(() => {
    try {
      const width = Number(localStorage.getItem(DOCK_WIDTH_KEY));
      if (Number.isFinite(width) && width >= DOCK_MIN) setDockWidth(Math.min(width, DOCK_MAX));
      if (localStorage.getItem(DOCK_OPEN_KEY) === "0") setDockOpen(false);
    } catch {
      // Private mode, blocked storage — the defaults are fine.
    }
  }, []);

  const setDockOpenPersisted = useCallback((open: boolean) => {
    setDockOpen(open);
    try {
      localStorage.setItem(DOCK_OPEN_KEY, open ? "1" : "0");
    } catch {
      // Best-effort.
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const move = (event: PointerEvent) => {
      const start = resizeRef.current;
      if (!start) return;
      // Dragging left widens: the handle is on the dock's left edge.
      const next = start.startWidth - (event.clientX - start.startX);
      setDockWidth(Math.min(DOCK_MAX, Math.max(DOCK_MIN, next)));
    };
    const stop = () => {
      setIsResizing(false);
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(DOCK_WIDTH_KEY, String(dockWidth));
      } catch {
        // Best-effort.
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [isResizing, dockWidth]);

  // The board's usable width changes when the dock does, and the edge fade is
  // a function of that width.
  useEffect(() => {
    const timer = setTimeout(board.remeasure, 260);
    return () => clearTimeout(timer);
  }, [dockOpen, dockWidth, board.remeasure]);

  // ── Derived ──────────────────────────────────────────────────────

  /** One `now` per render rather than one per card: `isStale` called in a loop
   *  against a fresh `Date` each time can put two cards on opposite sides of a
   *  boundary within the same paint. */
  const now = useMemo(() => new Date(), [deals]);
  const groups = useMemo(() => byStage(deals), [deals]);
  const totals = useMemo(() => pipelineTotals(deals), [deals]);
  const contactName = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.name])),
    [contacts],
  );
  const byCurrency = useMemo(() => {
    const rows = new Map<string, Deal[]>();
    for (const deal of deals) {
      const code = deal.currency || "USD";
      rows.set(code, [...(rows.get(code) ?? []), deal]);
    }
    return rows;
  }, [deals]);
  /** The analysis cards plot one currency — mixing them into a single ranking
   *  would compare an amount in pesos against one in dollars. `pipelineTotals`
   *  already leads with the currency carrying the most. */
  const lead = totals[0];

  const attention = useMemo(
    () => deals.filter((deal) => isOverdue(deal, now) || isStale(deal, now)).length,
    [deals, now],
  );

  // ── Actions ──────────────────────────────────────────────────────

  const move = async (deal: Deal, direction: -1 | 1) => {
    const from = DEAL_STAGES.indexOf(deal.stage);
    const next = DEAL_STAGES[from + direction];
    if (!next) return;
    // Optimistic: the card is under the pointer and should move with it. The
    // reload below is what makes it honest again if the write failed.
    setDeals((current) =>
      current.map((item) => (item.id === deal.id ? { ...item, stage: next } : item)),
    );
    const result = await fetchJson<{ deal: Deal }>(`/api/deals/${deal.id}`, t, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: next }),
    });
    if (!result.ok) {
      setError(result.error);
      void load();
      return;
    }
    setDeals((current) => current.map((item) => (item.id === deal.id ? result.data.deal : item)));
  };

  const remove = async (deal: Deal) => {
    if (!(await confirm({ title: t("pipeline.confirmDelete") }))) return;
    const result = await fetchJson(`/api/deals/${deal.id}`, t, { method: "DELETE" });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDeals((current) => current.filter((item) => item.id !== deal.id));
  };

  const openDialog = (deal: Deal | null) => {
    setEditing(deal);
    setDialogNonce((n) => n + 1);
    setDialogOpen(true);
  };

  return (
    <div className="content-enter flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={MoneyBag02Icon} size={15} strokeWidth={1.75} />
          </div>

          <h1 className="shrink-0 text-sm font-semibold tracking-tight">{t("pipeline.title")}</h1>

          {/* The two numbers worth carrying in the chrome. The rest live in
              the dock — eight tiles above the board pushed the deals under
              the fold, which is the wrong thing to have to scroll for. */}
          {lead ? (
            <div className="hidden min-w-0 items-center gap-4 border-l border-border pl-3 lg:flex">
              <HeaderStat
                label={t("pipeline.kpi.open")}
                value={formatMoney(lead.open, lead.currency, locale)}
              />
              <HeaderStat
                label={t("pipeline.kpi.forecast")}
                value={formatMoney(lead.forecast, lead.currency, locale)}
              />
              {attention > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setDockTab("summary");
                    setDockOpenPersisted(true);
                  }}
                  // The badge itself is the shared one; the button only adds
                  // the click and the focus ring. A hand-rolled pill here was
                  // the same amber at a radius no other badge uses.
                  className="rounded-lg focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)]"
                >
                  <StatusBadge
                    status="warning"
                    label={t("pipeline.needAttention", { count: attention })}
                  />
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => openDialog(null)} disabled={contacts.length === 0}>
              <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.75} />
              <span className="hidden sm:inline">{t("pipeline.new")}</span>
            </Button>

            <span className="mx-0.5 h-5 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setDockOpenPersisted(!dockOpen)}
                  aria-label={t("pipeline.summary")}
                  aria-pressed={dockOpen}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition-colors duration-150",
                    dockOpen
                      ? "bg-muted text-foreground shadow-[var(--shadow-inset)]"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <HugeiconsIcon
                    icon={PanelLeftIcon}
                    size={16}
                    strokeWidth={1.75}
                    className="rotate-180"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("pipeline.summary")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {error ? (
          <ErrorBanner
            className="rounded-none border-x-0 border-t shadow-none"
            error={error}
            onDismiss={() => setError(null)}
          />
        ) : null}
      </header>

      <div
        className="relative flex min-h-0 flex-1"
        style={{ ["--dock-max" as string]: `${DOCK_MAX}px` }}
      >
        <div className="relative min-w-0 flex-1">
          <Skeleton className="h-full" isLoading={isLoading} skeleton={<BoardSkeleton />}>
            {deals.length === 0 ? (
              <EmptyBoard
                hasContacts={contacts.length > 0}
                onCreate={() => openDialog(null)}
              />
            ) : (
              // One scroller, one axis. Each column keeps its own vertical
              // scroll, so the page itself never moves and a long column
              // cannot push the board's header off the screen.
              <div
                ref={board.ref}
                style={board.style}
                className="x-fade h-full overflow-x-auto overflow-y-hidden scrollbar-hide"
              >
                <LayoutGroup>
                  <div className="flex h-full min-w-max gap-3 px-4 py-4">
                    {DEAL_STAGES.map((stage) => (
                      <StageColumn
                        key={stage}
                        stage={stage}
                        deals={groups[stage]}
                        locale={locale}
                        reduced={Boolean(reduced)}
                        now={now}
                        contactName={contactName}
                        onMove={move}
                        onEdit={openDialog}
                        onRemove={remove}
                      />
                    ))}
                  </div>
                </LayoutGroup>
              </div>
            )}
          </Skeleton>

          {!dockOpen && deals.length > 0 ? (
            <DockReopenButton
              icon={ChartHistogramIcon}
              label={t("pipeline.summary")}
              onClick={() => setDockOpenPersisted(true)}
            />
          ) : null}
        </div>

        {/* Resizer */}
        <div
          onPointerDown={(event) => {
            resizeRef.current = { startX: event.clientX, startWidth: dockWidth };
            setIsResizing(true);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          className={cn(
            "group relative z-20 w-3 shrink-0 -translate-x-1.5 cursor-col-resize touch-none",
            dockOpen ? "hidden lg:block" : "hidden",
          )}
          role="separator"
          aria-orientation="vertical"
          aria-label={t("forms.builder.resizeDock")}
        >
          <span
            className={cn(
              "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/[0.08]",
              "transition-[background-color] duration-200 ease-out",
              isResizing ? "bg-foreground/50" : "group-hover:bg-foreground/30",
            )}
          />
          <span
            className={cn(
              "absolute top-1/2 left-1/2 flex h-9 w-[5px] -translate-x-1/2 -translate-y-1/2",
              "rounded-full bg-foreground/60 shadow-[var(--shadow-soft)]",
              "origin-center transition-transform duration-200 ease-out",
              isResizing ? "scale-100" : "scale-0 group-hover:scale-100",
            )}
          />
        </div>

        {/* Dock */}
        <aside
          aria-hidden={!dockOpen}
          inert={!dockOpen}
          style={{
            width: dockOpen ? dockWidth : 0,
            transition: isResizing ? "none" : "width var(--panel-open-dur) var(--panel-ease)",
          }}
          className={cn(
            "flex min-h-0 flex-col overflow-hidden bg-card",
            "absolute inset-y-0 right-0 z-30 max-w-[min(100%,var(--dock-max))] shadow-[var(--shadow-float)]",
            "lg:static lg:z-auto lg:shrink-0 lg:shadow-none",
            dockOpen ? "border-l border-border lg:border-l-0" : "border-l-0 shadow-none",
          )}
        >
          <div
            className="t-panel-slide flex h-full min-h-0 flex-col"
            data-open={dockOpen}
            style={
              {
                width: dockWidth,
                "--panel-translate-x": "28px",
                "--panel-translate-y": "0px",
              } as CSSProperties
            }
          >
            <div className="shrink-0 p-3 pb-2">
              <SlidingTabs
                value={dockTab}
                onValueChange={(next) => setDockTab(next as DockTab)}
                tabs={[
                  { id: "summary", label: t("pipeline.summary") },
                  { id: "analysis", label: t("pipeline.analysis") },
                ]}
              />
            </div>

            <div className="min-h-0 flex-1">
              <div
                className={cn(
                  "h-full overflow-y-auto scrollbar-hide px-3 pb-6",
                  dockTab === "summary" ? "block" : "hidden",
                )}
              >
                {totals.map((row) => (
                  <CurrencySummary
                    key={row.currency}
                    row={row}
                    deals={byCurrency.get(row.currency) ?? []}
                    showCode={totals.length > 1}
                    locale={locale}
                  />
                ))}
              </div>

              <div
                className={cn(
                  "h-full overflow-y-auto scrollbar-hide px-3 pb-6",
                  dockTab === "analysis" ? "block" : "hidden",
                )}
              >
                {lead ? (
                  <>
                    <DockSection label={t("pipeline.shape.title")} hint={t("pipeline.shape.description")}>
                      <RankedBars
                        bars={OPEN_STAGES.map((stage) => {
                          const value = groups[stage]
                            .filter((deal) => deal.currency === lead.currency)
                            .reduce((sum, deal) => sum + deal.value, 0);
                          return {
                            key: stage,
                            label: t(`pipeline.stage.${stage}`),
                            value,
                            formatted: formatMoney(value, lead.currency, locale),
                          };
                        })}
                        emptyLabel={t("pipeline.shape.empty")}
                        limit={OPEN_STAGES.length}
                      />
                    </DockSection>

                    <DockSection
                      label={t("pipeline.sources.title")}
                      hint={t("pipeline.sources.description")}
                    >
                      <RankedBars
                        bars={wonBySource(deals, lead.currency).map((row) => ({
                          key: row.source,
                          label: row.source,
                          value: row.value,
                          formatted: formatMoney(row.value, lead.currency, locale),
                          tone: "positive" as const,
                        }))}
                        emptyLabel={t("pipeline.sources.empty")}
                      />
                    </DockSection>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DealDialog
          key={`${editing?.id ?? "new"}-${dialogNonce}`}
          editing={editing}
          contacts={contacts}
          deals={deals}
          onClose={() => setDialogOpen(false)}
          onSaved={(deal) =>
            setDeals((current) =>
              current.some((item) => item.id === deal.id)
                ? current.map((item) => (item.id === deal.id ? deal : item))
                : [deal, ...current],
            )
          }
        />
      </Dialog>
      {confirmDialog}
    </div>
  );
}

// ── Chrome ─────────────────────────────────────────────────────────

function HeaderStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-[13px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function DockSection({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/60 py-4 last:border-0">
      <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Every figure in this block is about one currency, win rate included —
 *  reading a USD card's rate off ARS deals is a number from somebody else's
 *  pipeline. */
function CurrencySummary({
  row,
  deals,
  showCode,
  locale,
}: {
  readonly row: CurrencyTotals;
  readonly deals: readonly Deal[];
  readonly showCode: boolean;
  readonly locale: "es" | "en";
}) {
  const { t } = useI18n();
  const rate = winRate(deals);
  const ticket = averageWonValue(deals, row.currency);

  return (
    <section className="border-b border-border/60 py-4 last:border-0">
      {showCode ? (
        <div className="mb-2.5 flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {row.currency}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={t("pipeline.kpi.open")}
          value={formatMoney(row.open, row.currency, locale)}
          hint={t("pipeline.kpi.openHint", { count: row.openCount })}
        />
        <Stat
          label={t("pipeline.kpi.forecast")}
          value={formatMoney(row.forecast, row.currency, locale)}
          hint={t("pipeline.kpi.forecastHint")}
        />
        <Stat
          label={t("pipeline.kpi.won")}
          value={formatMoney(row.won, row.currency, locale)}
          hint={t("pipeline.kpi.wonHint", { count: row.wonCount })}
        />
        <Stat
          label={t("pipeline.kpi.winRate")}
          value={rate === undefined ? "—" : `${Math.round(rate * 100)}%`}
          hint={
            ticket === undefined
              ? t("pipeline.kpi.winRateHint")
              : t("pipeline.kpi.avgTicket", {
                  value: formatMoney(ticket, row.currency, locale),
                })
          }
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 p-2.5">
      <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

// ── Board ──────────────────────────────────────────────────────────

function StageColumn({
  stage,
  deals,
  locale,
  reduced,
  now,
  contactName,
  onMove,
  onEdit,
  onRemove,
}: {
  readonly stage: DealStage;
  readonly deals: readonly Deal[];
  readonly locale: "es" | "en";
  readonly reduced: boolean;
  readonly now: Date;
  readonly contactName: ReadonlyMap<string, string>;
  readonly onMove: (deal: Deal, direction: -1 | 1) => void;
  readonly onEdit: (deal: Deal) => void;
  readonly onRemove: (deal: Deal) => void;
}) {
  const { t } = useI18n();
  // Every deal in a column shares a stage, so the column total is only
  // meaningful per currency — the same reason the dock's summary is a list.
  const totals = pipelineTotals(deals);

  return (
    <section
      aria-label={t(`pipeline.stage.${stage}`)}
      className="flex h-full w-[17.5rem] shrink-0 flex-col rounded-2xl border border-border bg-card shadow-[var(--shadow-soft),var(--shadow-inset)]"
    >
      <header className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STAGE_DOT[stage])} />
          <span className="text-xs font-medium">{t(`pipeline.stage.${stage}`)}</span>
          <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
            {deals.length}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-2 pl-4">
          {totals.length > 0 ? (
            <span className="truncate text-[11px] tabular-nums text-muted-foreground">
              {totals
                .map((row) =>
                  formatMoney(
                    stage === "won" ? row.won : stage === "lost" ? row.lost : row.open,
                    row.currency,
                    locale,
                  ),
                )
                .join(" · ")}
            </span>
          ) : null}
          {OPEN_STAGES.includes(stage) ? (
            <span className="ml-auto shrink-0 font-mono text-[9px] tracking-[0.1em] text-muted-foreground tabular-nums">
              {Math.round(STAGE_PROBABILITY[stage] * 100)}%
            </span>
          ) : null}
        </div>
      </header>

      {/* The column scrolls, not the page. A stage with twenty deals stays a
          column instead of stretching the board to twenty cards tall and
          taking every other stage's header off screen with it. */}
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-hide px-2.5 pb-2.5">
        {deals.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border/70 px-3 py-5 text-center text-[11px] text-muted-foreground">
            {t("pipeline.stageEmpty")}
          </li>
        ) : null}
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            locale={locale}
            reduced={reduced}
            now={now}
            contactName={contactName.get(deal.contactId)}
            onMove={onMove}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </section>
  );
}

function DealCard({
  deal,
  locale,
  reduced,
  now,
  contactName,
  onMove,
  onEdit,
  onRemove,
}: {
  readonly deal: Deal;
  readonly locale: "es" | "en";
  readonly reduced: boolean;
  readonly now: Date;
  readonly contactName?: string;
  readonly onMove: (deal: Deal, direction: -1 | 1) => void;
  readonly onEdit: (deal: Deal) => void;
  readonly onRemove: (deal: Deal) => void;
}) {
  const { t } = useI18n();
  const index = DEAL_STAGES.indexOf(deal.stage);
  const stale = isStale(deal, now);
  const overdue = isOverdue(deal, now);

  return (
    <motion.li
      layout
      layoutId={deal.id}
      transition={reduced ? { duration: 0 } : SPRING}
      className="group relative rounded-xl border border-border/60 transition-[border-color,background-color] duration-150 hover:border-input hover:bg-accent/40"
    >
      <button
        type="button"
        onClick={() => onEdit(deal)}
        className="block w-full rounded-xl px-3 pt-2.5 pb-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{deal.title}</span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums">
            {formatMoney(deal.value, deal.currency, locale)}
          </span>
        </span>
        {contactName ? (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {contactName}
          </span>
        ) : null}

        {/* The two things that make a pipeline worth opening: what has gone
            quiet, and what is past the date it was meant to close. */}
        {overdue || stale || deal.expectedCloseAt ? (
          <span className="mt-2 flex flex-wrap items-center gap-1">
            {overdue ? (
              <Flag icon={AlertCircleIcon} tone="warn" label={t("pipeline.flag.overdue")} />
            ) : null}
            {stale ? (
              <Flag icon={Clock01Icon} tone="muted" label={t("pipeline.flag.stale")} />
            ) : null}
            {deal.expectedCloseAt && !overdue ? (
              // `timeUntil`, not `relativeTime`: the latter measures backwards
              // from now and answers "ahora" for every future date.
              <span className="text-[10px] text-muted-foreground">
                {t("pipeline.closesIn", { when: timeUntil(deal.expectedCloseAt, locale) })}
              </span>
            ) : null}
          </span>
        ) : null}

        {deal.stage === "lost" && deal.lostReason ? (
          <span
            className="mt-1.5 block truncate text-[10px] text-muted-foreground"
            title={deal.lostReason}
          >
            {deal.lostReason}
          </span>
        ) : null}
      </button>

      {/* Controls on hover and on keyboard focus. They used to sit on every
          card at rest, which put three grey glyphs under every deal on the
          board and made a column of four look like a toolbar. */}
      <div
        className={cn(
          "absolute right-1.5 bottom-1.5 flex items-center gap-0.5 rounded-md bg-card/90 backdrop-blur-sm",
          "opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <CardAction
          icon={ArrowLeft02Icon}
          label={t("pipeline.moveBack")}
          disabled={index <= 0}
          onClick={() => onMove(deal, -1)}
        />
        <CardAction
          icon={ArrowRight02Icon}
          label={t("pipeline.moveForward")}
          disabled={index >= DEAL_STAGES.length - 1}
          onClick={() => onMove(deal, 1)}
        />
        <CardAction
          icon={Delete01Icon}
          label={t("pipeline.delete")}
          destructive
          onClick={() => onRemove(deal)}
        />
      </div>
    </motion.li>
  );
}

function Flag({
  icon,
  label,
  tone,
}: {
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  readonly label: string;
  readonly tone: "warn" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]",
        tone === "warn"
          ? "bg-[var(--status-review-bg)] text-[var(--status-review-fg)]"
          : "bg-muted text-muted-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} size={10} strokeWidth={1.75} />
      {label}
    </span>
  );
}

function CardAction({
  icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150",
            "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            "disabled:pointer-events-none disabled:opacity-25",
            destructive && "hover:bg-destructive/10 hover:text-destructive",
          )}
        >
          <HugeiconsIcon icon={icon} size={12} strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function EmptyBoard({
  hasContacts,
  onCreate,
}: {
  readonly hasContacts: boolean;
  readonly onCreate: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
        <HugeiconsIcon icon={MoneyBag02Icon} size={20} strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium">{t("pipeline.empty")}</p>
      <p className="max-w-[42ch] text-xs leading-relaxed text-muted-foreground">
        {hasContacts ? t("pipeline.emptyHint") : t("pipeline.emptyNoContacts")}
      </p>
      {hasContacts ? (
        <Button className="mt-1" size="sm" onClick={onCreate}>
          <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.75} />
          {t("pipeline.new")}
        </Button>
      ) : null}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex h-full gap-3 px-4 py-4">
      {Array.from({ length: 5 }).map((_, column) => (
        <div
          key={column}
          className="flex h-full w-[17.5rem] shrink-0 flex-col gap-2 rounded-2xl border border-border bg-card p-3"
        >
          <SkeletonBar className="h-3.5 w-24" />
          <SkeletonBar className="h-3 w-16" />
          {Array.from({ length: column === 0 ? 2 : 1 }).map((_, card) => (
            <div key={card} className="space-y-2 rounded-xl border border-border/60 p-3">
              <SkeletonBar className="h-3.5 w-full" />
              <SkeletonBar className="h-3 w-20" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
