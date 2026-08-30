"use client";

import { memo, useCallback, useRef, useState, type ReactNode, type Ref } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type PanInfo,
} from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import { contactSourceLabel } from "@/lib/contact-labels";
import { cn } from "@/lib/utils";
import type { Contact, ContactStatus } from "@/lib/types";

// ── CRM board ──────────────────────────────────────────────────────
// A pipeline the pointer can actually push around. Every card is a
// draggable body with weight: it tilts into the direction it is thrown
// (rotation driven by horizontal velocity), squashes and stretches as it
// accelerates (scaleX/scaleY driven by vertical velocity), and lands on
// an under-damped spring so it settles with a bounce.
//
// A card is dropped where the pointer is, not where the board decides:
// the slot under the pointer opens up as an empty gap the height of the
// card being carried, and that slot is the position the card keeps —
// within a column as much as across columns.
//
// The surface is the app's own: the same plate the KPI tiles are made of
// — `--shadow-soft` under it, `--shadow-inset` bevelling its top edge,
// and the `.kpi-card` sheen across it. The board carries no hue at all.
// A stage is told apart by ink density (faint dot → solid dot as the
// contact moves down the pipeline), which is how the rest of this app
// distinguishes states; four saturated hues read as a different product.
//
// Drop targets are hit-tested against the live rects of each column and
// its cards, not against a library's synthetic collision boxes, so the
// board stays correct while the page scrolls mid-drag.
//
// Everything physical here is opt-out: `useReducedMotion` drops the tilt,
// the squash and the bounce while leaving drag-and-drop fully working,
// and every move is also reachable from the keyboard through the move
// pills on each card.

export const CRM_COLUMNS = ["open", "waiting_human", "followup_due", "closed"] as const;

export type GroupedContacts = Record<ContactStatus, Contact[]>;

/** Card follows the pointer and scales up on grab. */
const SPRING_GRAB = { type: "spring", stiffness: 520, damping: 26, mass: 0.6 } as const;
/** Landing in a new slot — deliberately under-damped, so it bounces. */
const SPRING_LAND = { type: "spring", stiffness: 460, damping: 13, mass: 0.8 } as const;
/** Tilt / squash follow-through. Low damping = jelly, not rubber. */
const SPRING_BODY = { stiffness: 240, damping: 17, mass: 0.45 } as const;
/** Snap back home when a card is dropped where it started. */
const DRAG_RETURN = { bounceStiffness: 400, bounceDamping: 17 } as const;

/** A click that arrives this soon after a drop is the drop's own click, not
 *  a tap on the card. The guard is held on the board, not in the card: a card
 *  that changed column has already been unmounted and remounted by the time
 *  the click lands, so a ref inside it would come back reset — which is what
 *  opened the editor on every drop. */
const DROP_CLICK_GRACE_MS = 350;

/** The plate every surface on this board is made of: the app's card, its
 *  soft drop shadow, and the inset bevel that lights its top edge. */
const PLATE = "bg-card shadow-[var(--shadow-soft),var(--shadow-inset)]";

type StatusTheme = {
  /** Ink density, not hue: the stage marker fills in as the deal advances. */
  readonly dot: string;
  readonly chip: string;
  readonly bar: string;
};

export const STATUS_THEME: Record<ContactStatus, StatusTheme> = {
  open: {
    dot: "bg-foreground/25",
    chip: "bg-primary/8 text-muted-foreground",
    bar: "bg-foreground/20",
  },
  waiting_human: {
    dot: "bg-foreground/45",
    chip: "bg-primary/8 text-muted-foreground",
    bar: "bg-foreground/35",
  },
  followup_due: {
    dot: "bg-foreground/70",
    chip: "bg-primary/10 text-foreground",
    bar: "bg-foreground/55",
  },
  closed: {
    dot: "bg-foreground",
    chip: "bg-primary/12 text-foreground",
    bar: "bg-foreground/80",
  },
};

/** Two letters, taken from the first and last word of the name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

/** Pointer position in viewport coordinates. Motion hands us a pointer
 *  event for mouse, pen and touch alike; `info.point` is the fallback for
 *  any synthetic event that arrives without client coordinates. */
