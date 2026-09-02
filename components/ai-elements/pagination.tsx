"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft02Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { useSound } from "@/components/sound-provider";
import { useT } from "@/lib/i18n/provider";
import { pageItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  readonly className?: string;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (size: number) => void;
  /** 1-indexed. */
  readonly page: number;
  readonly pageCount: number;
  readonly pageSize?: number;
  readonly pageSizeOptions?: readonly number[];
}

/**
 * Page bar plus an optional rows-per-page control.
 *
 * Both sit on the same recessed track the segmented tabs use, so paging reads
 * as part of the same control family rather than as a stray row of links.
 * Prev/Next are raised pills at the ends; the current page is the one filled
 * element in the bar.
 */
export function Pagination({
  className,
  onPageChange,
  onPageSizeChange,
  page,
  pageCount,
  pageSize,
  pageSizeOptions = [5, 10, 20],
}: PaginationProps) {
  const t = useT();
  const { cue } = useSound();

  // One page is not a choice — but the rows control still is, so the bar goes
  // and the size tabs stay.
  const showPages = pageCount > 1;
  const showSizes = pageSize !== undefined && onPageSizeChange !== undefined;
  if (!showPages && !showSizes) return null;

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), pageCount);
    // Inside the guard, so Next on the last page — a button that is disabled
    // but still reachable by a stray click — stays as silent as it is inert.
    if (clamped !== page) {
      cue("page");
      onPageChange(clamped);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {showPages ? (
        <nav aria-label={t("pagination.label")} className="t-pager">
          <button
            aria-label={t("pagination.prev")}
            className="t-pager-edge"
            disabled={page <= 1}
            onClick={() => goTo(page - 1)}
            type="button"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} />
            <span className="hidden sm:inline">{t("pagination.prev")}</span>
          </button>

          <span className="t-pager-pages">
            {pageItems(page, pageCount).map((item, index) =>
              item === "gap" ? (
                <span
                  aria-hidden="true"
                  className="t-pager-gap"
                  // Gaps have no stable identity of their own; there are at
                  // most two and they never reorder among themselves.
                  key={`gap-${index}`}
                >
                  …
                </span>
              ) : (
                <button
                  aria-current={item === page ? "page" : undefined}
                  aria-label={t("pagination.page", { page: item })}
                  className="t-pager-page"
                  key={item}
                  onClick={() => goTo(item)}
                  type="button"
                >
                  {item}
                </button>
              ),
            )}
          </span>

          <button
            aria-label={t("pagination.next")}
            className="t-pager-edge"
            disabled={page >= pageCount}
            onClick={() => goTo(page + 1)}
            type="button"
          >
            <span className="hidden sm:inline">{t("pagination.next")}</span>
            <HugeiconsIcon icon={ArrowRight02Icon} size={14} strokeWidth={2} />
          </button>
        </nav>
      ) : null}

      {showSizes ? (
        <SlidingTabs
          onValueChange={(id) => onPageSizeChange(Number(id))}
          tabs={pageSizeOptions.map((size) => ({
            id: String(size),
            // The unit rides on the selected option only — repeating "rows"
            // three times is noise once the first one has explained the row.
            label: size === pageSize ? t("pagination.rows", { count: size }) : String(size),
          }))}
          value={String(pageSize)}
        />
      ) : null}
    </div>
  );
}
