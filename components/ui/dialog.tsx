"use client";

import * as React from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeClassName,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /**
   * Where the close button sits. The default inset is measured against this
   * component's own `p-6`; a dialog that drops the padding (a palette whose
   * first row is a search field, a media viewer) has a different rail, and
   * `top-4 right-4` then lands the button somewhere arbitrary over the first
   * row instead of centred in it. Those dialogs pass their own inset.
   */
  closeClassName?: string;
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "t-modal fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-float)] outline-none sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              "absolute top-4 right-4 grid size-7 shrink-0 place-items-center rounded-[9px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-ring/30 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
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
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
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

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
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

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  // Shared with the alert dialog, so both kinds of panel arrive the same way.
  useDialogOpenCue,
};