function clientPoint(event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
  if ("clientX" in event && typeof event.clientX === "number") {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = "changedTouches" in event ? event.changedTouches[0] : undefined;
  if (touch) return { x: touch.clientX, y: touch.clientY };
  return { x: info.point.x - window.scrollX, y: info.point.y - window.scrollY };
}

/** The nearest ancestor that actually scrolls — the app shell scrolls its own
 *  element, not the window, so `window.scrollBy` would do nothing here. */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/** Pulls the board along when a dragged card reaches the top or bottom edge,
 *  so a long column can be crossed without letting go. */
function autoScroll(scroller: HTMLElement | null, pointerY: number) {
  if (!scroller) return;
  const rect = scroller.getBoundingClientRect();
  const edge = 96;
  const max = 22;
  if (pointerY < rect.top + edge) {
    scroller.scrollTop -= max * Math.min(1, (rect.top + edge - pointerY) / edge);
  } else if (pointerY > rect.bottom - edge) {
    scroller.scrollTop += max * Math.min(1, (pointerY - (rect.bottom - edge)) / edge);
  }
}

/** The gap that opens under the pointer. Exactly as tall as the card being
 *  carried, so the cards part by the space it will occupy and the drop is
 *  literal rather than announced. The zone is generous: full column width,
 *  clearly marked so the pointer never wonders where it will land. */
function DropSlot({ height, t }: { readonly height: number; readonly t: (key: string) => string }) {
  return (
    <motion.div
      aria-hidden
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height }}
      exit={{ opacity: 0, height: 0 }}
      transition={SPRING_GRAB}
      className="relative flex items-center justify-center rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.06]"
    >
      <span className="pointer-events-none select-none text-[11px] font-medium text-primary/50">
        {t("crm.dropHere")}
      </span>
    </motion.div>
  );
}

export function CrmBoard({
  grouped,
  onMove,
  onEdit,
  onDelete,
  onDragActiveChange,
}: {
  readonly grouped: GroupedContacts;
  /** `index` is the slot inside the destination column the card was let go
   *  over. The move pills omit it — they change stage, not order. */
  readonly onMove: (id: string, status: ContactStatus, index?: number) => void;
  readonly onEdit: (contact: Contact) => void;
  readonly onDelete: (id: string) => void;
  /** Lets the page stand its polling down while a card is in the air. */
  readonly onDragActiveChange?: (active: boolean) => void;
}) {
  const { t } = useI18n();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const zones = useRef(new Map<ContactStatus, HTMLElement>());
  const dropRef = useRef<{ status: ContactStatus; index: number } | null>(null);
  const droppedAt = useRef(0);
  const isDraggingRef = useRef(false);
  const [drop, setDrop] = useState<{ status: ContactStatus; index: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragHeight, setDragHeight] = useState(0);
  const [landedId, setLandedId] = useState<string | null>(null);

  const registerZone = useCallback((status: ContactStatus, el: HTMLElement | null) => {
    if (el) zones.current.set(status, el);
    else zones.current.delete(status);
  }, []);

  /** Live hit test: which column, and which slot inside it, is under the
   *  pointer. Rects are re-read per move, so a board that scrolls under the
   *  dragged card still resolves to the right place. */
  const slotAt = useCallback((x: number, y: number, draggedId: string) => {
    for (const [status, el] of zones.current) {
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-card-id]"))
        .filter((card) => card.dataset.cardId !== draggedId);
      let index = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const cardRect = cards[i]!.getBoundingClientRect();
        if (y < cardRect.top + cardRect.height / 2) {
          index = i;
          break;
        }
      }
      return { status, index };
    }
    return null;
  }, []);

  const setDropIfChanged = useCallback((next: { status: ContactStatus; index: number } | null) => {
    const current = dropRef.current;
    if (current?.status === next?.status && current?.index === next?.index) return;
    dropRef.current = next;
    setDrop(next);
  }, []);

  const handleDragStart = useCallback((id: string, height: number) => {
    scrollerRef.current = scrollParentOf(boardRef.current);
    isDraggingRef.current = true;
    setDragHeight(height);
    setDraggingId(id);
    setLandedId(null);
    onDragActiveChange?.(true);
  }, [onDragActiveChange]);

  const handleDrag = useCallback((
    id: string,
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const p = clientPoint(event, info);
    autoScroll(scrollerRef.current, p.y);
    setDropIfChanged(slotAt(p.x, p.y, id));
  }, [slotAt, setDropIfChanged]);

  const handleDragEnd = useCallback((
    contact: Contact,
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const p = clientPoint(event, info);
    const target = slotAt(p.x, p.y, contact.id);
    droppedAt.current = Date.now();
    isDraggingRef.current = false;
    setDraggingId(null);
    setDropIfChanged(null);
    onDragActiveChange?.(false);
    if (target) {
      setLandedId(contact.id);
      onMove(contact.id, target.status, target.index);
    }
  }, [slotAt, onMove, setDropIfChanged, onDragActiveChange]);

  /** Was the click that just fired the tail of a drag?
   *
   *  Both halves matter. The browser dispatches `click` straight after
   *  `pointerup`, while Motion settles the gesture on its next frame — so the
   *  click can arrive *before* `onDragEnd` has run, and a timestamp alone
   *  would still be stale. The in-flight flag covers that window; the
   *  timestamp covers the frames just after the drop. */
  const isDropClick = useCallback(
    () => isDraggingRef.current || Date.now() - droppedAt.current < DROP_CLICK_GRACE_MS,
    [],
  );

  return (
    <div
      ref={boardRef}
      // Belt and braces for the click a drag leaves behind: swallowed here, in
      // the capture phase, before it can reach a card — the card itself may
      // have been remounted into its new column by the time it arrives.
      onClickCapture={(e) => {
        if (!isDropClick()) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      {CRM_COLUMNS.map((status) => {
        const theme = STATUS_THEME[status];
        const cards = grouped[status];
        const isTarget = drop?.status === status && draggingId !== null;

        // The slot is placed by counting cards the drag is not carrying, so
        // the index the board reports and the index it draws are the same one.
        const rows: ReactNode[] = [];
        let placed = 0;
        let slotPlaced = false;
        for (const contact of cards) {
          if (isTarget && drop.index === placed && !slotPlaced) {
            rows.push(<DropSlot key={`drop-slot-${placed}`} height={dragHeight} t={t} />);
            slotPlaced = true;
          }
          rows.push(
            <ContactCard
              key={contact.id}
              contact={contact}
              isDragging={draggingId === contact.id}
              justLanded={landedId === contact.id}
              isDropClick={isDropClick}
              onDragStart={handleDragStart}
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMove}
            />,
          );
          if (contact.id !== draggingId) placed++;
        }
        if (isTarget && drop.index >= placed && !slotPlaced) {
          rows.push(<DropSlot key={`drop-slot-${placed}`} height={dragHeight} t={t} />);
        }

        return (
          <section
            key={status}
            className={cn(
              "relative flex flex-col rounded-2xl border transition-[border-color,box-shadow] duration-200",
              PLATE,
              isTarget ? "border-input ring-2 ring-foreground/10" : "border-border",
            )}
          >
            <header className="flex items-center gap-2.5 rounded-t-2xl border-b border-border bg-gradient-to-b from-foreground/[0.025] to-transparent px-4 py-3">
              <span className={cn("size-2 shrink-0 rounded-full ring-4 ring-foreground/[0.06]", theme.dot)} />
              <h3 className="truncate text-sm font-medium">{t(`contactStatus.${status}`)}</h3>
              <span className={cn("ml-auto min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-medium tabular-nums", theme.chip)}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={cards.length}
                    className="block"
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 8, opacity: 0 }}
                    transition={SPRING_GRAB}
                  >
                    {cards.length}
                  </motion.span>
                </AnimatePresence>
              </span>
            </header>

            <div
              ref={(el) => registerZone(status, el)}
              className={cn(
                "min-h-[300px] flex-1 space-y-2 rounded-b-2xl p-3 transition-colors duration-200",
                isTarget ? "bg-muted/40" : "bg-muted/25",
              )}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {rows}
                {cards.length === 0 && !isTarget ? (
                  <motion.p
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground"
                  >
                    {t("crm.columnEmpty")}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          </section>
        );
      })}
    </div>
  );
}

