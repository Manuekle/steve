"use client";

// The one way a page says "that didn't work".
//
// Pages had grown three different banners — a bare red line, a bordered box, a
// Card — for the same job. The message inside is always already localized:
// `lib/api-error-message.ts` is what produces it, so nothing here ever renders
// a status code or a server sentence.

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { AlertCircleIcon, RotateCwIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { useSound } from "@/components/sound-provider";
import { useT } from "@/lib/i18n/provider";
import { isApiError, uiErrorMessage, type UiError } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";

export function ErrorBanner({
  error,
  messageKey,
  message,
  /** Technical context (the provider's own words, a stack message). Shown
   *  smaller, under the sentence — useful in a support thread, never the
   *  headline. */
  detail,
  onRetry,
  onDismiss,
  className,
}: {
  /** What went wrong — a failed request, or a dictionary key for a local
   *  failure. Translated here rather than stored as a finished sentence, so
   *  switching language re-renders the banner in the new one. */
  readonly error?: UiError | null;
  /** Shorthand for `error={{ messageKey }}`. */
  readonly messageKey?: string | null;
  /** An already-final sentence. Last resort — it will not re-translate. */
  readonly message?: string | null;
  readonly detail?: string;
  readonly onRetry?: () => void;
  readonly onDismiss?: () => void;
  readonly className?: string;
}) {
  const t = useT();
  const { cue } = useSound();

  const text = error
    ? uiErrorMessage(t, error)
    : messageKey
      ? t(messageKey)
      : message;
  const context = detail ?? (error && isApiError(error) ? error.detail : undefined);

  // Sound the banner when it *appears*, not when it is merely on screen.
  //
  // A banner already rendered on the first pass is a load that failed before
  // anyone touched anything — a background event, and cuelume's own guidance
  // is to keep those quiet. One that shows up later is the response to
  // something the user just did, which is exactly what `error` is for.
  // Keyed on the previous message, not on a "have I mounted" flag: an effect
  // that re-runs without the banner changing — StrictMode's double invoke in
  // dev, a new `cue` identity — must not sound a second time for the same
  // failure.
  //
  // The previous value is boxed because `text` is itself usually `undefined`
  // before anything fails: a bare `undefined` sentinel could not tell "no
  // banner yet" from "first pass already ran", and the error that followed
  // would be the one that stayed silent.
  const seen = useRef<{ readonly value: typeof text } | null>(null);
  useEffect(() => {
    const previous = seen.current;
    if (text && previous && previous.value !== text) cue("error");
    seen.current = { value: text };
  }, [text, cue]);

  if (!text) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <HugeiconsIcon
        icon={AlertCircleIcon}
        size={16}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p>{text}</p>
        {context ? (
          <p className="mt-1 text-xs opacity-70">
            {t("apiError.detail")}: {context}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-destructive/10"
        >
          <HugeiconsIcon icon={RotateCwIcon} size={13} strokeWidth={1.75} />
          {t("apiError.retry")}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("apiError.dismiss")}
          className="shrink-0 rounded-lg p-1 transition-colors duration-150 hover:bg-destructive/10"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
