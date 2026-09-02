"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Add01Icon, Cancel01Icon, DragDropIcon, RefreshIcon, SearchIcon } from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { ContactDialog } from "../../_components/contact-dialog";
import { CrmBoard, CRM_COLUMNS, STATUS_THEME, type GroupedContacts } from "./_components/crm-board";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Skeleton, SkeletonAvatar, SkeletonBar } from "@/components/ai-elements/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Contact, ContactStatus } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { moveContactTo } from "@/lib/contact-order";

const EMPTY_GROUPS: GroupedContacts = { open: [], waiting_human: [], followup_due: [], closed: [] };

/** Skeleton for the CRM page — header, pipeline bar, search row, kanban board. */
function CrmSkeleton() {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-32" />
          <SkeletonBar className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBar className="h-9 w-32 rounded-lg" />
          <SkeletonBar className="h-9 w-32 rounded-lg" />
        </div>
      </header>

      <SkeletonBar className="h-1.5 w-full rounded-full" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SkeletonBar className="h-9 w-full max-w-sm rounded-lg" />
        <SkeletonBar className="h-3 w-24" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CRM_COLUMNS.map((status, col) => (
          <div
            key={status}
            className="space-y-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]"
          >
            <div className="flex items-center justify-between px-1">
              <SkeletonBar className="h-3.5 w-16" />
              <SkeletonBar className="h-4 w-5 rounded-full" />
            </div>
            {Array.from({ length: col === 3 ? 1 : 2 }).map((_, card) => (
              <div key={card} className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
                <div className="flex items-center gap-2">
                  <SkeletonAvatar size="size-7" />
                  <SkeletonBar className="h-3.5 w-20" />
                </div>
                <SkeletonBar className="h-3 w-28" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CrmPage() {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [search, setSearch] = useState("");
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  /** The list as it stands right now, for rolling an optimistic move back. */
  const contactsRef = useRef<Contact[]>(contacts);
  contactsRef.current = contacts;

  /** Polling stands down for the length of a drag and of the write that follows
   *  it. Both live in refs rather than state because `usePolling` re-runs — and
   *  ticks immediately — whenever its `enabled` flag flips: gating it on an
   *  `isDragging` state fired a refetch at the exact moment a card was let go,
   *  and that GET answered with the pre-move order, so the card snapped back to
   *  the column it had just left until the PUT landed and moved it again. */
  const isDraggingRef = useRef(false);
  const movesInFlight = useRef(0);

  const load = useCallback(async () => {
    const result = await fetchJson<{ contacts?: Contact[] }>("/api/contacts?limit=200", t);
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(null);
    setContacts(result.data.contacts ?? []);
    return true;
  }, [t]);

  // A card in the air must not be yanked out from under the pointer by a
  // background refresh, and neither must one that has landed but is still
  // being written.
  usePolling(() => {
    if (isDraggingRef.current || movesInFlight.current > 0) return;
    void load();
  }, 30_000);
  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)),
    );
  }, [contacts, search]);

  const grouped = useMemo(() => {
    const map: GroupedContacts = { open: [], waiting_human: [], followup_due: [], closed: [] };
    for (const c of filteredContacts) map[c.status]?.push(c);
    return map;
  }, [filteredContacts]);

  const groupedRef = useRef<GroupedContacts>(grouped);
  groupedRef.current = grouped;

  /** The board counts slots in what it draws, and what it draws is the column
   *  as the search left it. Both `moveContactTo` here and `moveContact` in the
   *  store place the card in the *whole* column, so a drop made with a search
   *  active has to be translated first — otherwise the card lands next to the
   *  card it was dropped beside only until the search is cleared. The slot is
   *  named by the card it opened above; that card's place in the full column is
   *  the real index. */
  const absoluteIndex = useCallback((id: string, status: ContactStatus, index?: number) => {
    if (index === undefined) return undefined;
    const column = contactsRef.current.filter((c) => c.status === status && c.id !== id);
    const anchor = groupedRef.current[status].filter((c) => c.id !== id)[index];
    if (!anchor) return column.length;
    const at = column.findIndex((c) => c.id === anchor.id);
    return at === -1 ? column.length : at;
  }, []);

  const openCreate = () => {
    setEditingContact(null);
    setDialogOpen(true);
  };
  const openEdit = useCallback((contact: Contact) => {
    setEditingContact(contact);
    setDialogOpen(true);
  }, []);

  /** Optimistic: the card lands in the slot it was dropped on, and only rolls
   *  back if the write actually fails. `index` is the position inside the
   *  destination column — the same ordering the store applies, computed by the
   *  same function, so the board never flickers into a different order when
   *  the refetch lands. */
  const move = useCallback(async (id: string, status: ContactStatus, index?: number) => {
    const previous = contactsRef.current;
    const current = previous.find((c) => c.id === id);
    if (!current) return;
    if (current.status === status && index === undefined) return;
    const slot = absoluteIndex(id, status, index);
    setContacts(moveContactTo(previous, id, status, slot));
    movesInFlight.current += 1;
    try {
      const result = await fetchJson("/api/contacts", t, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: id, status, index: slot }),
      });
      if (!result.ok) {
        setContacts(previous);
        setError(result.error);
        toast({
          title: t("common.somethingWentWrong"),
          description: t("common.somethingWentWrongDescription"),
          status: "error",
        });
        return;
      }
      await load();
    } finally {
      movesInFlight.current -= 1;
    }
  }, [t, load, toast, absoluteIndex]);

  const remove = useCallback(async (id: string) => {
    if (!(await confirm({ title: t("crm.confirmDelete") }))) return;
    const result = await fetchJson(`/api/contacts?contactId=${encodeURIComponent(id)}`, t, { method: "DELETE" });
    if (!result.ok) {
      setError(result.error);
      toast({ title: t("common.somethingWentWrong"), description: t("common.somethingWentWrongDescription"), status: "error" });
    } else {
      void load();
      toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
    }
  }, [t, load, confirm, toast]);

  /** Stable identities for everything the board takes. The board re-renders on
   *  every pointer move of a drag, and an inline prop here would rebuild its
   *  drag handlers each frame, which in turn defeats `ContactCard`'s memo and
   *  re-renders every card on the board sixty times a second. */
  const handleMove = useCallback((id: string, status: ContactStatus, index?: number) => {
    void move(id, status, index);
  }, [move]);
  const handleDelete = useCallback((id: string) => void remove(id), [remove]);
  const handleDragActive = useCallback((active: boolean) => {
    isDraggingRef.current = active;
  }, []);

  const total = filteredContacts.length;
  const noResults = total === 0 && search.trim().length > 0;

  return (
    <PageContainer maxWidth="max-w-[1400px]" pattern="grid">
      {confirmDialog}
      <Skeleton className="min-h-[500px]" isLoading={isLoading} skeleton={<CrmSkeleton />}>
        <div className="content-enter">
          <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />
          <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t("crm.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("crm.subtitle")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void refresh()} disabled={isRefreshing}>
                {t("crm.contactCount", { count: total })}
                <HugeiconsIcon
                  icon={RefreshIcon}
                  size={16}
                  strokeWidth={1.75}
                  className={cn(isRefreshing && "animate-spin")}
                />
              </Button>
              <Button onClick={openCreate}>
                {t("crm.addContact")}
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              </Button>
            </div>
          </header>

          {/* Pipeline bar — where the pipeline actually sits, in one glance. */}
          {total > 0 ? (
            <div className="mb-5 flex h-1.5 gap-1 overflow-hidden rounded-full">
              {CRM_COLUMNS.map((status) => {
                const count = grouped[status].length;
                if (count === 0) return null;
                return (
                  <Tooltip key={status}>
                    <TooltipTrigger asChild>
                      <motion.span
                        className={cn("block h-full rounded-full", STATUS_THEME[status].bar)}
                        initial={false}
                        animate={{ flexGrow: count }}
                        transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.7 }}
                        style={{ flexBasis: 0 }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {t(`contactStatus.${status}`)} · {count}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <HugeiconsIcon
                icon={SearchIcon}
                size={16}
                strokeWidth={1.75}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("crm.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("crm.searchPlaceholder")}
                className={cn("pl-9", search && "pr-9")}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label={t("crm.clearSearch")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
                </button>
              ) : null}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t("crm.dragHint")}
              <HugeiconsIcon icon={DragDropIcon} size={14} strokeWidth={1.75} />
            </p>
          </div>

          <CrmBoard
            grouped={noResults ? EMPTY_GROUPS : grouped}
            onMove={handleMove}
            onEdit={openEdit}
            onDelete={handleDelete}
            onDragActiveChange={handleDragActive}
          />

          {noResults ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t("crm.noResults", { query: search })}
            </p>
          ) : null}
        </div>
      </Skeleton>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <ContactDialog
          key={editingContact?.id ?? "new"}
          editing={editingContact}
          onClose={() => setDialogOpen(false)}
          onSaved={(updated) => setContacts(updated)}
        />
      </Dialog>
    </PageContainer>
  );
}
