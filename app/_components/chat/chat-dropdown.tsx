"use client";

import { type ComponentProps, type ReactNode, type RefObject, useMemo } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { Popover } from "radix-ui";
import { cn } from "@/lib/utils";

function AnimatedPanel({
  children,
  ...props
}: ComponentProps<typeof motion.div>) {
  const isPresent = useIsPresent();

  return (
    <motion.div {...props} inert={!isPresent} aria-hidden={!isPresent || undefined}>
      {children}
    </motion.div>
  );
}

/** Keep positioning separate from motion, and retain the panel until exit finishes. */
export function ChatDropdown({
  open,
  onClose,
  anchorRef,
  side,
  label,
  className,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly side: "top" | "bottom";
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const virtualAnchor = useMemo(() => ({
    current: {
      getBoundingClientRect: () => anchorRef.current?.getBoundingClientRect() ?? new DOMRect(),
      get contextElement() { return anchorRef.current ?? undefined; },
    },
  }), [anchorRef]);
  const closed = { opacity: 0, transform: reducedMotion ? "none" : "scale(0.96)" };

  return (
    <Popover.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Popover.Anchor virtualRef={virtualAnchor} />
      <Popover.Portal forceMount>
        <AnimatePresence>
          {open && (
            <Popover.Content
              key="panel"
              forceMount
              asChild
              side={side}
              align="start"
              sideOffset={8}
              collisionPadding={12}
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              onInteractOutside={(event) => {
                if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
              }}
            >
              <AnimatedPanel
                data-slot="chat-dropdown"
                aria-label={label}
                initial={closed}
                animate={{ opacity: 1, transform: reducedMotion ? "none" : "scale(1)" }}
                exit={{
                  ...closed,
                  transition: { duration: reducedMotion ? 0 : 0.18, ease: [0.4, 0, 1, 1] },
                }}
                transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
                className={cn(
                  "z-50 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-popover text-popover-foreground shadow-[var(--shadow-float)] outline-none",
                  className,
                )}
                style={{
                  maxHeight: "var(--radix-popover-content-available-height)",
                  maxWidth: "var(--radix-popover-content-available-width)",
                  transformOrigin: "var(--radix-popover-content-transform-origin)",
                }}
              >
                {children}
              </AnimatedPanel>
            </Popover.Content>
          )}
        </AnimatePresence>
      </Popover.Portal>
    </Popover.Root>
  );
}