const ContactCard = memo(function ContactCard({
  ref,
  contact,
  isDragging,
  justLanded,
  isDropClick,
  onDragStart,
  onDrag,
  onDragEnd,
  onEdit,
  onDelete,
  onMove,
}: {
  /** `AnimatePresence mode="popLayout"` clones its child with a ref and
   *  measures the node through it to pop the exiting card out of flow. A
   *  component that swallows that ref leaves the exit unmeasured — which is
   *  how moved cards stayed on screen as ghosts in their old column. */
  readonly ref?: Ref<HTMLElement>;
  readonly contact: Contact;
  readonly isDragging: boolean;
  readonly justLanded: boolean;
  readonly isDropClick: () => boolean;
  readonly onDragStart: (id: string, height: number) => void;
  readonly onDrag: (id: string, event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  readonly onDragEnd: (contact: Contact, event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  readonly onEdit: (contact: Contact) => void;
  readonly onDelete: (id: string) => void;
  readonly onMove: (id: string, status: ContactStatus, index?: number) => void;
}) {
  const { locale, t } = useI18n();
  const reduce = useReducedMotion();
  const hasContactLine = Boolean(contact.phone || contact.email);
  const node = useRef<HTMLElement | null>(null);

  /** Keeps our own handle on the node while still handing it to whoever asked
   *  for it — `AnimatePresence` needs the same ref for its exit measurement. */
  const setRefs = useCallback((el: HTMLElement | null) => {
    node.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref && typeof ref === "object") (ref as { current: HTMLElement | null }).current = el;
  }, [ref]);

  // ── Physics ──
  // x/y are the drag offsets. Their velocities drive the body: horizontal
  // throw becomes tilt, vertical throw becomes squash & stretch. Each one
  // runs through its own spring so the card keeps moving for a beat after
  // the pointer stops — the follow-through that reads as weight.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const velocityX = useVelocity(x);
  const velocityY = useVelocity(y);
  const tilt = useSpring(useTransform(velocityX, [-1600, 1600], [-9, 9], { clamp: true }), SPRING_BODY);
  const speedY = useTransform(velocityY, (v: number) => Math.min(Math.abs(v) / 2200, 1));
  const stretch = useSpring(useTransform(speedY, (s: number) => 1 + s * 0.07), SPRING_BODY);
  const squash = useSpring(useTransform(speedY, (s: number) => 1 - s * 0.05), SPRING_BODY);

  return (
    <motion.article
      ref={setRefs}
      data-card-id={contact.id}
      layout={isDragging ? false : "position"}
      drag
      dragSnapToOrigin
      dragElastic={0.14}
      dragMomentum={false}
      dragTransition={DRAG_RETURN}
      whileDrag={reduce ? undefined : { scale: 1.045 }}
      onDragStart={() => onDragStart(contact.id, node.current?.offsetHeight ?? 0)}
      onDrag={(event, info) => onDrag(contact.id, event, info)}
      onDragEnd={(event, info) => onDragEnd(contact, event, info)}
      initial={justLanded ? { scale: 1.14, opacity: 0.7 } : { scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.94, opacity: 0, transition: { duration: 0.14 } }}
      transition={justLanded && !reduce ? SPRING_LAND : SPRING_GRAB}
      style={{
        x,
        y,
        rotate: reduce ? 0 : tilt,
        scaleX: reduce ? 1 : squash,
        scaleY: reduce ? 1 : stretch,
        zIndex: isDragging ? 40 : 1,
        position: "relative",
      }}
      onClick={() => {
        // The click a drop leaves behind is the drop, not a tap on the card.
        if (isDropClick()) return;
        onEdit(contact);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(contact);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={contact.name}
      className={cn(
        "kpi-card group touch-none rounded-xl border p-3 text-left outline-none",
        "transition-[border-color,box-shadow] duration-200",
        "focus-visible:ring-[3px] focus-visible:ring-[var(--btn-focus-ring)]",
        PLATE,
        isDragging
          ? "cursor-grabbing border-input shadow-[0_18px_38px_-16px_oklch(0_0_0/0.3),var(--shadow-inset)]"
          : "cursor-grab border-border hover:border-input hover:shadow-[var(--shadow-elevated),var(--shadow-inset)]",
      )}
    >
      <div className="kpi-plate">
        <div className={cn("flex gap-3", hasContactLine ? "items-start" : "items-center")}>
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground shadow-[var(--shadow-inset)]"
          >
            {initialsOf(contact.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{contact.name}</p>
            {hasContactLine ? (
              // The source already has its own chip below — repeating it here
              // just gave every channel-only contact the same line twice.
              <p className="truncate text-xs text-muted-foreground">{contact.phone || contact.email}</p>
            ) : null}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(contact.id);
                }}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-[background-color,color,opacity,transform] duration-150 active:scale-90 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                aria-label={t("crm.delete")}
              >
                <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("crm.delete")}</TooltipContent>
          </Tooltip>
        </div>

        {contact.lastMessage ? (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground/85">{contact.lastMessage}</p>
        ) : null}

        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-[var(--shadow-inset)]">
            {contactSourceLabel(t, contact.source)}
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {relativeTime(contact.lastMessageAt, locale)}
          </span>
        </div>

        {/* Keyboard- and touch-reachable equivalent of the drag. Collapsed to
            zero height until the card is hovered or focused, so a resting
            column is a stack of facts rather than a stack of controls. */}
        <div
          className={cn(
            "grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity,margin] duration-200 ease-[var(--btn-easing)]",
            "group-hover:mt-2 group-hover:grid-rows-[1fr] group-hover:opacity-100",
            "group-focus-within:mt-2 group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100",
            "[@media(hover:none)]:mt-2 [@media(hover:none)]:grid-rows-[1fr] [@media(hover:none)]:opacity-100",
          )}
        >
          <div className="flex flex-wrap gap-1 overflow-hidden">
            {CRM_COLUMNS.filter((s) => s !== contact.status).map((targetStatus) => (
              <button
                key={targetStatus}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(contact.id, targetStatus);
                }}
                aria-label={t("crm.moveTo", { column: t(`contactStatus.${targetStatus}`) })}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border border-border bg-card px-1.5 py-1 text-[11px] font-medium text-muted-foreground",
                  "shadow-[var(--shadow-inset)] transition-[background-color,border-color,color,transform] duration-150",
                  "ease-[var(--btn-easing)] hover:border-input hover:bg-accent hover:text-foreground active:scale-[0.96]",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--btn-focus-ring)]",
                )}
              >
                {t(`contactStatus.${targetStatus}`)}
                <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.article>
  );
});
