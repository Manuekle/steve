"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Cancel01Icon, File01Icon, Image01Icon } from "@hugeicons/core-free-icons";

export type PendingAttachment = {
  readonly id: string;
  readonly file: File;
  readonly previewUrl?: string;
  readonly isImage: boolean;
};

export function ChatAttachmentsPreview({
  attachments,
  onRemove,
}: {
  readonly attachments: readonly PendingAttachment[];
  readonly onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
      {attachments.map((item) => (
        <div
          key={item.id}
          className="group relative flex items-center gap-2 rounded-xl border border-border bg-card/70 py-1.5 pl-2 pr-2.5 text-xs shadow-[var(--shadow-soft)] transition-all hover:border-input"
        >
          {item.isImage && item.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.previewUrl}
              alt={item.file.name}
              className="size-8 rounded-lg object-cover border border-border/50"
            />
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <HugeiconsIcon icon={item.isImage ? Image01Icon : File01Icon} size={16} strokeWidth={1.75} />
            </div>
          )}
          <div className="flex min-w-0 max-w-[140px] flex-col">
            <span className="truncate font-medium text-foreground">{item.file.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {(item.file.size / 1024).toFixed(0)} KB
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.id);
            }}
            className="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Quitar archivo"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
