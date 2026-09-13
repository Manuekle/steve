import { createElement, lazy } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DeferredDemo } from "@/app/landing/_components/deferred-demo";
import { AdsScreen, AgentsScreen, ChatScreen, FlowScreen, InboxScreen } from "@/app/landing/_components/deferred-screens";
import { ClientGlobe } from "@/app/landing/_components/deferred-globe";

describe("landing performance boundaries", () => {
  it("renders a stable server fallback without downloading or rendering the demo", () => {
    const load = vi.fn(async () => ({ default: () => createElement("div", null, "expensive demo") }));
    const Demo = lazy(load);
    const html = renderToString(createElement(DeferredDemo, {
      className: "h-[38rem]",
      fallback: createElement("div", null, "preview"),
    }, createElement(Demo)));
    expect(load).not.toHaveBeenCalled();
    expect(html).toContain('data-deferred-demo="pending"');
    expect(html).toContain("preview");
    expect(html).not.toContain("expensive demo");
  });

  it.each([ChatScreen, InboxScreen, AgentsScreen, AdsScreen])("reserves the standard demo height (%s)", (Screen) => {
    const html = renderToString(createElement(Screen));
    expect(html).toContain('class="h-[38rem] lg:h-[42rem]"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<canvas");
  });

  it("reserves each responsive height of the compact flow", () => {
    const html = renderToString(createElement(FlowScreen, { compact: true }));
    expect(html).toContain('class="h-[28rem] sm:h-[32rem] lg:h-[37rem]"');
  });

  it("reserves the globe aspect ratio without initializing WebGL on the server", () => {
    const html = renderToString(createElement(ClientGlobe, { clients: [], className: "max-w-[22rem]" }));
    expect(html).toContain("aspect-square");
    expect(html).toContain("max-w-[22rem]");
    expect(html).not.toContain("<canvas");
  });
});
