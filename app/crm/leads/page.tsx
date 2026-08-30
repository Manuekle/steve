"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon, Download01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../_components/app-shell";
import { PageContainer } from "../../_components/page-container";
import { Card } from "../../_components/dashboard-card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Skeleton } from "@/components/ai-elements/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

export default function LeadsPage() {
  const t = useT();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const load = useCallback(async () => {
    const result = await fetchJson<{ contacts?: Contact[] }>("/api/contacts?limit=200", t);
    setIsLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setContacts(result.data.contacts ?? []);
  }, [t]);

  usePolling(() => void load(), 30_000);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) || (c.email && c.email.toLowerCase().includes(q));
    });
  }, [contacts, search, sourceFilter]);

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
    <AppShell activePath="/crm">
      <PageContainer maxWidth="max-w-6xl" pattern="grid">
        <Skeleton className="min-h-[400px]" isLoading={isLoading} skeleton={<div className="h-64 rounded-xl bg-muted" />}>
          <div className="content-enter">
            <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />
            <header className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Leads</h1>
                <p className="mt-1 text-sm text-muted-foreground">Todos los leads unificados — voz, WhatsApp, web y Meta Ads · {filtered.length}/{contacts.length}</p>
              </div>
              <Button variant="outline" onClick={exportCSV}>
                <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.75} /> CSV
              </Button>
            </header>

            <div className="mb-4 flex gap-2">
              <div className="relative flex-1">
                <HugeiconsIcon icon={SearchIcon} size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, teléfono o email…" className="pl-9" />
              </div>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fuentes</SelectItem>
                  <SelectItem value="voice">Voz</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="form">Web</SelectItem>
                  <SelectItem value="inbox">Inbox</SelectItem>
                  <SelectItem value="meta">Meta Ads</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <Card><div className="px-5 py-16 text-center text-sm text-muted-foreground">Sin leads todavía</div></Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Nombre</th>
                        <th className="px-4 py-2 text-left font-medium">Contacto</th>
                        <th className="px-4 py-2 text-left font-medium">Fuente</th>
                        <th className="px-4 py-2 text-left font-medium">Estado</th>
                        <th className="px-4 py-2 text-left font-medium">Actualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => (
                        <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-medium">{c.name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{c.phone || c.email || "—"}</td>
                          <td className="px-4 py-2.5"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{c.source}</span></td>
                          <td className="px-4 py-2.5 text-xs">{c.status}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{relativeTime(c.lastMessageAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </Skeleton>
      </PageContainer>
    </AppShell>
  );
}
