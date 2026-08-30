"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  LibraryIcon,
  File01Icon,
  AlertCircleIcon,
  SearchIcon,
  Loading03Icon,
  ArtificialIntelligence08Icon,
} from "@hugeicons/core-free-icons";
import {
  FileUpload,
  type FileUploadItem,
} from "@/components/motion/file-upload";
import {
  AttachmentUpload,
  type AttachmentUploadItem,
} from "@/components/motion/attachment-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { useI18n } from "@/lib/i18n/provider";
import { networkUiError, readApiError, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useSound } from "@/components/sound-provider";
import type { KnowledgeDocument, KnowledgeMatch } from "@/lib/knowledge-store";
import { AppShell } from "../_components/app-shell";
import { PageContainer } from "../_components/page-container";
import { KpiCard, KpiSplit } from "../_components/kpi-card";
import {
  Card,
  CardDescription,
  CardHeader,
  CardSeparator,
  CardTitle,
} from "../_components/dashboard-card";

type EmbeddingStatus =
  | { available: true; model: string; route: "openai" | "gateway" }
  | { available: false };

type Limits = { maxFileBytes: number; accept: string };

const DEFAULT_LIMITS: Limits = { maxFileBytes: 20 * 1024 * 1024, accept: ".pdf,.txt,.md,.csv,.json" };

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export default function KnowledgePage() {
  const { t } = useI18n();
  const { cue } = useSound();

  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [embeddings, setEmbeddings] = useState<EmbeddingStatus>({ available: true, model: "", route: "openai" });
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);

  // The ingest queue, controlled so each row's status tracks the real
  // request rather than an animation.
  const [queue, setQueue] = useState<FileUploadItem[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<KnowledgeMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge");
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as {
        documents?: KnowledgeDocument[];
        embeddings?: EmbeddingStatus;
        limits?: Limits;
      };
      setDocuments(data.documents ?? []);
      if (data.embeddings) setEmbeddings(data.embeddings);
      if (data.limits) setLimits(data.limits);
    } catch {
      setError({ messageKey: "knowledge.loadFailed" });
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const patchQueueItem = useCallback((id: string, patch: Partial<FileUploadItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const upload = useCallback(
    (item: FileUploadItem) => {
      const file = item.file;
      if (!file) return;

      const form = new FormData();
      form.append("file", file);

      const request = new XMLHttpRequest();
      request.open("POST", "/api/knowledge");

      // The transfer is only half the work — the server still has to extract
      // and embed — so the bar tops out at 90% until the response lands.
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        patchQueueItem(item.id, {
          status: "uploading",
          progress: Math.round((event.loaded / event.total) * 90),
        });
      };

      request.onload = () => {
        let payload: { documents?: KnowledgeDocument[]; failed?: { name: string; error: string }[] } = {};
        try {
          payload = JSON.parse(request.responseText);
        } catch {
          /* handled below by the empty-documents check */
        }

        const failure = payload.failed?.[0];
        if (request.status >= 400 || failure) {
          patchQueueItem(item.id, {
            status: "error",
            progress: 0,
            error: failure?.error ?? t("knowledge.uploadFailed"),
          });
          return;
        }

        cue("success");
        patchQueueItem(item.id, { status: "success", progress: 100 });
        void loadDocuments();
        // The document now shows in the library below, so the queue row would
        // be a duplicate — let the success state read, then drop it.
        setTimeout(() => setQueue((prev) => prev.filter((entry) => entry.id !== item.id)), 1400);
      };

      request.onerror = () => {
        patchQueueItem(item.id, { status: "error", progress: 0, error: t("knowledge.uploadFailed") });
      };

      patchQueueItem(item.id, { status: "uploading", progress: 0 });
      request.send(form);
    },
    [cue, loadDocuments, patchQueueItem, t],
  );

  const handleFilesAdded = useCallback(
    (added: FileUploadItem[]) => {
      for (const item of added) upload(item);
    },
    [upload],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      cue("droplet");
      const previous = documents;
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      try {
        const res = await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok) {
          setDocuments(previous);
          setError({ messageKey: "knowledge.deleteFailed" });
        }
      } catch {
        setDocuments(previous);
        setError({ messageKey: "knowledge.deleteFailed" });
      }
    },
    [cue, documents, t],
  );

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, limit: 5 }),
      });
      if (!res.ok) {
        setMatches([]);
        // The server's own wording is English-only; `readApiError` maps its
        // code onto copy that exists in both languages.
        setError(await readApiError(res, t));
        return;
      }
      const data = (await res.json()) as { matches?: KnowledgeMatch[] };
      setMatches(data.matches ?? []);
    } catch (err) {
      setMatches([]);
      setError(networkUiError(err));
    } finally {
      setSearching(false);
    }
  }, [query, t]);

  // The library reuses the attachment list: every document is already
  // indexed, so each row is a "complete" attachment whose only action is
  // removal. The dropzone is hidden — uploading happens above.
  const libraryItems = useMemo<AttachmentUploadItem[]>(
    () =>
      documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        kind: "file" as const,
        size: doc.size,
        // Deliberately not "complete": that state paints the just-uploaded
        // green check and swaps the remove button for it. These rows are
        // settled library entries whose one action is deleting them.
        status: "idle" as const,
      })),
    [documents],
  );

  const totalChunks = useMemo(
    () => documents.reduce((sum, doc) => sum + doc.chunks, 0),
    [documents],
  );

  return (
    <AppShell activePath="/knowledge">
      <PageContainer maxWidth="max-w-6xl" pattern="grid">
        <Skeleton className="min-h-[500px]" isLoading={isLoading} skeleton={<KnowledgeSkeleton />}>
          <div className="content-enter">
            <header className="mb-8 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">{t("knowledge.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("knowledge.subtitle")}</p>
              </div>
              {documents.length > 0 ? (
                <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] sm:inline-flex">
                  <HugeiconsIcon
                    icon={LibraryIcon}
                    size={16}
                    strokeWidth={1.75}
                    className="text-muted-foreground"
                  />
                  <span>
                    <span className="tabular-nums">{documents.length}</span>{" "}
                    {t("knowledge.docsWord")}
                  </span>
                </div>
              ) : null}
            </header>

            {!embeddings.available ? (
              <Card className="mb-6 border-amber-500/40">
                <div className="flex items-start gap-3 px-5 py-4">
                  <HugeiconsIcon
                    icon={AlertCircleIcon}
                    size={18}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t("knowledge.embeddingsOff")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("knowledge.embeddingsOffHint")}
                    </p>
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <Link href="/settings">{t("knowledge.embeddingsOffCta")}</Link>
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}

            <ErrorBanner className="mb-4" error={error} onDismiss={() => setError(null)} />

            {documents.length > 0 ? (
              <div className="mb-6 grid grid-cols-3 gap-4">
                {/* The split bar is every document's share of the chunk
                    count. Two documents and 400 chunks is one file carrying
                    the base and one file that barely registers, and the split
                    is the only thing on the page that says so. */}
                <KpiCard
                  icon={LibraryIcon}
                  label={t("knowledge.kpiDocuments")}
                  value={documents.length}
                  visual={
                    <KpiSplit
                      parts={documents.map((doc) => ({
                        tone: "neutral" as const,
                        value: doc.chunks,
                      }))}
                    />
                  }
                />
                <KpiCard
                  icon={File01Icon}
                  label={t("knowledge.kpiChunks")}
                  sub={t("knowledge.kpiChunksSub", {
                    value: String(
                      documents.length > 0 ? Math.round(totalChunks / documents.length) : 0,
                    ),
                  })}
                  value={totalChunks}
                />
                <KpiCard
                  icon={ArtificialIntelligence08Icon}
                  label={t("knowledge.kpiEmbeddings")}
                  value={embeddings.available ? embeddings.route : "—"}
                  sub={embeddings.available ? embeddings.model : undefined}
                />
              </div>
            ) : null}

            <Card className="mb-6">
              <div className="px-5 py-5">
                <FileUpload
                  value={queue}
                  onValueChange={setQueue}
                  onFilesAdded={handleFilesAdded}
                  onRetry={upload}
                  accept={limits.accept}
                  disabled={!embeddings.available}
                  title={t("knowledge.uploadTitle")}
                  description={t("knowledge.uploadDescription", {
                    size: formatBytes(limits.maxFileBytes),
                  })}
                  browseLabel={t("knowledge.browse")}
                />
              </div>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={LibraryIcon} size={17} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle>{t("knowledge.libraryTitle")}</CardTitle>
                  <CardDescription>{t("knowledge.libraryDescription")}</CardDescription>
                </div>
              </CardHeader>
              <CardSeparator />
              <div className="px-5 py-4">
                {documents.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                      <HugeiconsIcon icon={LibraryIcon} size={20} strokeWidth={1.75} />
                    </div>
                    <p className="text-sm font-medium">{t("knowledge.libraryEmpty")}</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      {t("knowledge.libraryEmptyHint")}
                    </p>
                  </div>
                ) : (
                  <AttachmentUpload
                    value={libraryItems}
                    onValueChange={(items) =>
                      setDocuments((prev) => prev.filter((doc) => items.some((i) => i.id === doc.id)))
                    }
                    onRemove={(item) => void handleDelete(item.id)}
                    maxFiles={9999}
                    attachmentsLabel={t("knowledge.indexed")}
                    // Uploading lives in the card above; this is the library.
                    classNames={{ dropzone: "hidden" }}
                    className="[&>section]:mt-0"
                  />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={ArtificialIntelligence08Icon} size={17} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle>{t("knowledge.searchTitle")}</CardTitle>
                  <CardDescription>{t("knowledge.searchDescription")}</CardDescription>
                </div>
              </CardHeader>
              <CardSeparator />
              <div className="space-y-4 px-5 py-4">
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runSearch();
                  }}
                >
                  <div className="relative flex-1">
                    <HugeiconsIcon
                      icon={SearchIcon}
                      size={16}
                      strokeWidth={1.75}
                      className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t("knowledge.searchPlaceholder")}
                      className="pl-9"
                    />
                  </div>
                  <Button type="submit" disabled={searching || query.trim().length === 0}>
                    {searching ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                    ) : null}
                    {t("knowledge.searchAction")}
                  </Button>
                </form>

                {matches !== null ? (
                  matches.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("knowledge.searchEmpty")}</p>
                  ) : (
                    <ul className="space-y-3">
                      {matches.map((match) => (
                        <li
                          key={`${match.doc_id}-${match.chunk_index}`}
                          className="rounded-xl border border-border bg-background p-3"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <span className="truncate text-xs font-medium">{match.doc_name}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {t("knowledge.searchScore", { score: match.score.toFixed(3) })}
                            </span>
                          </div>
                          <p className="line-clamp-4 text-xs leading-5 text-muted-foreground">
                            {match.text}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            </Card>
          </div>
        </Skeleton>
      </PageContainer>
    </AppShell>
  );
}

function KnowledgeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonBar className="h-7 w-48" />
        <SkeletonBar className="h-4 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <SkeletonBar className="h-24 rounded-2xl" />
        <SkeletonBar className="h-24 rounded-2xl" />
        <SkeletonBar className="h-24 rounded-2xl" />
      </div>
      <SkeletonBar className="h-56 w-full rounded-2xl" />
      <SkeletonBar className="h-40 w-full rounded-2xl" />
    </div>
  );
}
