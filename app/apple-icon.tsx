import { ImageResponse } from "next/og";

/**
 * The home-screen icon, for the installation someone saves to a phone.
 *
 * Separate from `icon.svg` for two reasons, both iOS'. It has to be a raster —
 * Safari will not take an SVG here — and it must be square and opaque: iOS
 * applies its own squircle mask and its own shadow, so an icon that arrives
 * pre-rounded gets rounded twice and an icon with a transparent ground comes
 * out black. The mark sits at 58% rather than the favicon's 72%, because the
 * corners that mask removes are corners the glyph cannot be near.
 *
 * The mark travels as a data URI so this file has no runtime dependency on
 * `public/` — `next/og` renders on the server, and a relative path would have
 * to be fetched over the network the installation may not have.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const MARK = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjMwMiAyMTMgNzQ0IDc2NCIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZGZkZmQiIHRyYW5zZm9ybT0ibWF0cml4KDEuMjI0NjA5LDAsMCwxLjIyNDYwOSwwLDApIj48cGF0aCBkPSJNNTgyLjQ1NiwxNzQuMDQyQzYwMC40MiwxNzIuNzczIDYyMC4yNTIsMTczLjcxOCA2NDAuODYzLDE4OS4wMDVDNjQ0LjM4MywxOTEuNjE2IDY2My43OTUsMjA2LjAxNCA2NjguMDM0LDIzNi41NzNDNjgxLjA3NiwzMzAuNTc5IDU1OS45ODgsMzk0LjgzMSA0ODQuNjE5LDQ3MC42MTdDNDM4LjA4Niw1MTcuNDA4IDQ1NC45NzQsNTQ0LjI4OSA0NjkuNjcsNTQ5LjAwNEM1MDAuNTk4LDU1OC45MjcgNTEyLjc0OCw1MDguMDU5IDU0MS42OTUsNDcyLjY0OUM2MTcuNTIyLDM3OS44OTQgNjkzLjk1MiwzOTkuODQzIDcwNS41MjksNDAyLjM3MkM3NDguMTksNDExLjY5IDc3NS4yMTUsNDQyLjg3MSA3ODQuMzgyLDQ2My41NTZDODUzLjkyMiw2MjAuNDY3IDY0MS40MzksNzcwLjIxNyA0ODYuNDA2LDc5OC4wMzhDMzA3LjMwNyw4MzAuMTc3IDMwNi44NCw3MTQuMzM3IDM1MS44MzcsNjc5LjkyNUM0MTIuMDg0LDYzMy44NTEgNDgwLjE4Niw2NjEuMjExIDU3NS41NDIsNjQ4Ljc5NkM2MzguMzU4LDY0MC42MTcgNjc1LjMxNCw2MDkuMjIxIDY4Ny4wOTYsNTgwLjMzMUM3MDcuNTUxLDUzMC4xNzQgNjY1LjYzNyw0OTQuNzI1IDYxNC40Niw1MDcuMzVDNTUyLjg5Nyw1MjIuNTM2IDUzNC41NzYsNTczLjk3NSA1MDQuODQsNTk0Ljk5MkM0NjQuNDQsNjIzLjU0NyA0MTkuODg1LDYwOC41NjUgNDA0LjgxLDU1Mi40MUMzODcuOTc3LDQ4OS43MDcgNDE1LjM4MywxODkuMTQ2IDU4Mi40NTYsMTc0LjA0MloiLz48cGF0aCBkPSJNMzE0LjUwMSw2NjYuOTQ0QzI0Ny40NTIsNjYzLjc5NCAyODMuOTY1LDUyNS4wMiAzNDMuNDk2LDUyMy4zNDdDMzc1LjcxOSw1MjIuNDQxIDM4My40NjMsNTY3Ljg2IDM3NS4wMjIsNjAwLjM3N0MzNzQuNTcsNjAyLjExOSAzNTkuNTY1LDY2NC4yODEgMzE0LjUwMSw2NjYuOTQ0WiIvPjwvZz48L3N2Zz4K";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#141414",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={MARK} width={104} height={107} />
      </div>
    ),
    size,
  );
}
