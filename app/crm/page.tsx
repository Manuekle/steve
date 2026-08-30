"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { TelevisionTableIcon, Delete01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../_components/app-shell";
import { PageContainer } from "../_components/page-container";
import { Card } from "../_components/dashboard-card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Skeleton } from "@/components/ai-elements/skeleton";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Contact, ContactStatus } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

type Column = { id: ContactStatus; label: string; color: string };

const COLUMNS: Column[] = [
  { id: "open", label: "Nuevo", color: "bg-muted" },
  { id: "waiting_human", label: "Contactado", color: "bg-amber-500" },
  { id: "followup_due", label: "Pago enviado", color: "bg-sky-500" },
  { id: "closed", label: "Pagado", color: "bg-emerald-500" },
];

export default function CrmPage() {
  const t = useT();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);

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

  usePolling(() => void load(), 30_000);
  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const map: Record<ContactStatus, Contact[]> = { open: [], waiting_human: [], followup_due: [], closed: [] };
    for (const c of contacts) map[c.status]?.push(c);
    return map;
  }, [contacts]);

  const move = useCallback(async (id: string, status: ContactStatus) => {
    const result = await fetchJson("/api/contacts", t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: id, status }),
    });
    if (!result.ok) setError(result.error);
    else void load();
  }, [t, load]);

  const remove = useCallback(async (id: string) => {
    if (!confirm("¿Eliminar este contacto?")) return;
    const result = await fetchJson(`/api/contacts?contactId=${encodeURIComponent(id)}`, t, { method: "DELETE" });
    if (!result.ok) setError(result.error);
    else void load();
  }, [t, load]);

  return (
    <AppShell activePath="/crm">
      <PageContainer maxWidth="max-w-[1400px]" pattern="grid">
        <Skeleton className="min-h-[500px]" isLoading={isLoading} skeleton={<div className="h-96 rounded-xl bg-muted" />}>
          <div className="content-enter">
            <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />
            <header className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">CRM</h1>
                <p className="mt-1 text-sm text-muted-foreground">Pipeline de pedidos — voz, WhatsApp y Meta Ads</p>
              </div>
              <Button variant="outline" onClick={() => void load()}>
                <HugeiconsIcon icon={TelevisionTableIcon} size={16} strokeWidth={1.75} />
                {contacts.length} contactos
              </Button>
            </header>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((col) => (
                <div key={col.id} className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <span className={cn("size-2 rounded-full", col.color)} />
                    <h3 className="text-sm font-medium">{col.label}</h3>
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{grouped[col.id].length}</span>
                  </div>
                  <div className="flex-1 space-y-2 p-3 min-h-[320px] bg-muted/20">
                    {grouped[col.id].length === 0 ? (
                      <p className="py-8 text-center text-xs text-muted-foreground">Vacío</p>
                    ) : grouped[col.id].map((c) => (
                      <Card key={c.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{c.phone || c.email || c.source}</p>
                          </div>
                          <button onClick={() => void remove(c.id)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Eliminar" title="Eliminar">
                            <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                          </button>
                        </div>
                        {c.lastMessage ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{c.lastMessage}</p> : null}
                        <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(c.lastMessageAt)}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {COLUMNS.filter((x) => x.id !== c.status).map((target) => (
                            <button
                              key={target.id}
                              onClick={() => void move(c.id, target.id)}
                              className="rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
                            >
                              → {target.label}
                            </button>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Skeleton>
      </PageContainer>
    </AppShell>
  );
}
