"use client";

import type { ReactNode } from "react";
import type { HugeiconsIcon } from "@/components/icons/icon";
import { HugeiconsIcon as Icon } from "@/components/icons/icon";
import { Beam } from "@/components/ui/beam";
import { Button } from "@/components/ui/button";

type IconSpec = React.ComponentProps<typeof HugeiconsIcon>["icon"];

// The floating "bring the side dock back" control, pinned to the top-right of
// a workspace whose dock is closed. Five screens had their own copy of it —
// the assistant on an agent, the assistant on an automation, the pipeline
// summary, the form preview, the email preview — identical down to the shadow
// token, differing only in icon and label. Editing the affordance meant
// editing it five times, and it had already drifted: two of the copies had
// lost the `z-index` that keeps it above a Monaco editor's own layers.
//
// The surface is the design system's `outline` button rather than a bare
// `<button>` with hand-written classes. That is what puts it back on the
// app's radius, focus ring, and press language; the only additions here are
// the float shadow and the blur, which are what make it read as hovering over
// the canvas instead of sitting in it.
export function DockReopenButton({
  icon,
  label,
  onClick,
}: {
  readonly icon: IconSpec;
  readonly label: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <Beam
      className="transition-transform duration-150 ease-out hover:-translate-y-px"
      // Positioning lives in `style`, not `className`: Beam's underlying
      // package pins its wrapper with a stylesheet injected after Tailwind's.
      // The `z-index` is not optional — without it the pill lands behind the
      // overlay widgets of an editor rendered on the same canvas.
      style={{ position: "absolute", top: "1rem", right: "1rem", zIndex: 20 }}
      colorVariant="mono"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        className="gap-1.5 text-xs font-medium shadow-[var(--shadow-float)] backdrop-blur-sm"
      >
        <Icon icon={icon} size={13} strokeWidth={1.75} />
        {label}
      </Button>
    </Beam>
  );
}
