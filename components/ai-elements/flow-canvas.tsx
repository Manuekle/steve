"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  ZoomInIcon,
  ZoomOutIcon,
  ArrowExpandIcon,
  MagicWand01Icon,
  PencilEdit01Icon,
  Delete02Icon,
  GitBranchIcon,
  Link01Icon,
  Unlink01Icon,
  PlayIcon,
  ToggleOffIcon,
  ToggleOnIcon,
  MoreHorizontalIcon,
  DashedLine01Icon,
  FlowchartIcon,
  FlowConnectionIcon,
} from "@hugeicons/core-free-icons";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { layoutChain, NODE_W, NODE_H, type LayoutSlot, type XY } from "@/lib/workflow-layout";

/** `useLayoutEffect` that doesn't warn during SSR, where there's no layout to
 *  read and the effect never runs anyway. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
import {
  anchorOn,
  backOff,
  edgeGeometry,
  pickSides,
  pointOnGeometry,
  type EdgeShape,
  type NodeRect,
  type Side,
} from "@/lib/flow-edge-path";
import { isAncestorPath, pathsEqual, type StepPath } from "@/lib/workflow-tree";
import {
  STEP_CATEGORY_KEYS,
  STEP_EMPTY_KEYS,
  STEP_ICONS,
  STEP_LABEL_KEYS,
  stepPreview,
} from "@/lib/workflow-step-meta";
import { useT } from "@/lib/i18n/provider";
import type { WorkflowStep, WorkflowStepType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { StepPalette } from "./step-palette";
import { FlowPlusMenu } from "./flow-plus-menu";

const PADDING = 72;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
// Fit-to-view has a tighter range than manual zoom: below ~0.6 the node text
// stops being readable, so a big flow is better framed by panning than by
// shrinking it into illegibility.
const FIT_MIN = 0.6;
const FIT_MAX = 1;
const DRAG_THRESHOLD = 4;
// Half the "+" affordance (size-7 = 28px). Connectors stop this far short of a
// slot so the line meets the button's edge instead of its middle.
const SLOT_R = 14;
/** Where the Sí/No pill parks along a forked connector. */
const EDGE_LABEL_T = 0.28;
/** How far back from the target port the direction arrow starts, in px. */
const ARROW_LEN = 11;

const key = (path: StepPath) => path.join("/");
/** Arrow-key step for the selected node, in flow px. Shift multiplies it. */
const KEY_NUDGE = 8;
const KEY_NUDGE_LARGE = 48;
const MINIMAP_W = 168;
const MINIMAP_H = 112;
const MINIMAP_PAD = 8;
const PORT_SIDES: readonly Side[] = ["top", "right", "bottom", "left"];
const QUICK_TYPES = ["message", "condition", "ai_response"] as const;

const addXY = (a: XY, b: XY): XY => ({ x: a.x + b.x, y: a.y + b.y });
const rectOf = (top: XY): NodeRect => ({ x: top.x, y: top.y, w: NODE_W, h: NODE_H });
/** A slot behaves like a tiny node for routing: it has a box and four sides. */
const slotRectOf = (center: XY): NodeRect => ({
  x: center.x,
  y: center.y - SLOT_R,
  w: SLOT_R * 2,
  h: SLOT_R * 2,
});

/** Inline controls derived from a drawn connector. */
type EdgeSlot = {
  readonly edgeId: string;
  readonly parentPath: StepPath;
  readonly index: number;
  readonly x: number; // a point ON the connector, not on its chord
  readonly y: number;
  /** The step this connector runs into — the one a disconnect would detach. */
  readonly toPath: StepPath;
  /** False for the very first step of the flow, which has nothing to detach from. */
  readonly canDisconnect: boolean;
  readonly dashed: boolean;
};

/** What a right-click landed on, so one context menu can serve the whole canvas. */
type MenuTarget =
  | { readonly kind: "node"; readonly path: StepPath }
  | { readonly kind: "edge"; readonly slot: EdgeSlot }
  | { readonly kind: "canvas"; readonly at: XY };

/** Where a picked step type should be inserted. */
type PaletteTarget =
  | { readonly kind: "tree"; readonly parentPath: StepPath; readonly index: number }
  | { readonly kind: "free"; readonly at: XY };

/** The side of `rect` a loose point is closest to — used while dragging a link. */
function nearestSide(rect: NodeRect, point: XY): Side {
  const dx = point.x - rect.x;
  const dy = point.y - (rect.y + rect.h / 2);
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? "bottom" : "top";
  return dx >= 0 ? "right" : "left";
}

