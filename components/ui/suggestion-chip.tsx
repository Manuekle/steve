import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The starter-prompt chip: a tappable suggestion that seeds a conversation.
// It shows up in five places — the agent builder's assistant, the automation
// flow's assistant, the agent chat's empty state, the home agent chat, and the
// follow-up options inside an assistant turn.
//
// Every one of those had its own hand-written copy, and they had drifted:
// three padding scales, two hover foreground tokens, and `active:scale` on
// some but not others. Worse, they were `rounded-full` — a pill radius the
// app's button scale (13/11/9px) does not have anywhere else, so the chips
// read as borrowed from another product.
//
// Building on `Button variant="outline"` is what fixes that at the root: the
// radius, focus ring, disabled treatment, and press language all come from the
// one place that defines them. Only the chip's own surface is added on top —
// the inset shadow and the opaque `bg-card`, which is not the outline
// variant's translucent white: the beam these chips sit inside paints its core
// behind the child, and a half-transparent surface lets it read through.
export function SuggestionChip({
  size = "sm",
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      // `tick` on hover, and the plain press cue rather than the outline
      // variant's `scan`: a row of chips is scanned with the pointer, and the
      // heavier cue on every pass was noise. These sit ahead of `props` so a
      // call site can still say otherwise.
      data-cuelume-hover="tick"
      data-cuelume-press
      className={cn(
        "border-border bg-card font-normal text-muted-foreground",
        "shadow-[var(--shadow-inset)]",
        "hover:border-input hover:bg-accent hover:text-accent-foreground",
        "active:scale-[0.98]",
        className,
      )}
      {...props}
    />
  );
}
