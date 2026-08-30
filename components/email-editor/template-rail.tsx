"use client";

import { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  Mail01Icon,
  PencilEdit02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export type TemplateItem = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly source: "builtin" | "custom";
  readonly variables: readonly string[];
};

type TemplateRailProps = {
  readonly templates: readonly TemplateItem[];
  readonly selectedId: string | null;
  readonly creating: boolean;
  readonly onSelect: (id: string) => void;
  readonly onCreateNew: () => void;
  readonly onDelete: (id: string) => void;
};

/**
 * The left rail: every template, split by where it came from.
 *
 * Built-ins and custom ones are two different things — one you can only read,
 * the other you own — so they get two headed sections rather than a filter you
 * have to operate to see the difference.
 */
export function TemplateRail({
  templates,
  selectedId,
  creating,
  onSelect,
  onCreateNew,
  onDelete,
}: TemplateRailProps) {
  const t = useT();
  const [query, setQuery] = useState("");

  const { builtin, custom } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? templates.filter(
          (item) =>
            item.label.toLowerCase().includes(needle) ||
            item.description.toLowerCase().includes(needle),
        )
      : templates;
    return {
      builtin: matches.filter((item) => item.source === "builtin"),
      custom: matches.filter((item) => item.source === "custom"),
    };
  }, [templates, query]);

  const empty = builtin.length === 0 && custom.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
        <MicroLabel>{t("emailTemplates.railTitle")}</MicroLabel>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCreateNew}
              disabled={creating}
              aria-label={t("emailTemplates.newTemplate")}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg text-muted-foreground",
                "transition-colors duration-150 hover:bg-accent hover:text-foreground",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("emailTemplates.newTemplate")}</TooltipContent>
        </Tooltip>
      </div>

      <div className="shrink-0 px-3 pb-2">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={1.75}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground/60"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("emailTemplates.searchPlaceholder")}
            aria-label={t("emailTemplates.searchPlaceholder")}
            className={cn(
              "h-8 w-full rounded-lg border border-border bg-card pr-2.5 pl-7.5 text-xs",
              "shadow-[var(--shadow-inset)] transition-colors duration-150 outline-none",
              "placeholder:text-muted-foreground/60 focus:border-input",
            )}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-hide">
        {empty ? (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground/70">
            {query ? t("emailTemplates.searchEmpty") : t("emailTemplates.railEmpty")}
          </p>
        ) : null}

        {builtin.length > 0 ? (
          <Section label={t("emailTemplates.builtin")}>
            {builtin.map((item) => (
              <TemplateRow
                key={item.id}
                template={item}
                selected={item.id === selectedId}
                onSelect={() => onSelect(item.id)}
              />
            ))}
          </Section>
        ) : null}

        {custom.length > 0 ? (
          <Section label={t("emailTemplates.custom")}>
            {custom.map((item) => (
              <TemplateRow
                key={item.id}
                template={item}
                selected={item.id === selectedId}
                onSelect={() => onSelect(item.id)}
                onDelete={() => onDelete(item.id)}
              />
            ))}
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Section({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <MicroLabel className="block px-2 pt-1 pb-1.5">{label}</MicroLabel>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function TemplateRow({
  template,
  selected,
  onSelect,
  onDelete,
}: {
  readonly template: TemplateItem;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDelete?: () => void;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-lg px-2 py-1.5",
        "transition-[background-color,box-shadow] duration-150 ease-out",
        selected
          ? "bg-card shadow-[var(--shadow-inset)]"
          : "hover:bg-accent/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-start gap-2 text-left"
      >
        <HugeiconsIcon
          icon={template.source === "builtin" ? Mail01Icon : PencilEdit02Icon}
          size={14}
          strokeWidth={1.75}
          className={cn(
            "mt-0.5 shrink-0 transition-colors duration-150",
            selected ? "text-foreground" : "text-muted-foreground/70",
          )}
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[13px] leading-snug",
              selected ? "font-medium text-foreground" : "text-foreground/85",
            )}
          >
            {template.label}
          </span>
          {template.description ? (
            <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground/70">
              {template.description}
            </span>
          ) : null}
        </span>
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("emailTemplates.delete")}
          className={cn(
            "mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground/60 opacity-0",
            "transition-[opacity,color,background-color] duration-150",
            "hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100",
            "group-hover:opacity-100",
          )}
        >
          <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}

function MicroLabel({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}
