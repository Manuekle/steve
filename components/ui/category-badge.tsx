import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import styles from "./category-badge.module.css";

/** Category identity, separate from success/warning/error status colors. */
export function CategoryBadge({
  hue,
  className,
  style,
  ...props
}: ComponentProps<"span"> & { readonly hue?: number }) {
  return (
    <span
      {...props}
      data-slot="category-badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        styles.badge,
        className,
      )}
      style={{ "--category-hue": hue, ...style } as CSSProperties}
    />
  );
}
