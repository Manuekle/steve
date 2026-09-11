"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_DRAWER, EASE_OUT, SPRING_PANEL } from "@/lib/ease";
import { PresenceGate } from "@/lib/presence-gate";
import { cn } from "@/lib/utils";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const DrawerContext = React.createContext<{ onOpenChange: (open: boolean) => void } | null>(null);

function Drawer({ open, onOpenChange, children }: DrawerProps) {
  const [mounted, setMounted] = React.useState(false);
  const reduce = useReducedMotion();
  const panelVariants = reduce
    ? {
        closed: { opacity: 0, transition: { duration: 0.16, ease: EASE_OUT } },
        open: { opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } },
      }
    : {
        closed: {
          x: "calc(100% + 4rem)",
          transition: { duration: 0.2, ease: EASE_DRAWER },
        },
        open: { x: 0, transition: SPRING_PANEL },
      };

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, onOpenChange]);

  if (!mounted) return null;

  return createPortal(
    <DrawerContext.Provider value={{ onOpenChange }}>
      <AnimatePresence>
        {open ? (
          <PresenceGate key="backdrop">
            {({ gate }) => (
              <motion.button
                type="button"
                aria-label="Close"
                tabIndex={0}
                onClick={() => onOpenChange(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                {...gate}
                className="fixed inset-0 z-50 h-full w-full cursor-default border-0 bg-black/40 p-0 backdrop-blur-sm"
              />
            )}
          </PresenceGate>
        ) : null}
        {open ? (
          <PresenceGate key="panel">
            {({ gate }) => (
              <motion.aside
                role="dialog"
                aria-modal="true"
                initial="closed"
                animate="open"
                exit="closed"
                variants={panelVariants}
                {...gate}
                className="fixed inset-y-4 right-4 z-50 flex h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-2xl flex-col sm:inset-y-6 sm:right-6 sm:h-[calc(100%-3rem)] sm:w-[calc(100%-3rem)]"
              >
                {children}
              </motion.aside>
            )}
          </PresenceGate>
        ) : null}
      </AnimatePresence>
    </DrawerContext.Provider>,
    document.body,
  );
}

function isDrawerFooter(child: React.ReactNode): boolean {
  if (!React.isValidElement(child)) return false;
  const props = child.props as Record<string, unknown> | undefined;
  return child.type === DrawerFooter || props?.["data-slot"] === "drawer-footer";
}

function DrawerContent({
  className,
  bodyClassName,
  showCloseButton = true,
  closeClassName,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  bodyClassName?: string;
  showCloseButton?: boolean;
  closeClassName?: string;
}) {
  const ctx = React.useContext(DrawerContext);
  const childArray = React.Children.toArray(children);
  const bodyChildren: React.ReactNode[] = [];
  let footerChild: React.ReactNode = null;

  for (const item of childArray) {
    if (isDrawerFooter(item)) {
      footerChild = item;
    } else {
      bodyChildren.push(item);
    }
  }

  // When there are no buttons / footer, render directly as a clean single card
  if (!footerChild) {
    return (
      <div
        data-slot="drawer-content"
        className={cn(
          "relative z-50 flex h-full max-h-full w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-[var(--shadow-float)]",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <button
            type="button"
            onClick={() => ctx?.onOpenChange(false)}
            aria-label="Close"
            className={cn(
              "absolute top-4 right-4 grid size-7 shrink-0 place-items-center rounded-[9px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)]",
              closeClassName,
            )}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
            <span className="sr-only">Close</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-slot="drawer-content"
      className={cn(
        "relative z-50 flex h-full max-h-full w-full max-w-lg flex-col rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]",
        className,
      )}
      {...props}
    >
      <div
        data-slot="drawer-card"
        className={cn(
          "relative flex flex-1 flex-col min-h-0 overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs",
          bodyClassName,
        )}
      >
        {bodyChildren}
        {showCloseButton && (
          <button
            type="button"
            onClick={() => ctx?.onOpenChange(false)}
            aria-label="Close"
            className={cn(
              "absolute top-3.5 right-3.5 z-10 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)]",
              closeClassName,
            )}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
            <span className="sr-only">Close</span>
          </button>
        )}
      </div>
      <div data-slot="drawer-footer-wrapper" className="px-2 pt-2 pb-1">
        {footerChild}
      </div>
    </div>
  );
}

function DrawerHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-1.5 p-5 pb-3 border-b border-border/40 text-left", className)}
      {...props}
    />
  );
}

type DrawerTitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  icon?: React.ReactNode;
};

function DrawerTitle({
  className,
  icon,
  children,
  ...props
}: DrawerTitleProps) {
  return (
    <h2
      data-slot="drawer-title"
      className={cn("flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground leading-normal", className)}
      {...props}
    >
      {icon && (
        <span className="text-foreground/80 shrink-0 inline-flex items-center">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </h2>
  );
}

function DrawerDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DrawerBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="drawer-body"
      className={cn("flex-1 overflow-y-auto p-5", className)}
      {...props}
    />
  );
}

function DrawerFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "flex flex-row items-center justify-between gap-3 w-full [&>*:only-child]:ml-auto",
        className,
      )}
      {...props}
    />
  );
}

export { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter };
