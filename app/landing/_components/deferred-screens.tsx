"use client";

import { lazy, type ReactNode } from "react";
import { DeferredDemo } from "./deferred-demo";

const Chat = lazy(() => import("./screen-chat").then((module) => ({ default: module.ChatScreen })));
const Inbox = lazy(() => import("./screen-inbox").then((module) => ({ default: module.InboxScreen })));
const Flow = lazy(() => import("./screen-flow").then((module) => ({ default: module.FlowScreen })));
const Agents = lazy(() => import("./screen-agents").then((module) => ({ default: module.AgentsScreen })));
const Ads = lazy(() => import("./screen-ads").then((module) => ({ default: module.AdsScreen })));

function Screen({ children, compact = false, rootMargin }: {
  readonly children: ReactNode;
  readonly compact?: boolean;
  readonly rootMargin?: string;
}) {
  return (
    <DeferredDemo
      rootMargin={rootMargin}
      // Match AppChrome and compact FlowScreen exactly: loading must not move
      // the sections below or disturb anchor navigation.
      className={compact ? "h-[28rem] sm:h-[32rem] lg:h-[37rem]" : "h-[38rem] lg:h-[42rem]"}
      fallback={
        <div aria-hidden="true" className="flex h-full overflow-hidden bg-background">
          <div className="w-14 shrink-0 border-r border-border/50 bg-muted/20 sm:w-48" />
          <div className="flex-1 space-y-5 p-8">
            <div className="h-3 w-1/3 rounded bg-muted/60" />
            <div className="h-24 rounded-xl border border-border/40 bg-muted/20" />
            <div className="h-3 w-2/3 rounded bg-muted/40" />
          </div>
        </div>
      }
    >
      {children}
    </DeferredDemo>
  );
}

// The first demo is close to the fold on phones. Don't let its prefetch margin
// compete with the headline's fonts and hydration on a cold mobile visit.
export function ChatScreen() { return <Screen rootMargin="0px"><Chat /></Screen>; }
export function InboxScreen() { return <Screen><Inbox /></Screen>; }
export function FlowScreen({ compact = false }: { readonly compact?: boolean }) {
  return <Screen compact={compact}><Flow compact={compact} /></Screen>;
}
export function AgentsScreen() { return <Screen><Agents /></Screen>; }
export function AdsScreen() { return <Screen><Ads /></Screen>; }
