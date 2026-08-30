import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-muted px-3.5 py-2.5 text-sm shadow-[var(--shadow-inset)] transition-[background-color,border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring/50 focus-visible:bg-card focus-visible:shadow-[var(--shadow-inset),0_0_0_3px_oklch(0.5_0_0/0.1)] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:shadow-[inset_0_-1px_0_oklch(0.577_0.245_27.325/0.15)] md:text-sm dark:aria-invalid:shadow-[inset_0_-1px_0_oklch(0.637_0.193_21.4/0.15)]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
