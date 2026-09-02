"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface InputClearProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** aria-label for the clear button */
  clearLabel?: string;
}

/**
 * A search input with a smooth dissolve clear animation. When the
 * user clicks the clear button, the text flies up and fades out while
 * the placeholder drops back in. The input itself always shows its
 * text normally — the mirror layer is only used during the clear
 * animation to keep the old text visible while it dissolves.
 */
export function InputClear({
  value,
  onChange,
  placeholder = "Search",
  className,
  clearLabel = "Clear search",
}: InputClearProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [isClearing, setIsClearing] = useState(false);
  const frameRef = useRef<number>(undefined);

  const hasValue = value.length > 0;

  const prefersReducedMotion = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const runClearAnimation = useCallback(() => {
    const mirror = mirrorRef.current;
    if (!mirror) return;

    if (prefersReducedMotion()) {
      mirror.style.opacity = "0";
      mirror.style.transform = "none";
      mirror.style.filter = "none";
      return;
    }

    const text = value;
    mirror.textContent = text;

    const duration = 320;
    const flyAmount = 8;
    const blurAmount = 2;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3.2);

    const startTime = performance.now();
    setIsClearing(true);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = ease(progress);

      mirror.style.opacity = `${1 - eased}`;
      mirror.style.transform = `translateY(${-flyAmount * eased}px)`;
      mirror.style.filter = progress > 0 && progress < 1
        ? `blur(${blurAmount * progress}px)`
        : progress >= 1
          ? `blur(${blurAmount}px)`
          : "none";

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        mirror.style.opacity = "";
        mirror.style.transform = "";
        mirror.style.filter = "";
        mirror.textContent = "";
        setIsClearing(false);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
  }, [value, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const handleClear = () => {
    if (!hasValue) return;
    // Set the mirror text before clearing so it stays visible during
    // the dissolve animation.
    runClearAnimation();
    onChange("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div
      className={cn(
        "relative flex h-9 w-full items-center rounded-lg border border-input bg-muted pl-9 pr-9 text-sm shadow-[var(--shadow-inset)] outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-within:border-ring/50 focus-within:bg-card focus-within:shadow-[var(--shadow-inset),0_0_0_3px_oklch(0.5_0_0/0.1)]",
        className,
      )}
    >
      <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.75} className="absolute left-3 shrink-0 text-muted-foreground" />
      <input
        aria-label={placeholder}
        className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        type="text"
        value={value}
      />
      {/* Mirror layer — only visible during the clear animation.
          Positioned exactly over the input text. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center overflow-hidden pl-9 text-sm text-foreground",
          isClearing ? "opacity-100" : "opacity-0",
        )}
        ref={mirrorRef}
        style={{ zIndex: 1 }}
      />
      {hasValue ? (
        <button
          aria-label={clearLabel}
          className="absolute right-2.5 z-10 flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={handleClear}
          type="button"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
