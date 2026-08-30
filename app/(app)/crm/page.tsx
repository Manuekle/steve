"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon, DragDropIcon, RefreshIcon, SearchIcon } from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { ContactDialog } from "../../_components/contact-dialog";
import { CrmBoard, CRM_COLUMNS, STATUS_THEME, type GroupedContacts } from "./_components/crm-board";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Skeleton } from "@/components/ai-elements/skeleton";
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
  const [isDragging, setIsDragging] = useState(false);

  /** The list as it stands right now, for rolling an optimistic move back. */
  const contactsRef = useRef<Contact[]>(contacts);
  contactsRef.current = contacts;

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
  // background refresh, so polling stands down for the length of the drag.
  usePolling(() => void load(), 30_000, !isDragging);
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
    setContacts(moveContactTo(previous, id, status, index));
    const result = await fetchJson("/api/contacts", t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: id, status, index }),
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
    void load();
  }, [t, load, toast]);

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

  const total = filteredContacts.length;
  const noResults = total === 0 && search.trim().length > 0;

  return (
    <PageContainer maxWidth="max-w-[1400px]" pattern="grid">
      {confirmDialog}
      <Skeleton className="min-h-[500px]" isLoading={isLoading} skeleton={<div className="h-96 rounded-xl bg-muted" />}>
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
            onMove={(id, status, index) => void move(id, status, index)}
            onEdit={openEdit}
            onDelete={(id) => void remove(id)}
            onDragActiveChange={setIsDragging}
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
