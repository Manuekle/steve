"use client";

import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";

/** Keep the marketing copy server-rendered, but only mount expensive demos
 * near the viewport. Once mounted, preserve their state across scrolling. */
export function DeferredDemo({
  children,
  className,
  fallback,
  rootMargin = "200px 0px",
}: {
  readonly children?: ReactNode;
  readonly className: string;
  readonly fallback?: ReactNode;
  readonly rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setReady(true);
      observer.disconnect();
    }, { rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className} data-deferred-demo={ready ? "ready" : "pending"}>
      {ready ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
}
