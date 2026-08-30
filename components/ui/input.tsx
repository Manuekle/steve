import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-muted px-3.5 py-1 text-sm shadow-[var(--shadow-inset)] transition-[background-color,border-color,box-shadow] duration-150 ease-out outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring/50 focus-visible:bg-card focus-visible:shadow-[var(--shadow-inset),0_0_0_3px_oklch(0.5_0_0/0.1)] focus-visible:ring-0",
        "aria-invalid:border-destructive aria-invalid:shadow-[inset_0_-1px_0_oklch(0.577_0.245_27.325/0.15)] dark:aria-invalid:shadow-[inset_0_-1px_0_oklch(0.637_0.193_21.4/0.15)]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
