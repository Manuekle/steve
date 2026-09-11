"use client";

import * as React from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSound, type CueName } from "@/components/sound-provider";

/**
 * `bloom` swells as the panel arrives.
 *
 * It takes both paths below because Radix only calls `onOpenChange` when the
 * *primitive* asks to change — a trigger click, Escape, the scrim. A parent
 * that opens its own dialog with `open={true}` (which is how nearly every
 * dialog in this app opens) never goes through it, so a cue hung on
 * `onOpenChange` alone is silent exactly where it matters most.
 *
 * Closing stays silent on purpose. A dialog that closes because the work
 * landed is already followed by that work's own cue — `success` after a save,
 * `droplet` after a delete — and cueing here too stacks two sounds inside the
 * same 200ms. A dialog dismissed without doing anything is a non-event.
 */
function useDialogOpenCue(
  open: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
  /** What arriving sounds like. Confirms override this with `warning`. */
  sound: CueName = "bloom",
) {
  const { cue } = useSound();
  const wasOpen = React.useRef(false);

  // Controlled: the `open` prop is the only signal there is.
  React.useEffect(() => {
    if (open === undefined) return;
    if (open && !wasOpen.current) cue(sound);
    wasOpen.current = open;
  }, [open, cue, sound]);

  return React.useCallback(
    (next: boolean) => {
      // Uncontrolled only — otherwise the effect above would cue this twice.
      if (open === undefined && next) cue(sound);
      onOpenChange?.(next);
    },
    [open, cue, sound, onOpenChange],
  );
}

function Dialog({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const handleOpenChange = useDialogOpenCue(open, onOpenChange);

  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      open={open}
      onOpenChange={handleOpenChange}
      {...props}
    />
  );
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        // `.t-scrim` fades via keyframes rather than a transition: Radix keeps
        // a closing element mounted only while an ANIMATION is running.
        "t-scrim fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function isFooterElement(child: React.ReactNode): boolean {
  if (!React.isValidElement(child)) return false;
  const props = child.props as Record<string, unknown> | undefined;
  return (
    child.type === DialogFooter ||
    props?.["data-slot"] === "dialog-footer" ||
    props?.["data-slot"] === "alert-dialog-footer"
  );
}

function flattenChildren(children: React.ReactNode): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      result.push(...flattenChildren((child.props as { children?: React.ReactNode }).children));
    } else if (child !== null && child !== undefined && child !== false) {
      result.push(child);
    }
  });
  return result;
}

function partitionDialogChildren(children: React.ReactNode) {
  const flattened = flattenChildren(children);
  let formElement: React.ReactElement<React.FormHTMLAttributes<HTMLFormElement>> | null = null;
  let footerChild: React.ReactNode = null;
  const bodyChildren: React.ReactNode[] = [];

  for (const item of flattened) {
    if (!React.isValidElement(item)) {
      if (item !== null && item !== undefined && item !== false) {
        bodyChildren.push(item);
      }
      continue;
    }

    if (isFooterElement(item)) {
      footerChild = item;
      continue;
    }

    if (typeof item.type === "string" && item.type === "form") {
      formElement = item as React.ReactElement<React.FormHTMLAttributes<HTMLFormElement>>;
      const formInner = flattenChildren(formElement.props.children);
      const innerBody: React.ReactNode[] = [];
      for (const inner of formInner) {
        if (isFooterElement(inner)) {
          footerChild = inner;
        } else {
          innerBody.push(inner);
        }
      }
      bodyChildren.push(
        <div key="dialog-form-inner" className={cn("flex flex-col gap-4", formElement.props.className)}>
          {innerBody}
        </div>,
      );
      continue;
    }

    bodyChildren.push(item);
  }

  return { formElement, bodyChildren, footerChild };
}

