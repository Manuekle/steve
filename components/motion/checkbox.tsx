"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  label?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  /** Associates an external message (e.g. a form error) with the control. */
  "aria-describedby"?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  indeterminate,
  label,
  className,
  id: idProp,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: CheckboxProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const showMark = checked || indeterminate;

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex items-center gap-3",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <button
        id={id}
        type="button"
        role="checkbox"
        // Checked/unchecked is a switch, so it gets the switch cue instead of
        // the generic press the provider falls back to.
        data-cuelume-toggle
        aria-checked={indeterminate ? "mixed" : checked}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        data-state={
          checked ? "checked" : indeterminate ? "indeterminate" : "unchecked"
        }
        className={cn(
          "t-check",
          "inline-flex size-3.5 shrink-0 items-center justify-center rounded border outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          showMark
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/50 bg-background hover:border-muted-foreground",
        )}
      >
        <svg viewBox="0 0 10.1668 10.1668" aria-hidden>
          <path d={indeterminate ? "M2 5h6" : "M1 5.52L3.92 9.17L9.17 1"} />
        </svg>
      </button>
      {label ? (
        <span className={cn("select-none text-sm text-foreground", disabled && "opacity-60")}>
          {label}
        </span>
      ) : null}
    </label>
  );
}
