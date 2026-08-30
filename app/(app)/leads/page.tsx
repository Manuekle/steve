"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon, Download01Icon, Delete01Icon, Add01Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { Card } from "../../_components/dashboard-card";
import { ContactDialog } from "../../_components/contact-dialog";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Skeleton } from "@/components/ai-elements/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useI18n } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import { contactSourceLabel, contactStatusLabel } from "@/lib/contact-labels";
import type { Contact, ContactStatus } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

const STATUS_OPTIONS: readonly ContactStatus[] = ["open", "waiting_human", "followup_due", "closed"];

export default function LeadsPage() {
  const { locale, t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "all">("all");
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchJson<{ contacts?: Contact[] }>("/api/contacts?limit=200", t);
    setIsLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setContacts(result.data.contacts ?? []);
  }, [t]);

  usePolling(() => void load(), 30_000);
  useEffect(() => { void load(); }, [load]);

  // The filter used to list a fixed set of sources. `Contact.source` is a free
  // string that channels, forms and webhooks each write themselves, so half the
  // options matched nothing while the values actually present ("web",
  // "webhook") had no option at all. Derive it from the rows instead.
  const sources = useMemo(
    () => [...new Set(contacts.map((c) => c.source).filter(Boolean))].sort(),
    [contacts],
  );

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) || (c.email && c.email.toLowerCase().includes(q));
    });
  }, [contacts, search, sourceFilter, statusFilter]);

  const openCreate = () => {
    setEditingContact(null);
    setDialogOpen(true);
  };
  const openEdit = (contact: Contact) => {
    setEditingContact(contact);
    setDialogOpen(true);
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: t("leads.confirmDelete") }))) return;
    const result = await fetchJson(`/api/contacts?contactId=${encodeURIComponent(id)}`, t, { method: "DELETE" });
    if (!result.ok) {
      setError(result.error);
      toast({ title: t("common.somethingWentWrong"), description: t("common.somethingWentWrongDescription"), status: "error" });
    } else {
      void load();
      toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
    }
  };

  const exportCSV = () => {
    const header = "id,name,phone,email,channel,status,source,createdAt\n";
    const rows = filtered.map((c) => `${c.id},"${(c.name ?? "").replace(/"/g, '""')}","${c.phone ?? ""}","${c.email ?? ""}",${c.channel},${c.status},${c.source},${c.createdAt}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      {confirmDialog}
      <Skeleton className="min-h-[400px]" isLoading={isLoading} skeleton={<div className="h-64 rounded-xl bg-muted" />}>
        <div className="content-enter">
          <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />
          <header className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t("leads.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("leads.subtitle")} ·{" "}
                {t("leads.counter", { shown: filtered.length, total: contacts.length })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportCSV}>
                <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.75} /> {t("leads.exportCsv")}
              </Button>
              <Button onClick={openCreate}>
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} /> {t("leads.addLead")}
              </Button>
            </div>
          </header>

          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <HugeiconsIcon icon={SearchIcon} size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("leads.searchPlaceholder")} className="pl-9" />
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("leads.allSources")}</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {contactSourceLabel(t, source)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as ContactStatus | "all")}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("leads.allStatuses")}</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {contactStatusLabel(t, status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <div className="px-5 py-16 text-center text-sm text-muted-foreground">
                {contacts.length === 0 ? t("leads.empty") : t("leads.noResults")}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">{t("leads.columnName")}</th>
                      <th className="px-4 py-2 text-left font-medium">{t("leads.columnContact")}</th>
                      <th className="px-4 py-2 text-left font-medium">{t("leads.columnSource")}</th>
                      <th className="px-4 py-2 text-left font-medium">{t("leads.columnStatus")}</th>
                      <th className="px-4 py-2 text-left font-medium">{t("leads.columnUpdated")}</th>
                      <th className="px-4 py-2 text-right font-medium">{t("leads.columnActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/30"
                        onClick={() => openEdit(c)}
                      >
                        <td className="px-4 py-2.5 font-medium">{c.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{c.phone || c.email || "—"}</td>
                        <td className="px-4 py-2.5"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{contactSourceLabel(t, c.source)}</span></td>
                        <td className="px-4 py-2.5 text-xs">{contactStatusLabel(t, c.status)}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{relativeTime(c.lastMessageAt, locale)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEdit(c);
                                  }}
                                  className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                  aria-label={t("leads.edit")}
                                >
                                  <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={1.75} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{t("leads.edit")}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void remove(c.id);
                                  }}
                                  className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={t("leads.delete")}
                                >
                                  <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{t("leads.delete")}</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
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
