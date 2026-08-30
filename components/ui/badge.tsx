import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow,background-color] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        // Monochrome primary — subtle surface.
        default:
          "bg-primary/8 text-foreground [a&]:hover:bg-primary/12 dark:bg-primary/10 dark:text-foreground dark:[a&]:hover:bg-primary/15",
        // Secondary — even softer.
        secondary:
          "bg-secondary text-secondary-foreground shadow-[var(--shadow-inset)] [a&]:hover:bg-secondary/80 dark:[a&]:hover:bg-secondary/70",
        // Destructive — desaturated, subtle.
        destructive:
          "bg-destructive/8 text-destructive [a&]:hover:bg-destructive/12 dark:bg-destructive/10 dark:text-destructive dark:[a&]:hover:bg-destructive/15",
        // Outline — hairline border.
        outline:
          "border border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // Ghost — transparent.
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
