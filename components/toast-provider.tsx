"use client";

import type { SoundName } from "cuelume";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  AnimatedToastStack,
  useAnimatedToastStack,
  type ToastInput,
  type ToastStatus,
} from "@/components/motion/animated-toast-stack";
import { useSound } from "@/components/sound-provider";

type ToastContextValue = {
  /** Queue a toast. Returns its id, usable with `dismiss`/`update`. */
  readonly toast: (input: ToastInput) => string;
  readonly dismiss: (id: string) => void;
  readonly update: (id: string, patch: Partial<ToastInput>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * The toast is the app's notification surface, so this is where sound belongs
 * — one mapping here covers every page instead of each caller remembering to
 * cue next to its own `toast()`.
 *
 * `whisper` for the two quiet statuses on purpose: an informational toast is
 * not an outcome, and giving it the same warm confirmation as a save makes
 * every save sound like nothing in particular.
 */
const STATUS_CUE: Record<ToastStatus, SoundName> = {
  neutral: "whisper",
  info: "whisper",
  loading: "loading",
  success: "success",
  error: "error",
};

/**
 * Real toasts for real changes — mounted once at the root, above the
 * `TooltipProvider`. Every page calls `useToast()` instead of rolling its
 * own inline "Saved" banner.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const { toasts, showToast, dismissToast, updateToast } = useAnimatedToastStack({
    defaultDuration: 4200,
    limit: 4,
  });
  const { cue } = useSound();

  const toast = useCallback(
    (input: ToastInput) => {
      cue(STATUS_CUE[input.status ?? "neutral"]);
      return showToast(input);
    },
    [cue, showToast],
  );

  // A `loading` toast that later resolves is the same event to the listener as
  // a toast that arrived already finished, so the status patch cues too.
  const update = useCallback(
    (id: string, patch: Partial<ToastInput>) => {
      if (patch.status) cue(STATUS_CUE[patch.status]);
      updateToast(id, patch);
    },
    [cue, updateToast],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toast, dismiss: dismissToast, update }),
    [toast, dismissToast, update],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <AnimatedToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        position="bottom-right"
        placement="fixed"
        portal
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
