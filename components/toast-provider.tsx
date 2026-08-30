"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  AnimatedToastStack,
  useAnimatedToastStack,
  type ToastInput,
} from "@/components/motion/animated-toast-stack";

type ToastContextValue = {
  /** Queue a toast. Returns its id, usable with `dismiss`/`update`. */
  readonly toast: (input: ToastInput) => string;
  readonly dismiss: (id: string) => void;
  readonly update: (id: string, patch: Partial<ToastInput>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

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

  const value = useMemo<ToastContextValue>(
    () => ({ toast: showToast, dismiss: dismissToast, update: updateToast }),
    [showToast, dismissToast, updateToast],
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