function DialogContent({
  className,
  bodyClassName,
  children,
  showCloseButton = true,
  closeClassName,
  variant = "default",
  scrollBody = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  closeClassName?: string;
  bodyClassName?: string;
  variant?: "default" | "plain";
  /**
   * Off for a panel whose body holds a popover that is positioned rather than
   * portalled — a calendar hanging off the last field, say. A scroll container
   * clips its own absolutely-positioned children, so such a popover opens
   * behind the card's bottom edge and has to be scrolled into view. Turning
   * this off lets it spill over the panel the way it did before, and the panel
   * then has to be short enough that it never needed to scroll.
   */
  scrollBody?: boolean;
}) {
  if (variant === "plain") {
    return (
      <DialogPortal data-slot="dialog-portal">
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "t-modal fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-float)] outline-none sm:max-w-lg",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className={cn(
                "absolute top-4 right-4 grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)] disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                closeClassName,
              )}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }

  const { formElement, bodyChildren, footerChild } = partitionDialogChildren(children);

  // When there are no buttons / footer, render directly as a clean single card
  if (!footerChild) {
    return (
      <DialogPortal data-slot="dialog-portal">
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "t-modal fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-float)] outline-none sm:max-w-lg",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className={cn(
                "absolute top-4 right-4 grid size-7 shrink-0 place-items-center rounded-[9px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)] disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                closeClassName,
              )}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }

  const cardContent = (
    <>
      <div
        data-slot="dialog-card"
        className={cn(
          // The one scroll region. Everything above caps the panel at the
          // viewport; this is what makes the part that no longer fits
          // reachable instead of clipped off the top and bottom edges.
          "relative flex min-h-0 flex-col gap-4 rounded-[14px] border border-border/50 bg-card p-4 shadow-xs sm:p-5",
          scrollBody && "overflow-y-auto overscroll-contain",
          bodyClassName,
        )}
      >
        {bodyChildren}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              "absolute top-3.5 right-3.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)] disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              closeClassName,
            )}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </div>
      <div
        data-slot="dialog-footer-wrapper"
        className="shrink-0 px-2 pt-2 pb-1"
      >
        {footerChild}
      </div>
    </>
  );

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "t-modal fixed top-[50%] left-[50%] z-50 flex max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)] outline-none sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {formElement
          ? React.cloneElement(formElement, {
              className: cn("flex min-h-0 w-full flex-col gap-0", formElement.props.className),
              children: cardContent,
            })
          : cardContent}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-row items-center justify-between gap-3 w-full [&>*:only-child]:ml-auto",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

type DialogTitleProps = React.ComponentProps<typeof DialogPrimitive.Title> & {
  icon?: React.ReactNode;
};

function DialogTitle({ className, icon, children, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground leading-normal",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="text-foreground/80 shrink-0 inline-flex items-center">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </DialogPrimitive.Title>
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function DialogShortcut({
  children,
  variant = "subtle",
  className,
}: {
  children: React.ReactNode;
  variant?: "subtle" | "primary" | "destructive";
  className?: string;
}) {
  return (
    <kbd
      data-slot="dialog-shortcut"
      className={cn(
        "inline-flex h-5 select-none items-center justify-center rounded px-1.5 font-mono text-[10px] font-medium tracking-wide transition-colors",
        variant === "subtle" &&
          "border border-border/80 bg-background/80 text-muted-foreground shadow-2xs",
        variant === "primary" &&
          "bg-primary-foreground/20 text-primary-foreground",
        variant === "destructive" &&
          "bg-destructive-foreground/20 text-destructive-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

function DialogCancel({
  className,
  children,
  showShortcut = false,
  asChild,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close> & {
  showShortcut?: boolean;
}) {
  if (asChild) {
    return (
      <DialogPrimitive.Close asChild {...props}>
        {children}
      </DialogPrimitive.Close>
    );
  }
  return (
    <DialogPrimitive.Close
      data-slot="dialog-cancel"
      className={cn(
        buttonVariants({ variant: "outline" }),
        "text-muted-foreground hover:text-foreground",
        showShortcut && "gap-2",
        className,
      )}
      {...props}
    >
      {children}
      {showShortcut && <DialogShortcut variant="subtle">esc</DialogShortcut>}
    </DialogPrimitive.Close>
  );
}

export {
  Dialog,
  DialogBody,
  DialogCancel,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
  // Shared with the alert dialog, so both kinds of panel arrive the same way.
  useDialogOpenCue,
};