export function FlowCanvas({
  steps,
  selectedPath,
  onSelect,
  onAddStep,
  onAddStepAt,
  onRemoveStep,
  onMoveNode,
  onResetLayout,
  onIsolateStep,
  onConnectSteps,
  onToggleDisabled,
  onSetConnector,
  onRunStep,
  embedded = false,
  heightClassName = "h-[420px]",
  containerClassName,
}: {
  readonly steps: readonly WorkflowStep[];
  readonly selectedPath: StepPath | null;
  readonly onSelect: (path: StepPath | null) => void;
  readonly onAddStep: (parentPath: StepPath, index: number, type: WorkflowStepType) => void;
  /** Drop a standalone step onto the canvas at a point — right-click / quick-add. */
  readonly onAddStepAt: (type: WorkflowStepType, position: XY) => void;
  /** Delete one step from the flow. */
  readonly onRemoveStep: (path: StepPath) => void;
  /** Commit a dragged node's position (flow coordinates, node top-centre). */
  readonly onMoveNode: (path: StepPath, position: XY) => void;
  /** Drop every manual position and fall back to auto-layout. */
  readonly onResetLayout: () => void;
  /**
   * Toggle a step's isolated flag. When isolated=true the step's incoming
   * connector is hidden — it floats on the canvas as an independent flow.
   */
  readonly onIsolateStep: (path: StepPath, isolated: boolean) => void;
  /**
   * Wire one step to another: `target` becomes the step that runs right after
   * `source`. Dragging from a node's port onto another node is the gesture.
   */
  readonly onConnectSteps: (source: StepPath, target: StepPath) => void;
  /** Mute a step: it stays on the canvas but is skipped when the flow runs. */
  readonly onToggleDisabled: (path: StepPath, disabled: boolean) => void;
  /** Line style of the connector running INTO `path`. */
  readonly onSetConnector: (path: StepPath, connector: "solid" | "dashed") => void;
  /** Run this one step on its own. */
  readonly onRunStep: (path: StepPath) => void;
  /**
   * The canvas is inside a scrolling page rather than filling one.
   *
   * A workspace is entitled to swallow the wheel: it is the whole window, and
   * there is nothing behind it to scroll. Embedded in a page there is, and a
   * canvas that eats the wheel is a scroll trap — the visitor rolls past it
   * and the page stays put while the flow slides around underneath. So the
   * plain wheel is left to the document and only ctrl/⌘+wheel zooms, which is
   * the bargain every embedded map and diagram makes. Touch gets the same
   * treatment: `pan-y` keeps a vertical swipe scrolling the page.
   */
  readonly embedded?: boolean;
  /** Tailwind height class for the pan viewport. Default 420px (modal-sized). */
  readonly heightClassName?: string;
  /** Extra classes for the framing element — pass `rounded-none border-0` to go full-bleed. */
  readonly containerClassName?: string;
}) {
  const t = useT();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [edgeShape, setEdgeShape] = useState<EdgeShape>("orthogonal");
  const [palette, setPalette] = useState<PaletteTarget | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [drag, setDrag] = useState<{ path: StepPath; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  // False for the one commit where the canvas origin shifts under the flow —
  // that pan is bookkeeping, not a move, and animating it is the lurch.
  const [viewAnimated, setViewAnimated] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  // Measured, not read on demand: the minimap needs it during render to draw
  // the "what you're looking at" rectangle.
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  // Space held = pan tool, the way every canvas app does it. Dragging a node
  // is suspended while it's down, so a space-drag over a card pans instead of
  // moving it.
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  // An in-progress connection: dragged out of `from`'s `fromSide` port,
  // currently at flow point (x, y), hovering `over` when inside a node.
  const [link, setLink] = useState<{
    readonly from: StepPath;
    readonly fromSide: Side;
    readonly x: number;
    readonly y: number;
    readonly over: StepPath | null;
  } | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const dragRef = useRef<{ path: StepPath; startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );
  const movedRef = useRef(false);
  const userAdjustedRef = useRef(false);
  // Set by whichever inner element a right-click hit; the viewport's own
  // handler reads it on the way up and falls back to "empty canvas".
  const claimedRef = useRef<MenuTarget | null>(null);

  // Layout starts at y:0 with no entry anchor — no trigger node at the top.
  const layout = useMemo(() => layoutChain(steps, [], 0, 0, null), [steps]);

  const stepByPath = useMemo(() => {
    const map = new Map<string, WorkflowStep>();
    for (const node of layout.nodes) map.set(key(node.path), node.step);
    return map;
  }, [layout]);

  // Auto-layout coordinates, keyed by tree address. Anything a person has
  // dragged overrides these; everything else still flows from the tree.
  const autoPos = useMemo(() => {
    const map = new Map<string, XY>();
    for (const node of layout.nodes) map.set(key(node.path), { x: node.x, y: node.y });
    return map;
  }, [layout]);

  const storedPos = useMemo(() => {
    const map = new Map<string, XY>();
    for (const node of layout.nodes) {
      if (node.step.position) map.set(key(node.path), node.step.position);
    }
    return map;
  }, [layout]);

  const positionOf = useCallback(
    (path: StepPath): XY => {
      const id = key(path);
      if (drag && pathsEqual(drag.path, path)) return { x: drag.x, y: drag.y };
      return storedPos.get(id) ?? autoPos.get(id) ?? { x: 0, y: 0 };
    },
    [drag, storedPos, autoPos],
  );

  /** How far a node sits from where auto-layout would have put it. */
  const offsetOf = useCallback(
    (path: StepPath | null | undefined): XY => {
      if (!path) return { x: 0, y: 0 };
      const auto = autoPos.get(key(path));
      if (!auto) return { x: 0, y: 0 };
      const actual = positionOf(path);
      return { x: actual.x - auto.x, y: actual.y - auto.y };
    },
    [autoPos, positionOf],
  );

  /** True once a node sits somewhere other than where auto-layout put it. */
  const isMoved = useCallback(
    (path: StepPath | null | undefined) => {
      if (!path) return false;
      const o = offsetOf(path);
      return o.x !== 0 || o.y !== 0;
    },
    [offsetOf],
  );

  const slotPos = useCallback(
    (slot: LayoutSlot): XY => addXY({ x: slot.x, y: slot.y }, offsetOf(slot.fromPath)),
    [offsetOf],
  );

  // ── Connectors ───────────────────────────────────────────────────
  // Every connector leaves a port along its normal, turns at right angles and
  // arrives straight into the target port; `edgeShape` swaps the corners for a
  // single bezier sweep without changing which ports are used.
  const edges = useMemo(() => {
    // Source dots mark where a connector leaves a port. A fork's two branches
    // share one port, so without de-duplication their dots stack and render
    // twice as dark as every other one; a merge point isn't a port at all, so
    // it gets no dot.
    const dotted = new Set<string>();
    return layout.edges.map((edge, i) => {
      const fromRect = edge.fromPath ? rectOf(positionOf(edge.fromPath)) : rectOf(edge.from);

      // After a fork, layout hands us the merge point below the taller branch
      // rather than the condition's own bottom; re-deriving it from the port
      // would drag the line back up through the branches, so the layout's
      // anchor wins until someone drags the node.
      const useMerge = edge.fromMerge === true && !isMoved(edge.fromPath);
      const mergeRect = slotRectOf(addXY(edge.from, offsetOf(edge.fromPath)));

      const toSlot = edge.toSlot;
      const slotMatch = toSlot
        ? layout.slots.find((s) => key(s.path) === key(toSlot.path) && s.index === toSlot.index)
        : undefined;
      const toRect = edge.toPath
        ? rectOf(positionOf(edge.toPath))
        : slotRectOf(slotMatch ? slotPos(slotMatch) : edge.to);

      // A fork's two branches, and whatever follows the fork, always run
      // downward into their columns. Letting geometry choose here sent a
      // short, wide branch out of the condition's SIDE and back into the
      // slot's other side — an S-curve that reads as a routing mistake.
      const downward = edge.label !== undefined || useMerge;
      const [pickedFrom, pickedTo] = pickSides(useMerge ? mergeRect : fromRect, toRect);
      const fromSide: Side = downward ? "bottom" : pickedFrom;
      const toSide: Side = downward ? "top" : pickedTo;
      const from = useMerge ? addXY(edge.from, offsetOf(edge.fromPath)) : anchorOn(fromRect, fromSide);
      const rawTo = anchorOn(toRect, toSide);
      // A connector into a "+" stops at the button's edge, not its middle.
      const to = edge.toPath ? rawTo : backOff(from, rawTo, 2);

      const target = edge.toPath ? stepByPath.get(key(edge.toPath)) : undefined;
      const anchorId = `${Math.round(from.x)},${Math.round(from.y)}`;
      const showSourceDot = !useMerge && !dotted.has(anchorId);
      dotted.add(anchorId);
      return {
        ...edge,
        id: i,
        geom: edgeGeometry(from, fromSide, to, toSide, edgeShape),
        from,
        to,
        fromSide,
        toSide,
        showSourceDot,
        // A connector into a "+" is a placeholder, and borrows the tails'
        // finer dash so it doesn't read as a user-set dashed connector.
        dashed: edge.toPath ? target?.connector === "dashed" : false,
        placeholder: !edge.toPath,
        muted: target?.disabled === true,
      };
    });
  }, [layout, positionOf, slotPos, offsetOf, isMoved, edgeShape, stepByPath]);

  const edgeSlots = useMemo<EdgeSlot[]>(() => {
    return edges.flatMap((edge) => {
      if (!edge.toPath) return [];
      const toPath = edge.toPath;
      const lastSeg = toPath[toPath.length - 1];
      if (typeof lastSeg !== "number") return [];
      const { point } = pointOnGeometry(edge.geom, 0.5);
      return [
        {
          edgeId: `edge::${edge.id}::${key(toPath)}`,
          parentPath: toPath.slice(0, -1) as StepPath,
          index: lastSeg, // insert before the target node
          x: point.x,
          y: point.y,
          toPath,
          // The very first step of the whole flow has no predecessor to cut.
          canDisconnect: toPath.length > 1 || lastSeg > 0,
          dashed: edge.dashed,
        },
      ];
    });
  }, [edges]);

  // ── Viewport bounds ──────────────────────────────────────────────
  // Where a node rests once the pointer is up. Bounds are measured from these
  // rather than from the live drag: growing the canvas mid-drag re-origins
  // `toLocal`, which slides the whole flow out from under the pointer.
  const restingPos = useCallback(
    (path: StepPath): XY => storedPos.get(key(path)) ?? autoPos.get(key(path)) ?? { x: 0, y: 0 },
    [storedPos, autoPos],
  );

  const bounds = useMemo(() => {
    const nodePositions = layout.nodes.map((n) => restingPos(n.path));
    const slotPositions = layout.slots.map((slot) => {
      const auto = slot.fromPath ? autoPos.get(key(slot.fromPath)) : undefined;
      if (!auto || !slot.fromPath) return { x: slot.x, y: slot.y };
      const rest = restingPos(slot.fromPath);
      return { x: slot.x + rest.x - auto.x, y: slot.y + rest.y - auto.y };
    });
    const xs = [0, ...nodePositions.map((p) => p.x), ...slotPositions.map((p) => p.x)];
    const ys = [
      0,
      ...nodePositions.flatMap((p) => [p.y, p.y + NODE_H]),
      ...slotPositions.flatMap((p) => [p.y - SLOT_R, p.y + SLOT_R]),
    ];
    const minX = Math.min(...xs) - NODE_W / 2 - PADDING;
    const maxX = Math.max(...xs) + NODE_W / 2 + PADDING;
    // A node dragged above the first step still has to fit on the canvas.
    const minY = Math.min(...ys) - PADDING;
    const maxY = Math.max(...ys) + PADDING;
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  }, [layout, autoPos, restingPos]);

  const toLocal = useCallback(
    (p: XY): XY => ({ x: p.x - bounds.minX, y: p.y - bounds.minY }),
    [bounds.minX, bounds.minY],
  );
  /** Shift generated path data out of flow space into the SVG's own box. */
  const localPath = useCallback(
    (d: string) =>
      d.replace(
        /(-?[\d.]+) (-?[\d.]+)/g,
        (_m, x: string, y: string) => `${Number(x) - bounds.minX} ${Number(y) - bounds.minY}`,
      ),
    [bounds.minX, bounds.minY],
  );

  /** Pointer client coordinates → flow coordinates. */
  const toFlow = useCallback(
    (clientX: number, clientY: number): XY => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom + bounds.minX,
        y: (clientY - rect.top - pan.y) / zoom + bounds.minY,
      };
    },
    [pan.x, pan.y, zoom, bounds.minX, bounds.minY],
  );

  // Scale + centre the whole flow inside the viewport, so a flow taller than
  // the canvas doesn't leave nodes (and their "+" slots) out of reach.
  const fitView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw === 0 || vh === 0) return;
    const next = Math.min(FIT_MAX, Math.max(FIT_MIN, Math.min(vw / bounds.width, vh / bounds.height)));
    setZoom(next);
    setPan({ x: (vw - bounds.width * next) / 2, y: (vh - bounds.height * next) / 2 });
  }, [bounds.width, bounds.height]);

  // Refit while the user hasn't taken control of the view, so adding steps
  // keeps the flow framed instead of drifting off-canvas.
  useEffect(() => {
    if (userAdjustedRef.current || dragRef.current) return;
    fitView();
  }, [fitView]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setViewSize({ w: viewport.clientWidth, h: viewport.clientHeight });
      if (userAdjustedRef.current) return;
      fitView();
    });
    setViewSize({ w: viewport.clientWidth, h: viewport.clientHeight });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitView]);

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Adding a step or dragging one past the old edge moves the canvas origin,
  // and every `toLocal` result with it. Shift the pan by the same amount so
  // the view holds still instead of jumping sideways.
  const originRef = useRef<XY>({ x: bounds.minX, y: bounds.minY });
  useIsomorphicLayoutEffect(() => {
    const prev = originRef.current;
    const dx = bounds.minX - prev.x;
    const dy = bounds.minY - prev.y;
    if (dx === 0 && dy === 0) return;
    originRef.current = { x: bounds.minX, y: bounds.minY };
    // Until the user takes control of the view, fitView reframes anyway.
    if (!userAdjustedRef.current) return;
    // Before paint, and with the view transition suspended for this commit:
    // the compensating pan has to land in the SAME frame as the new origin.
    // As a passive effect with the 200ms transition live, dropping a node
    // past the old edge painted one frame at the wrong offset and then eased
    // back — the whole canvas lurching after a node move.
    setViewAnimated(false);
    setPan((p) => ({ x: p.x + dx * zoomRef.current, y: p.y + dy * zoomRef.current }));
  }, [bounds.minX, bounds.minY]);

  // Restore the transition once that frame is on screen, so deliberate view
  // moves (fit, zoom buttons) still ease.
  useEffect(() => {
    if (viewAnimated) return;
    const id = requestAnimationFrame(() => setViewAnimated(true));
    return () => cancelAnimationFrame(id);
  }, [viewAnimated]);

  // Wheel has to be a native, non-passive listener: React registers its own
  // wheel handlers as passive, where preventDefault is ignored (and logs).
  // Plain wheel pans, shift+wheel pans sideways, ctrl/⌘+wheel zooms toward
  // the pointer.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Embedded, a bare wheel belongs to the page behind the canvas.
      if (embedded && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      userAdjustedRef.current = true;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const z = zoomRef.current;
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.0015 * z));
        setPan((p) => ({ x: px - ((px - p.x) / z) * next, y: py - ((py - p.y) / z) * next }));
        setZoom(next);
        return;
      }
      setPan((p) => ({
        x: p.x - (e.shiftKey ? e.deltaY : e.deltaX),
        y: p.y - (e.shiftKey ? 0 : e.deltaY),
      }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [embedded]);

  // ── Panning ──────────────────────────────────────────────────────
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || dragRef.current) return;
    movedRef.current = false;
    panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const dx = (e.clientX - dragRef.current.startX) / zoom;
      const dy = (e.clientY - dragRef.current.startY) / zoom;
      if (Math.abs(dx * zoom) > DRAG_THRESHOLD || Math.abs(dy * zoom) > DRAG_THRESHOLD) movedRef.current = true;
      setDrag({
        path: dragRef.current.path,
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      });
      return;
    }
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      movedRef.current = true;
      userAdjustedRef.current = true;
      // Only now does the cursor become a grabbing hand: an idle canvas keeps
      // the normal arrow, so the surface doesn't read as one big drag handle.
      setPanning(true);
    }
    setPan({ x: panRef.current.panX + dx, y: panRef.current.panY + dy });
  };
  const handlePointerUp = () => {
    if (dragRef.current) {
      const { path } = dragRef.current;
      dragRef.current = null;
      if (drag && movedRef.current) {
        userAdjustedRef.current = true;
        onMoveNode(path, { x: drag.x, y: drag.y });
      }
      setDrag(null);
    }
    panRef.current = null;
    setPanning(false);
  };
  const handleBackgroundClick = () => {
    if (movedRef.current) return;
    onSelect(null);
    setPlusOpen(false);
  };
  const nudgeZoom = (delta: number) => {
    userAdjustedRef.current = true;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
  };
  const resetView = useCallback(() => {
    userAdjustedRef.current = false;
    fitView();
  }, [fitView]);
  const autoLayout = useCallback(() => {
    onResetLayout();
    userAdjustedRef.current = false;
  }, [onResetLayout]);
  /** Put a flow point in the middle of the viewport — the minimap's job. */
  const centreOn = useCallback(
    (point: XY) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      userAdjustedRef.current = true;
      setPan({
        x: viewport.clientWidth / 2 - (point.x - bounds.minX) * zoom,
        y: viewport.clientHeight / 2 - (point.y - bounds.minY) * zoom,
      });
    },
    [bounds.minX, bounds.minY, zoom],
  );

  // ── Keyboard ─────────────────────────────────────────────────────
  // The canvas is focusable, so once you have clicked into it the arrow keys
  // nudge the selected node instead of scrolling the page.
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === " ") {
      // Without this the page scrolls and the button under focus activates.
      e.preventDefault();
      setSpaceHeld(true);
      return;
    }
    const nudge = e.shiftKey ? KEY_NUDGE_LARGE : KEY_NUDGE;
    const arrows: Record<string, XY> = {
      ArrowUp: { x: 0, y: -nudge },
      ArrowDown: { x: 0, y: nudge },
      ArrowLeft: { x: -nudge, y: 0 },
      ArrowRight: { x: nudge, y: 0 },
    };
    const delta = arrows[e.key];
    if (delta) {
      e.preventDefault();
      if (selectedPath) {
        const from = positionOf(selectedPath);
        userAdjustedRef.current = true;
        onMoveNode(selectedPath, { x: from.x + delta.x, y: from.y + delta.y });
      } else {
        // Nothing selected: the arrows pan the canvas instead.
        userAdjustedRef.current = true;
        setPan((p) => ({ x: p.x - delta.x, y: p.y - delta.y }));
      }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedPath) {
      e.preventDefault();
      onRemoveStep(selectedPath);
      return;
    }
    if (e.key === "Escape") {
      onSelect(null);
      setPlusOpen(false);
      return;
    }
    if (e.key === "0" || e.key.toLowerCase() === "f") {
      e.preventDefault();
      resetView();
      return;
    }
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      nudgeZoom(0.15);
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      nudgeZoom(-0.15);
    }
  };

  // ── Node dragging ────────────────────────────────────────────────
  const startNodeDrag = (e: ReactPointerEvent<HTMLElement>, path: StepPath) => {
    if (e.button !== 0) return;
    // Space held: the pointer is a pan tool, so let the press fall through to
    // the canvas instead of picking the card up.
    if (spaceHeld) return;
    e.stopPropagation();
    const origin = positionOf(path);
    movedRef.current = false;
    // Capture on the node itself: a fast drag can outrun the pointer, and
    // without capture the move events stop reaching the canvas.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { path, startX: e.clientX, startY: e.clientY, originX: origin.x, originY: origin.y };
    setDrag({ path, x: origin.x, y: origin.y });
  };

  // ── Connecting two steps ─────────────────────────────────────────
  /** The node under a flow point. The link's own subtree is skipped — a step
   *  can't be wired to run after itself or after one of its own branches. */
  const nodeUnder = useCallback(
    (point: XY, source: StepPath): StepPath | null => {
      for (let i = layout.nodes.length - 1; i >= 0; i -= 1) {
        const node = layout.nodes[i]!;
        if (isAncestorPath(source, node.path)) continue;
        const top = positionOf(node.path);
        if (
          point.x >= top.x - NODE_W / 2 &&
          point.x <= top.x + NODE_W / 2 &&
          point.y >= top.y &&
          point.y <= top.y + NODE_H
        ) {
          return node.path;
        }
      }
      return null;
    },
    [layout.nodes, positionOf],
  );

  const startLink = (e: ReactPointerEvent<HTMLElement>, path: StepPath, side: Side) => {
    if (e.button !== 0 || spaceHeld) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // Suppress the click that follows, or releasing the port selects a node.
    movedRef.current = true;
    const point = toFlow(e.clientX, e.clientY);
    setLink({ from: path, fromSide: side, x: point.x, y: point.y, over: null });
  };
  const moveLink = (e: ReactPointerEvent<HTMLElement>) => {
    if (!link) return;
    e.stopPropagation();
    const point = toFlow(e.clientX, e.clientY);
    setLink({ ...link, x: point.x, y: point.y, over: nodeUnder(point, link.from) });
  };
  const endLink = (e: ReactPointerEvent<HTMLElement>) => {
    if (!link) return;
    e.stopPropagation();
    if (link.over) onConnectSteps(link.from, link.over);
    setLink(null);
  };

  // ── Step palette ─────────────────────────────────────────────────
  const canvasCentre = (): XY => ({
    x: bounds.minX + bounds.width / 2,
    y: bounds.minY + bounds.height / 2,
  });
  const pickStep = (type: WorkflowStepType) => {
    if (!palette) return;
    if (palette.kind === "free") onAddStepAt(type, palette.at);
    else onAddStep(palette.parentPath, palette.index, type);
    setPalette(null);
  };

  const slotKey = (slot: LayoutSlot) => `${key(slot.path)}::${slot.index}`;

  const menuStep = menuTarget?.kind === "node" ? stepByPath.get(key(menuTarget.path)) : undefined;
  const menuCanDisconnect =
    menuTarget?.kind === "node" &&
    (menuTarget.path.length > 1 || menuTarget.path[menuTarget.path.length - 1] !== 0);

  return (
    <div
      role="application"
      aria-label={t("automations.canvasLabel")}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border",
        "bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:20px_20px]",
        containerClassName,
      )}
    >
      <ContextMenu onOpenChange={(open) => !open && setMenuTarget(null)}>
        <ContextMenuTrigger asChild>
          <div
            ref={viewportRef}
            className={cn(
              heightClassName,
              // Focusing the canvas must not paint a browser focus ring across
              // the whole workspace, and dragging must not smear a text
              // selection over every node label.
              "select-none outline-none",
              embedded ? "touch-pan-y" : "touch-none",
              // Clicking in shouldn't paint anything, but a keyboard user has
              // to be able to tell the canvas is the thing listening.
              "focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]",
              // The canvas is not a hand-tool surface: it keeps the normal
              // pointer, and only becomes a hand once space is held or a pan
              // or node drag is actually under way.
              drag || panning ? "cursor-grabbing" : spaceHeld ? "cursor-grab" : "cursor-default",
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClick={handleBackgroundClick}
            // Focusable so the shortcuts have somewhere to land. It is a
            // role="application" surface, so it takes focus as a whole rather
            // than exposing every node in the tab order.
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => {
              if (e.key === " ") setSpaceHeld(false);
            }}
            // Losing focus mid-hold would otherwise leave the pan tool stuck on.
            onBlur={() => setSpaceHeld(false)}
            onContextMenu={(e) => {
              // Inner elements claim the event on the way up; anything left
              // unclaimed was a right-click on empty canvas.
              const claimed = claimedRef.current;
              claimedRef.current = null;
              setMenuTarget(claimed ?? { kind: "canvas", at: toFlow(e.clientX, e.clientY) });
            }}
          >
            <div
              className="relative origin-top-left"
              style={{
                width: bounds.width,
                height: bounds.height,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                // Panning and dragging must track the pointer 1:1, not lag
                // behind a transition.
                transition:
                  panRef.current || dragRef.current || !viewAnimated
                    ? "none"
                    : "transform 200ms ease-out",
              }}
            >
              {/* ── SVG layer: connectors, dashed tails, link preview ── */}
              <svg
                className="absolute inset-0 overflow-visible"
                width={bounds.width}
                height={bounds.height}
                aria-hidden="true"
                style={{ pointerEvents: "none" }}
              >
                {edges.map((edge) => {
                  const label = edge.label ? toLocal(pointOnGeometry(edge.geom, EDGE_LABEL_T).point) : null;
                  const source = toLocal(edge.from);
                  // The arrowhead sits just inside the target port, where it
                  // can never collide with the midpoint controls.
                  const head = edge.toPath ? toLocal(edge.to) : null;
                  const angle = edge.toSide === "top" ? 90 : edge.toSide === "bottom" ? -90 : edge.toSide === "left" ? 0 : 180;
                  return (
                    <g key={edge.id} opacity={edge.muted ? 0.4 : 1}>
                      <path
                        className={drag || link ? undefined : "flow-edge"}
                        style={{ ["--edge-len" as string]: "1400" }}
                        d={localPath(edge.geom.d)}
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={edge.dashed ? "5 5" : edge.placeholder ? "3 5" : undefined}
                      />
                      {edge.showSourceDot ? (
                        <circle cx={source.x} cy={source.y} r={2.5} fill="var(--muted-foreground)" opacity={0.4} />
                      ) : null}
                      {head ? <ArrowHead x={head.x} y={head.y} angle={angle} /> : null}
                      {edge.label && label ? <EdgeLabel x={label.x} y={label.y} label={edge.label} /> : null}
                    </g>
                  );
                })}

                {/* Dashed tails into each open "+" so no slot floats unattached */}
                {layout.slots.map((slot) => {
                  if (!slot.from) return null;
                  // `slot.from` is the layout's own anchor — for a chain tip
                  // after a condition that's the merge point below the
                  // branches, not the condition's bottom, so the tail can't
                  // cut back up through the fork.
                  const moved = slot.fromPath && isMoved(slot.fromPath);
                  const nodeTop = slot.fromPath ? positionOf(slot.fromPath) : null;
                  const source =
                    moved && nodeTop ? { x: nodeTop.x, y: nodeTop.y + NODE_H } : addXY(slot.from, offsetOf(slot.fromPath));
                  const target = slotPos(slot);
                  const geom = edgeGeometry(source, "bottom", backOff(source, target, SLOT_R + 2), "top", edgeShape);
                  return (
                    <path
                      key={`tail-${slotKey(slot)}`}
                      d={localPath(geom.d)}
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth={1.5}
                      strokeDasharray="3 5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}

                {/* Connection being dragged out of a port. Snaps to the
                    nearest side of whatever node it's over. */}
                {link
                  ? (() => {
                      const from = anchorOn(rectOf(positionOf(link.from)), link.fromSide);
                      const targetRect = link.over ? rectOf(positionOf(link.over)) : null;
                      const toSide: Side = targetRect ? nearestSide(targetRect, from) : "top";
                      const to = targetRect ? anchorOn(targetRect, toSide) : { x: link.x, y: link.y };
                      const geom = edgeGeometry(from, link.fromSide, to, toSide, edgeShape);
                      const a = toLocal(from);
                      const b = toLocal(to);
                      return (
                        <g>
                          <path
                            d={localPath(geom.d)}
                            fill="none"
                            stroke="var(--foreground)"
                            strokeOpacity={link.over ? 0.65 : 0.35}
                            strokeWidth={1.5}
                            strokeDasharray="5 4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx={a.x} cy={a.y} r={3} fill="var(--foreground)" opacity={0.55} />
                          {link.over ? (
                            <circle cx={b.x} cy={b.y} r={3.5} fill="var(--foreground)" opacity={0.55} />
                          ) : null}
                        </g>
                      );
                    })()
                  : null}
              </svg>

              {/* ── Step nodes ── */}
              {layout.nodes.map((node, i) => {
                const pos = toLocal(positionOf(node.path));
                const id = key(node.path);
                const selected = pathsEqual(node.path, selectedPath);
                const dragging = !!drag && pathsEqual(drag.path, node.path);
                const linkSource = !!link && pathsEqual(link.from, node.path);
                const linkTarget = !!link && pathsEqual(link.over, node.path);
                const active = hovered === id || selected;
                const preview = stepPreview(node.step);
                const disabled = node.step.disabled === true;
                return (
                  <div
                    key={id}
                    className={cn("group absolute", dragging || linkSource || linkTarget ? "z-20" : null)}
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: NODE_W,
                      height: NODE_H,
                      // Layout hands out center-x; the wrapper owns the -50%.
                      transform: "translateX(-50%)",
                    }}
                    onPointerEnter={() => setHovered(id)}
                    onPointerLeave={() => setHovered((prev) => (prev === id ? null : prev))}
                    onContextMenu={() => {
                      claimedRef.current = { kind: "node", path: node.path };
                    }}
                  >
                    <div
                      className="flow-node relative h-full w-full"
                      style={{ animationDelay: `${Math.min(i * 35, 280)}ms` }}
                    >
                      <button
                        type="button"
                        aria-selected={selected}
                        aria-label={t(STEP_LABEL_KEYS[node.step.type])}
                        onPointerDown={(e) => startNodeDrag(e, node.path)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (movedRef.current) return;
                          onSelect(node.path);
                        }}
                        className={cn(
                          "flex h-full w-full cursor-grab flex-col overflow-hidden rounded-xl border bg-card text-left",
                          "transition-[border-color,box-shadow,transform,opacity] duration-200 ease-out",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/50",
                          disabled ? "border-dashed opacity-45" : null,
                          linkTarget
                            ? "border-foreground/50 shadow-[var(--shadow-float)]"
                            : dragging
                              ? "cursor-grabbing border-foreground/30 shadow-[var(--shadow-float)]"
                              : selected
                                ? "border-foreground/[0.15] shadow-[var(--shadow-elevated)]"
                                : "border-border shadow-[var(--shadow-soft)] hover:border-input hover:shadow-[var(--shadow-elevated)]",
                        )}
                      >
                        {/* Header. Selection reads as a filled bar here rather
                            than a stripe glued to the card's rounded edge. */}
                        <span
                          className={cn(
                            "flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-1.5 transition-colors duration-200",
                            selected ? "bg-foreground/[0.07]" : null,
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                              selected ? "bg-foreground text-background" : "bg-foreground/[0.06] text-foreground/70",
                            )}
                          >
                            <HugeiconsIcon
                              icon={STEP_ICONS[node.step.type]}
                              size={13}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {t(STEP_LABEL_KEYS[node.step.type])}
                          </span>
                          <span className="shrink-0 font-mono text-[9px] tracking-[0.12em] text-muted-foreground/60 uppercase">
                            {t(STEP_CATEGORY_KEYS[node.step.type])}
                          </span>
                        </span>
                        {/* Body. Selected already reads as one tinted block via
                            the header fill, so the divider only earns its keep
                            when that fill is absent — with both, it doubles up. */}
                        <span
                          className={cn(
                            "mx-3 mb-2.5 flex min-h-0 flex-1 items-center pt-2",
                            !selected ? "border-t border-border/70" : null,
                          )}
                        >
                          <span
                            className={cn(
                              "line-clamp-2 text-[11px] leading-snug",
                              preview ? "text-muted-foreground" : "text-muted-foreground/45 italic",
                            )}
                          >
                            {preview ?? t(STEP_EMPTY_KEYS[node.step.type])}
                          </span>
                        </span>
                      </button>

                      {/* Hover toolbar, riding above the card. It lives inside
                          the node's group so moving onto it keeps the node
                          hovered — a toolbar that vanishes when you reach for
                          it is worse than no toolbar. */}
                      <div
                        className={cn(
                          "flow-node-tools absolute -top-10 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5",
                          "rounded-full border border-border bg-card/95 p-1 shadow-[var(--shadow-float)] backdrop-blur-sm",
                        )}
                        data-open={active && !drag && !link}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <NodeTool icon={PlayIcon} label={t("automations.runStep")} onClick={() => onRunStep(node.path)} />
                        <NodeTool
                          icon={disabled ? ToggleOffIcon : ToggleOnIcon}
                          label={disabled ? t("automations.enableStep") : t("automations.disableStep")}
                          onClick={() => onToggleDisabled(node.path, !disabled)}
                        />
                        <NodeTool
                          icon={Delete02Icon}
                          label={t("automations.deleteStep")}
                          destructive
                          onClick={() => onRemoveStep(node.path)}
                        />
                        <NodeTool
                          icon={MoreHorizontalIcon}
                          label={t("automations.moreActions")}
                          onClick={(e) => {
                            // Reuse the canvas context menu: same items in the
                            // same place, whether you right-click or press it.
                            claimedRef.current = { kind: "node", path: node.path };
                            e.currentTarget.dispatchEvent(
                              new MouseEvent("contextmenu", {
                                bubbles: true,
                                clientX: e.clientX,
                                clientY: e.clientY,
                              }),
                            );
                          }}
                        />
                      </div>

                      {/* Four ports. Any of them starts a connection; the
                          connector picks its own sides once it lands. */}
                      {PORT_SIDES.map((side) => (
                        <button
                          key={side}
                          type="button"
                          aria-label={t("automations.connectStep")}
                          title={t("automations.connectStep")}
                          tabIndex={-1}
                          onPointerDown={(e) => startLink(e, node.path, side)}
                          onPointerMove={moveLink}
                          onPointerUp={endLink}
                          onPointerCancel={() => setLink(null)}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "absolute z-10 flex size-3.5 cursor-crosshair items-center justify-center rounded-full",
                            "border border-muted-foreground/40 bg-card",
                            "transition-[opacity,transform,border-color] duration-150 ease-out",
                            "hover:scale-125 hover:border-foreground/60",
                            // A hidden port must also be untouchable: at
                            // opacity 0 it still hit-tests, so clicking near a
                            // node's edge would silently start a connection.
                            link || active ? "opacity-100" : "pointer-events-none opacity-0",
                            side === "top" ? "-top-[7px] left-1/2 -translate-x-1/2" : null,
                            side === "bottom" ? "-bottom-[7px] left-1/2 -translate-x-1/2" : null,
                            side === "left" ? "top-1/2 -left-[7px] -translate-y-1/2" : null,
                            side === "right" ? "top-1/2 -right-[7px] -translate-y-1/2" : null,
                          )}
                        >
                          <span className="size-1 rounded-full bg-muted-foreground/70" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* ── Chain-tip / empty-branch "+" slots ── */}
              {layout.slots.map((slot) => {
                const pos = toLocal(slotPos(slot));
                return (
                  <div
                    key={slotKey(slot)}
                    className="absolute z-10"
                    // Centering lives here, not on the button and not in the
                    // entrance keyframe — with it in two places the "+" ended
                    // up a full radius off the line it hangs from.
                    style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flow-slot">
                      <button
                        type="button"
                        onClick={() => setPalette({ kind: "tree", parentPath: slot.path, index: slot.index })}
                        aria-label={t("automations.addStep")}
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full border border-dashed bg-card/80",
                          "border-muted-foreground/40 text-muted-foreground",
                          "transition-[transform,color,border-color,background-color] duration-200 ease-out",
                          "hover:scale-110 hover:border-foreground/40 hover:text-foreground",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/50",
                        )}
                      >
                        <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* ── Inline connector controls. Painted after the nodes and
                     pointer-transparent except on the controls themselves, so
                     the hover zone never steals a click from a card. ── */}
              {edgeSlots.map((es) => {
                const pos = toLocal({ x: es.x, y: es.y });
                const open = hoveredEdge === es.edgeId;
                return (
                  <div
                    key={es.edgeId}
                    className="pointer-events-none absolute z-10 flex items-center justify-center"
                    style={{ left: pos.x - 56, top: pos.y - 32, width: 112, height: 64 }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={() => {
                      claimedRef.current = { kind: "edge", slot: es };
                    }}
                  >
                    {/* The hover target has to be the pointer-reactive element:
                        a pointer-events-none parent never receives enter/leave.
                        Padding gives the closed dot a workable hit area. */}
                    <div
                      className="pointer-events-auto flex items-center justify-center p-3"
                      onPointerEnter={() => setHoveredEdge(es.edgeId)}
                      onPointerLeave={() => setHoveredEdge((p) => (p === es.edgeId ? null : p))}
                      onFocusCapture={() => setHoveredEdge(es.edgeId)}
                      onBlurCapture={() => setHoveredEdge((p) => (p === es.edgeId ? null : p))}
                    >
                      {/* Closed, this is a handle sitting on the connector;
                          hovered, the same surface morphs into a pill of
                          actions rather than popping two loose buttons up. */}
                      <div
                        className="t-morph border border-border bg-card/95 shadow-[var(--shadow-soft)] backdrop-blur-sm"
                        data-open={open}
                        style={
                          {
                            "--morph-w-closed": "10px",
                            "--morph-h-closed": "10px",
                            "--morph-r-closed": "5px",
                            "--morph-w-open": es.canDisconnect ? "70px" : "40px",
                            "--morph-h-open": "34px",
                            "--morph-r-open": "17px",
                            "--morph-slide": "18px",
                          } as CSSProperties
                        }
                      >
                        <span className="t-morph-plus" aria-hidden="true">
                          <span className="size-1 rounded-full bg-muted-foreground/70" />
                        </span>
                        <div className="t-morph-menu flex items-center justify-center gap-1">
                          <button
                            type="button"
                            tabIndex={open ? 0 : -1}
                            onClick={() => setPalette({ kind: "tree", parentPath: es.parentPath, index: es.index })}
                            aria-label={t("automations.insertStep")}
                            title={t("automations.insertStep")}
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground",
                              "transition-[background-color,color,transform] duration-150 ease-out active:scale-90",
                              "hover:bg-accent hover:text-foreground",
                              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50",
                            )}
                          >
                            <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                          {es.canDisconnect ? (
                            <button
                              type="button"
                              tabIndex={open ? 0 : -1}
                              onClick={() => onIsolateStep(es.toPath, true)}
                              aria-label={t("automations.disconnectStep")}
                              title={t("automations.disconnectStep")}
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/80",
                                "transition-[background-color,color,transform] duration-150 ease-out active:scale-90",
                                "hover:bg-destructive/10 hover:text-destructive",
                                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50",
                              )}
                            >
                              <HugeiconsIcon icon={Unlink01Icon} size={12} strokeWidth={1.75} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-56">
          {menuTarget?.kind === "node" ? (
            <>
              <ContextMenuItem onSelect={() => onSelect(menuTarget.path)}>
                <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
                {t("automations.editStep")}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onRunStep(menuTarget.path)}>
                <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={1.75} aria-hidden="true" />
                {t("automations.runStep")}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onToggleDisabled(menuTarget.path, !menuStep?.disabled)}>
                <HugeiconsIcon
                  icon={menuStep?.disabled ? ToggleOffIcon : ToggleOnIcon}
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {menuStep?.disabled ? t("automations.enableStep") : t("automations.disableStep")}
              </ContextMenuItem>
              {menuCanDisconnect ? (
                <>
                  <ContextMenuSeparator />
                  {menuStep?.isolated ? (
                    <ContextMenuItem onSelect={() => onIsolateStep(menuTarget.path, false)}>
                      <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
                      {t("automations.reconnectStep")}
                    </ContextMenuItem>
                  ) : (
                    <ContextMenuItem onSelect={() => onIsolateStep(menuTarget.path, true)}>
                      <HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={1.75} aria-hidden="true" />
                      {t("automations.isolateStep")}
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    onSelect={() =>
                      onSetConnector(menuTarget.path, menuStep?.connector === "dashed" ? "solid" : "dashed")
                    }
                  >
                    <HugeiconsIcon icon={DashedLine01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
                    {menuStep?.connector === "dashed"
                      ? t("automations.connectorSolid")
                      : t("automations.connectorDashed")}
                  </ContextMenuItem>
                </>
              ) : null}
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onSelect={() => onRemoveStep(menuTarget.path)}>
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
                {t("automations.deleteStep")}
              </ContextMenuItem>
            </>
          ) : menuTarget?.kind === "edge" ? (
            <>
              <ContextMenuItem
                onSelect={() =>
                  setPalette({ kind: "tree", parentPath: menuTarget.slot.parentPath, index: menuTarget.slot.index })
                }
              >
                <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
                {t("automations.insertStep")}
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => onSetConnector(menuTarget.slot.toPath, menuTarget.slot.dashed ? "solid" : "dashed")}
              >
                <HugeiconsIcon icon={DashedLine01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
                {menuTarget.slot.dashed ? t("automations.connectorSolid") : t("automations.connectorDashed")}
              </ContextMenuItem>
              {menuTarget.slot.canDisconnect ? (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onSelect={() => onIsolateStep(menuTarget.slot.toPath, true)}>
                    <HugeiconsIcon icon={Unlink01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
                    {t("automations.disconnectStep")}
                  </ContextMenuItem>
                </>
              ) : null}
            </>
          ) : (
            <>
              {QUICK_TYPES.map((type) => (
                <ContextMenuItem
                  key={type}
                  onSelect={() => {
                    if (menuTarget?.kind === "canvas") onAddStepAt(type, menuTarget.at);
                  }}
                >
                  <HugeiconsIcon icon={STEP_ICONS[type]} size={14} strokeWidth={1.75} aria-hidden="true" />
                  {t(STEP_LABEL_KEYS[type])}
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  if (menuTarget?.kind === "canvas") setPalette({ kind: "free", at: menuTarget.at });
                }}
              >
                <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
                {t("automations.allSteps")}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={resetView}>
                <HugeiconsIcon icon={ArrowExpandIcon} size={14} strokeWidth={1.75} aria-hidden="true" />
                {t("automations.resetView")}
              </ContextMenuItem>
              <ContextMenuItem onSelect={autoLayout}>
                <HugeiconsIcon icon={MagicWand01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
                {t("automations.autoLayout")}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Soft edges, so nodes dissolve into the canvas instead of being cut off */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-background/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/85 to-transparent" />

      <StepPalette open={palette !== null} onOpenChange={(o) => !o && setPalette(null)} onPick={pickStep} />

      {/* Overview, opposite corner from the quick-add: what the flow looks
          like whole, and where in it you currently are. */}
      <FlowMinimap
        className="absolute bottom-5 left-5 hidden sm:block"
        label={t("automations.minimap")}
        nodes={layout.nodes.map((n) => ({ id: key(n.path), ...positionOf(n.path) }))}
        selected={selectedPath ? key(selectedPath) : null}
        bounds={bounds}
        view={{
          x: bounds.minX - pan.x / zoom,
          y: bounds.minY - pan.y / zoom,
          w: viewSize.w / zoom,
          h: viewSize.h / zoom,
        }}
        onJump={centreOn}
      />

      {/* Quick-add. Drops a standalone node in the middle of the canvas. */}
      <FlowPlusMenu
        className="absolute right-5 bottom-5"
        open={plusOpen}
        onOpenChange={setPlusOpen}
        onPick={(type) => onAddStepAt(type, canvasCentre())}
        onMore={() => setPalette({ kind: "free", at: canvasCentre() })}
      />

      {/* Floating toolbar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-card/95 p-1 shadow-[var(--shadow-float)] backdrop-blur-sm">
          <ToolbarButton icon={ZoomOutIcon} label={t("automations.zoomOut")} onClick={() => nudgeZoom(-0.15)} />
          <button
            type="button"
            onClick={resetView}
            title={t("automations.resetView")}
            className="w-12 rounded-full py-1 text-center font-mono text-[11px] tabular-nums text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolbarButton icon={ZoomInIcon} label={t("automations.zoomIn")} onClick={() => nudgeZoom(0.15)} />
          <span className="h-6 w-px bg-border" aria-hidden="true" />
          <ToolbarButton
            icon={edgeShape === "orthogonal" ? FlowConnectionIcon : FlowchartIcon}
            label={edgeShape === "orthogonal" ? t("automations.edgesCurved") : t("automations.edgesSquared")}
            onClick={() => setEdgeShape((s) => (s === "orthogonal" ? "curved" : "orthogonal"))}
          />
          <ToolbarButton icon={ArrowExpandIcon} label={t("automations.resetView")} onClick={resetView} />
          <ToolbarButton icon={MagicWand01Icon} label={t("automations.autoLayout")} onClick={autoLayout} />
        </div>
      </div>
    </div>
  );
}

function NodeTool({
  icon,
  label,
  onClick,
  destructive,
}: {
  readonly icon: typeof PlayIcon;
  readonly label: string;
  readonly onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  readonly destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-muted-foreground",
            "transition-[background-color,color,transform] duration-150 ease-out active:scale-90",
            destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-accent hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50",
          )}
        >
          <HugeiconsIcon icon={icon} size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  readonly icon: typeof ZoomInIcon;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          data-cuelume-press
          data-cuelume-release
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50"
        >
          <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Overview of the whole flow with a rectangle marking what the viewport is
 * showing. Click or drag anywhere on it to jump there — cheaper than panning
 * a long flow by hand.
 */
function FlowMinimap({
  nodes,
  bounds,
  view,
  selected,
  onJump,
  label,
  className,
}: {
  readonly nodes: ReadonlyArray<{ readonly id: string } & XY>;
  readonly bounds: { readonly minX: number; readonly minY: number; readonly width: number; readonly height: number };
  readonly view: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly selected: string | null;
  readonly onJump: (point: XY) => void;
  readonly label: string;
  readonly className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const inner = { w: MINIMAP_W - MINIMAP_PAD * 2, h: MINIMAP_H - MINIMAP_PAD * 2 };
  // One scale for both axes, so the overview stays a true miniature.
  const k = Math.min(inner.w / Math.max(bounds.width, 1), inner.h / Math.max(bounds.height, 1));
  const ox = MINIMAP_PAD + (inner.w - bounds.width * k) / 2;
  const oy = MINIMAP_PAD + (inner.h - bounds.height * k) / 2;
  const px = (x: number) => ox + (x - bounds.minX) * k;
  const py = (y: number) => oy + (y - bounds.minY) * k;

  const jumpFromEvent = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The svg is drawn at its natural size but may be laid out smaller, so go
    // through the rendered rect rather than assuming 1:1.
    const localX = ((clientX - rect.left) / rect.width) * MINIMAP_W;
    const localY = ((clientY - rect.top) / rect.height) * MINIMAP_H;
    onJump({ x: bounds.minX + (localX - ox) / k, y: bounds.minY + (localY - oy) / k });
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card/90 shadow-[var(--shadow-float)] backdrop-blur-sm",
        className,
      )}
    >
      <svg
        ref={svgRef}
        width={MINIMAP_W}
        height={MINIMAP_H}
        viewBox={`0 0 ${MINIMAP_W} ${MINIMAP_H}`}
        role="img"
        aria-label={label}
        className="block cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.stopPropagation();
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          jumpFromEvent(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          jumpFromEvent(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {nodes.map((node) => (
          <rect
            key={node.id}
            x={px(node.x - NODE_W / 2)}
            y={py(node.y)}
            width={Math.max(2, NODE_W * k)}
            height={Math.max(1.5, NODE_H * k)}
            rx={1.5}
            fill={selected === node.id ? "var(--foreground)" : "var(--muted-foreground)"}
            opacity={selected === node.id ? 0.9 : 0.35}
          />
        ))}
        <rect
          x={px(view.x)}
          y={py(view.y)}
          width={Math.max(4, view.w * k)}
          height={Math.max(4, view.h * k)}
          rx={2}
          fill="var(--foreground)"
          fillOpacity={0.06}
          stroke="var(--foreground)"
          strokeOpacity={0.35}
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

/** Direction marker, sitting just inside the target port. */
function ArrowHead({ x, y, angle }: { readonly x: number; readonly y: number; readonly angle: number }) {
  return (
    <g transform={`translate(${x}, ${y}) rotate(${angle})`}>
      <path d={`M ${-ARROW_LEN} -4 L -2 0 L ${-ARROW_LEN} 4 Z`} fill="var(--muted-foreground)" opacity={0.6} />
    </g>
  );
}

function EdgeLabel({ x, y, label }: { readonly x: number; readonly y: number; readonly label: "Sí" | "No" }) {
  const width = 32;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-width / 2} y={-9} width={width} height={18} rx={9} fill="var(--card)" stroke="var(--border)" />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-mono)"
        fontSize={8}
        letterSpacing={1}
        fill="var(--muted-foreground)"
      >
        {label.toUpperCase()}
      </text>
    </g>
  );
}
