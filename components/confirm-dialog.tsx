"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/i18n/provider";

type ConfirmOptions = {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly confirmLabel?: ReactNode;
  readonly cancelLabel?: ReactNode;
};

type PendingConfirm = {
  readonly options: ConfirmOptions;
  readonly resolve: (value: boolean) => void;
};

/**
 * Drop-in async replacement for `window.confirm`, styled to match the app
 * instead of the browser chrome. `confirm()` resolves once the person
 * picks — `true` for the destructive action, `false` for cancel, Escape, or
 * a click outside. Render `dialog` once anywhere in the page's JSX.
 *
 *   const { confirm, dialog } = useConfirmDialog();
 *   const remove = async (id: string) => {
 *     if (!(await confirm({ title: t("leads.confirmDelete") }))) return;
 *     ...
 *   };
 *   return <>{dialog}...</>;
 */
export function useConfirmDialog() {
  const t = useT();
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setPending({ options, resolve }));
  }, []);

  const settle = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      {pending ? (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending.options.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending.options.description ?? t("common.actionCannotBeUndone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {pending.options.cancelLabel ?? t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => settle(true)}>
              {pending.options.confirmLabel ?? t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );

  return { confirm, dialog };
}
