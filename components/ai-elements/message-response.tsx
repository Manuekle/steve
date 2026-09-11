"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import type { ComponentProps } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";
import { mermaid } from "./mermaid-plugin";
import { cn } from "@/lib/utils";

/**
 * The Markdown half of a message, in its own module.
 *
 * It used to live in `message.tsx` beside `Message` and `MessageContent`,
 * which are two divs with classes on them. Importing those two divs therefore
 * pulled in Streamdown and its four plugins — Shiki for `code`, KaTeX for
 * `math`, Mermaid for diagrams — because a module is the unit a bundler
 * splits on. The landing page's hero mockup imports `Message` to render a
 * fake conversation of plain strings, and paid for the whole Markdown stack
 * on first load to do it.
 *
 * Mermaid is this file's own plugin rather than `@streamdown/mermaid` — see
 * `mermaid-plugin.ts` for why a DOM-free renderer is the right one here.
 *
 * So the split is not stylistic: `message.tsx` is now cheap to import, and
 * the cost lands only on the three screens that actually render Markdown.
 */
export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

/**
 * Copy, download, fullscreen and pan-zoom, off for diagrams only.
 *
 * A diagram in a reply is a picture: nobody wants the source of a five-node
 * flow on their clipboard, and the buttons cost a permanent 32px strip plus a
 * caption row above every one of them. Code and table blocks keep theirs —
 * copying a snippet is the whole point of a snippet.
 *
 * The rest of the wrapper Streamdown draws around a diagram is not
 * configurable; `app/globals.css` takes it off.
 */
const streamdownControls = { mermaid: false } as const;

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
      controls={streamdownControls}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && nextProps.isAnimating === prevProps.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
