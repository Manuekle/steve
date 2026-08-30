import { defaultBackend, defineSandbox } from "eve/sandbox";

// Code isolation, resolved per host.
//
// `vercel()` is not a local backend: it always creates a hosted Vercel Sandbox,
// including from `next dev`, so it needs Vercel credentials (a linked project
// and an OIDC token, or VERCEL_TOKEN) even on a laptop. Pinning it meant every
// local `run_python` died on "Could not get credentials from OIDC context".
//
// `defaultBackend()` picks by availability instead: Vercel Sandbox when
// deployed on Vercel, otherwise a local Docker container, then microsandbox,
// then the pure-JS just-bash fallback. Each entry below configures whichever
// backend gets chosen; the rest are ignored.
//
// Docker's egress control is coarse — "deny-all" disables networking outright,
// which is what this agent wants, so nothing is lost against the Vercel
// backend's domain-level policies.
export default defineSandbox({
  backend: defaultBackend({
    vercel: { resources: { vcpus: 2 }, networkPolicy: "deny-all" },
    docker: { networkPolicy: "deny-all" },
  }),
});
