import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-muted px-3.5 py-1 text-sm shadow-[var(--shadow-inset)] transition-[background-color,border-color,box-shadow] duration-150 ease-out outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        // The old focus state was a 10% grey ring plus a half-alpha border,
        // composed into the same `box-shadow` slot the field already spends
        // on its inset depth — so the indicator competed with the surface and
        // lost. `outline` is its own property, sits outside that shadow, and
        // is the one focus style forced-colors mode preserves. Its weight is
        // a single token, `--ring`; see globals.css for where that sits
        // against WCAG 1.4.11 and what `prefers-contrast: more` restores.
        "focus-visible:border-ring focus-visible:bg-card focus-visible:ring-0",
        "focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)]",
        "aria-invalid:border-destructive aria-invalid:shadow-[inset_0_-1px_0_oklch(0.54_0.22_27.325/0.15)] dark:aria-invalid:shadow-[inset_0_-1px_0_oklch(0.637_0.193_21.4/0.15)]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
