"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Add01Icon, Unlink01Icon } from "@hugeicons/core-free-icons";
import { useT } from "@/lib/i18n/provider";
import type { WorkflowConnection } from "@/lib/types";
import type { XY } from "@/lib/workflow-layout";
import { withConnectionRouting } from "@/lib/flow-edge-path";
import { cn } from "@/lib/utils";

/** The original dot/pill control, with the centre reserved for direct dragging. */
export function FlowConnectionControl({ point, reference, axis, connection, label, toFlow, onPreview, onChange, onInsert, onDisconnect }: {
  readonly point: XY;
  readonly reference: XY;
  readonly axis: "x" | "y" | "xy";
  readonly connection: WorkflowConnection;
  readonly label: string;
  readonly toFlow: (x: number, y: number) => XY;
  readonly onPreview: (point: XY | null) => void;
  readonly onChange: (connection: WorkflowConnection | undefined) => void;
  readonly onInsert: () => void;
  readonly onDisconnect: () => void;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ origin: XY; start: XY; point: XY; moved: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const open = (hovered || focused) && !dragging;
  const commit = (next: XY) => {
    onChange(withConnectionRouting(connection, next, reference, axis));
  };
  const move = (start: XY, dx: number, dy: number): XY => ({ x: start.x + (axis === "y" ? 0 : dx), y: start.y + (axis === "x" ? 0 : dy) });
  const cancel = () => { drag.current = null; setDragging(false); onPreview(null); };
  const actionClass = "absolute top-0 flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--foreground)]";

  return (
    <div className="relative size-6" data-connection-control onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <span aria-hidden="true" className={cn("absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card shadow-[var(--shadow-soft)] transition-[width,height] duration-150 motion-reduce:transition-none", open ? "h-8 w-[88px]" : "size-2.5")} />
      <button ref={trigger} type="button" aria-label={t("automations.connection.moveNamed", { name: label })}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Escape" title={t("automations.connection.moveHint")}
        className="relative z-10 flex size-6 cursor-move touch-none items-center justify-center rounded-full text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--foreground)]"
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.stopPropagation();
          drag.current = { origin: toFlow(event.clientX, event.clientY), start: point, point, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (!drag.current) return;
          event.stopPropagation();
          const cursor = toFlow(event.clientX, event.clientY);
          const dx = cursor.x - drag.current.origin.x, dy = cursor.y - drag.current.origin.y;
          if (Math.hypot(dx, dy) > 4) drag.current.moved = true;
          if (!drag.current.moved) return;
          setDragging(true);
          drag.current.point = move(drag.current.start, dx, dy);
          onPreview(drag.current.point);
        }}
        onPointerUp={event => {
          event.stopPropagation();
          if (drag.current?.moved) commit(drag.current.point);
          cancel();
        }}
        onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) cancel(); }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === "Escape") { cancel(); setHovered(false); setFocused(false); return; }
          const delta: Record<string, XY> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
          const direction = delta[event.key];
          if (!direction) return;
          event.preventDefault();
          const amount = event.shiftKey ? 32 : 8;
          commit(move(point, direction.x * amount, direction.y * amount));
        }}>
        <span aria-hidden="true" className={cn("rounded-full bg-current", open ? "size-1.5" : "size-1")} />
      </button>
      <div inert={!open} className={cn("transition-opacity duration-100 motion-reduce:transition-none", open ? "opacity-100" : "pointer-events-none opacity-0")}
        onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { trigger.current?.focus(); setFocused(false); setHovered(false); } }}>
        <button type="button" aria-label={t("automations.insertStep")} title={t("automations.insertStep")} className={cn(actionClass, "-left-7")} onClick={onInsert}>
          <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" aria-label={t("automations.disconnectStep")} title={t("automations.disconnectStep")} className={cn(actionClass, "-right-7 hover:text-destructive")} onClick={onDisconnect}>
          <HugeiconsIcon icon={Unlink01Icon} size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
