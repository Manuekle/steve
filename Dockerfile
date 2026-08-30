# syntax=docker/dockerfile:1.7
#
# Enterprise self-hosted images for steve — two runtime targets built from
# one source tree: `eve` (the agent host, port 3000) and `web` (the Next.js
# UI, port 3001). They mirror the two systemd services the Ansible path
# already installs — deploy/roles/app/templates/steve.service.j2 and
# deploy/roles/frontend/templates/steve-web.service.j2 — same processes,
# same ports, packaged as containers instead of systemd units.
#
# Build:
#   docker build --target eve -t steve-eve .
#   docker build --target web -t steve-web .
# Or build both through docker-compose.enterprise.yml.
#
# The `eve` image needs a route to a Docker daemon to create sandbox
# containers (agent/sandbox/sandbox.ts uses defaultBackend(), which resolves
# to the local Docker backend off Vercel). docker-compose.enterprise.yml
# mounts the host's docker socket for that — read the comment there before
# using this in production; it is a real trust boundary, not a formality.

ARG NODE_VERSION=24-slim

FROM node:${NODE_VERSION} AS base
WORKDIR /app
RUN corepack enable

# ---- deps: every dependency, dev included — eve build and next build both
# need the TypeScript toolchain. ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --strict-peer-dependencies

# ---- prod-deps: production-only install for the eve runtime image, built
# separately so the dev toolchain never ships in it. ----
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --strict-peer-dependencies --prod

# ---- build: `pnpm build` == `eve build && next build`. Produces .output/
# (eve's compiled Nitro server) and .next/standalone (Next's self-contained
# server bundle, enabled by `output: "standalone"` in next.config.ts). ----
FROM deps AS build
COPY . .
RUN pnpm build

# ---- eve: the agent host. `eve start` re-resolves authored modules at
# startup rather than fully inlining them into .output/ at build time —
# agent/agent.ts and its tools import from the top-level lib/ by relative
# path (`../lib/ai-provider`, etc.), so both directories have to exist at
# the same paths they have in the source tree, not just agent/ alone.
# Verified against a real `docker build` + `eve start` boot, not assumed. ----
FROM base AS eve
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/agent ./agent
COPY --from=build /app/lib ./lib
COPY package.json tsconfig.json ./
EXPOSE 3000
CMD ["node", "node_modules/eve/bin/eve.js", "start", "--host", "0.0.0.0", "--port", "3000"]

# ---- web: the Next.js UI. Standalone output is already self-contained, so
# unlike `eve` this needs no node_modules copy at all. ----
FROM base AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV EVE_SELF_HOSTED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
