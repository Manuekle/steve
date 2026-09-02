<p align="center">
  <img src="public/logos/steve.svg" alt="steve" width="120" style="border-radius: 24px;" />
</p>

<h1 align="center">steve</h1>

<p align="center">
  <strong>the service system for your business and your agents</strong><br/>
  WhatsApp, Instagram and Meta Ads in one inbox. Self-hosted, with your own keys and database.
</p>

<p align="center">
  <a href="#local-setup">Local setup</a> · <a href="#architecture">Architecture</a> · <a href="https://eve.dev">Eve</a>
</p>

---

Steve is a service and sales agent built with [Eve](https://eve.dev) and deployed on a self-hosted Node.js host. It shows how to run Eve without Vercel-managed runtime infrastructure:

- PostgreSQL stores durable Workflow state.
- Docker isolates model-authored Python and blocks sandbox network egress.
- OpenAI or Anthropic is called directly through its AI SDK provider package.
- A Next.js chat UI talks to Eve through the stable `/eve/v1` protocol.
- OpenTelemetry exports traces to a collector you operate, such as Jaeger.

The Eve runtime and control plane are self-hosted. Model inference is not: user
messages and model context are sent directly to the configured OpenAI or
Anthropic API.

> Eve is in public preview. `@workflow/world-postgres` describes itself as a
> reference implementation. This repository is a transparent single-host
> deployment baseline, not a high-availability production architecture.

## Repo scope vs. commercial plans

Everything in this repository is the self-hosted deployment described below —
what the pricing page sells as **Enterprise**: a one-time license to install
and operate this exact codebase on your own infrastructure. **Pro** and
**Managed** are a separate, hosted service built on the same codebase, run and
operated by the vendor for subscribers; provisioning and operating that
multi-tenant hosted service is not part of what's checked into this repo. If
you're evaluating self-hosting, or you bought Enterprise, everything from here
on is the whole story.

## Architecture

```text
browser
  -> Caddy :443
     -> /eve/* and /.well-known/workflow/* -> Eve :3000
     -> all other paths                    -> Next.js :3001

Eve
  -> OpenAI or Anthropic API
  -> PostgreSQL Workflow world :5544 (loopback only)
  -> per-session Docker sandbox (deny-all egress)
  -> OTLP/HTTP collector (optional)
```

Both `/eve/` and `/.well-known/workflow/` must reach the Eve service. Omitting
the Workflow callback prefix allows sessions to start but leaves turns stalled.

## Compatibility set

The lockfile pins the packages that must move together:

| Package | Version |
| --- | --- |
| `eve` | `0.25.2` |
| `ai` | `7.0.31` |
| `@ai-sdk/openai` / `@ai-sdk/anthropic` | `4.0.16` |
| `workflow` | `5.0.0-beta.35` |
| `@workflow/world-postgres` | `5.0.0-beta.27` |

Do not replace the Postgres world with its npm `latest` tag. Eve currently uses
the Workflow 5 beta protocol, while that package's `latest` tag is Workflow 4.

## Prerequisites

- Node.js 24
- Corepack with pnpm 10.33.2
- Docker Engine or Docker Desktop
- An OpenAI or Anthropic API key with quota

## Installation

For the complete installation guide with platform-specific instructions (macOS,
Linux, Windows), visit **[steve.dev/guide](https://steve.dev/guide)**.

### Quick start (manual)

```bash
corepack enable
pnpm install --frozen-lockfile --strict-peer-dependencies
cp .env.example .env
```

Edit `.env` before continuing:

1. Replace both example passwords.
2. Keep `POSTGRES_PASSWORD` and the password inside `WORKFLOW_POSTGRES_URL` identical.

No API key goes in `.env`. The model provider (Vercel AI Gateway, OpenAI,
Anthropic, Google Gemini) and every integration key are set from the running
app — **Configuración → Modelo de IA** and **Conexiones** — and persisted to
`~/.steve/credentials.json`, where they can be rotated and cleared without a
restart. `.env` holds only what has to exist before the app boots.

Start and migrate PostgreSQL:

```bash
pnpm db:up
pnpm db:migrate
```

Start the web app:

```bash
pnpm dev
```

`withEve()` starts the Eve development host beside Next.js. Open
`http://localhost:3000`. Loopback requests use `localDev()` and do not require
Basic auth.

For a headless Eve host instead:

```bash
make dev
```

Then run `pnpm smoke:self-host` in a second terminal.

## Production auth

`agent/channels/eve.ts` uses environment-specific policies:

```text
development: localDev() -> httpBasic(...) -> reject
production:  httpBasic(...) -> reject
```

Production never enables `localDev()`, so spoofing a loopback `Host` header
cannot bypass authentication. Requests fail with `401` unless both
`ROUTE_AUTH_BASIC_USER` and `ROUTE_AUTH_BASIC_PASSWORD` are configured. If
either variable is missing, Eve's production placeholder keeps the routes
closed.

The production UI asks the visitor for those credentials and validates them
against `/eve/v1/info`. The password remains in browser memory and is not
embedded in the JavaScript bundle or persisted to local storage. Use HTTPS
before entering it.

## Agent behavior

`run_python` writes a script into the session's sandbox and returns stdout,
stderr, and the exit code. `/workspace` starts empty; anything the agent needs
comes from the conversation or from a file the user provides.

The sandbox backend is resolved per host by `defaultBackend()`: Vercel Sandbox
when deployed on Vercel, otherwise a local Docker container, then microsandbox,
then the pure-JS just-bash fallback.

The sandbox configuration:

- runs a multi-architecture Eve image that includes Python 3;
- uses `deny-all` network policy;
- receives no host environment variables;
- persists `/workspace` across turns in the same durable session;
- limits each authored Python program to 15 seconds;
- caps combined stdout and stderr at 256 KiB;
- stops compute on Eve shutdown and reattaches the session after restart.

Built-in Bash, app-runtime web fetch, provider web search, and recursive agent
tools are disabled. The agent also has explicit per-session token budgets.

## Setup page

**Instalación** (`/setup`) answers "does this machine have what the project
needs?" for someone who has never opened a terminal. Every requirement is
checked live on the host — Node version, Docker installed and running, the
`steve-postgres` container, TCP reachability of `WORKFLOW_POSTGRES_URL`,
whether the database has tables, the model key for the selected provider,
embeddings, and `.env` — and each failure shows the one command that fixes it,
with a copy button.

The same page moves configuration between machines:

- **Import** a `.env`, a `.txt`, or a JSON export, by drop zone or pasted text.
  Recognized keys are saved; unknown keys are reported and ignored; empty
  values never clear an existing credential. Parsing lives in
  `lib/env-file.ts` and is unit-tested.
- **Export** everything saved, as a grouped `.env` or as JSON.

The export contains secrets in plain text — the page says so before the click.
It exposes nothing new: `GET /api/settings` already returns the same values to
the same caller. In production both are behind the Basic auth described under
[Production auth](#production-auth).

Checks shell out with `execFile` and argument arrays, never a shell string, and
the database identifiers taken from the credential store are pattern-validated
before they reach `docker exec`.

## Database

PostgreSQL is the only database this project uses — there is no Redis. It holds
the durable Workflow state: sessions, queues, and scheduled work.
`docker-compose.yml` runs it on host port 5544 (not 5432, so it will not clash
with another local Postgres).

`WORKFLOW_POSTGRES_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
and `POSTGRES_HOST_PORT` are editable in **Configuración → Base de datos**.
`agent/agent.ts` calls `applyStoredEnv()` during Eve's discovery phase, so a
connection string saved there is picked up on the next boot without a `.env`
edit. Real environment variables win over stored values for the database — a
deployment that injects the URL through systemd or a container runtime must not
be re-pointed by a stale value typed into the UI. Model keys go the other way:
the UI is the intended way to rotate them.

Changing any database value requires restarting the agent.

## Model selection

The catalog is never hardcoded. `lib/provider-catalog.ts` fetches it live from
whichever provider is configured — the Gateway's `/v1/models` returns 200-plus
entries with real per-token pricing — and caches it for a minute. What the repo
does hardcode is a *ranking*: `lib/model-catalog.ts` lists, per provider and
per task, the models to prefer in order. The first one the provider actually
offers wins, so a retired id degrades to the next choice instead of failing.

Server-side calls name a task, never a model:

| Task           | Where it runs                       | Why that tier            |
| -------------- | ----------------------------------- | ------------------------ |
| `chat`         | web chat and messaging channels     | value tier, high volume  |
| `automation`   | `/api/automations/assistant`        | writes a flow that runs unattended |
| `agent_design` | `/api/agents/optimize`              | same, for an agent's prompt |
| `quick`        | titles, classification, extraction  | cheapest that works      |

Picks at the Gateway's published prices (USD per million in/out):
`claude-sonnet-5` ($2/$10) or `gpt-5-mini` ($0.25/$2) for chat;
`claude-opus-5` ($5/$25) or `gpt-5.1-thinking` ($1.25/$10) for the two
building tasks; `claude-haiku-4.5` ($1/$5) or `gpt-5-nano` ($0.05/$0.40) for
short work.

### Per-conversation choice

The chat header has a searchable picker showing every model the provider
serves, with price and context window on each row. "Automático" leaves the
per-task ranking in charge.

The picker cannot reach into Eve, so the choice is written to
`~/.steve/chat-models.json` and `agent/agent.ts` reads it back through
`defineDynamic` on `step.started`, keyed by session id. `step.started` is the
scope that matters: session- and turn-scoped selections must serialize to a
model id string, which only the Gateway route can express, while `step.started`
may return a live AI SDK model — so a direct OpenAI or Anthropic pick works
too. A new chat has no session id yet, so the choice parks as `pending` and the
first turn claims it.

Custom agents carry an optional `model` the same way, validated on save.

### Key health

"Valid" and "usable" are different questions. `GET /api/models` reports the
key's status; **Verificar API** in Settings additionally probes, one token at a
time, whether the account can actually run the models the app would pick.

Statuses: `ok`, `missing`, `invalid`, `no_credit`, `rate_limited`,
`unreachable`, and `free_tier` — the last for an account that authenticates
with a positive balance but is only allowed part of the catalog. Vercel's free
Gateway credits behave exactly this way, and the difference is invisible until
a real request is made.

Whatever the probe finds is written to `~/.steve/model-access.json`, and both
the task ranking and the picker route around those models — a blocked model is
shown struck through with the provider's own explanation rather than quietly
dropped. Free-tier rate limits are bursty, so a probe can pass and a later turn
can still be throttled; that surfaces as the provider's message in the chat.

## Knowledge base (RAG)

**Conocimiento** (`/knowledge`) indexes the business's own documents so the
agent answers prices, policies, and procedures from them instead of guessing.

- Upload PDF, TXT, MD, CSV, TSV, JSON, HTML, XML, YAML, or LOG, up to 20 MB per
  file. PDFs are extracted with `unpdf` (pure JS, no native binary); a scanned
  PDF with no text layer is rejected with a message saying so.
- Text is split into ~1200-character chunks with 200 characters of overlap,
  embedded with `text-embedding-3-small`, and stored in
  `~/.steve/knowledge.json` alongside the other local stores.
- Retrieval is an exact cosine-similarity scan over every chunk — no vector
  database to operate. Swapping in pgvector later means replacing
  `searchChunks()` in `lib/knowledge-store.ts`.
- Embeddings run on OpenAI: directly when `OPENAI_API_KEY` is set, otherwise
  through the Gateway. Anthropic publishes no embedding models, so an
  Anthropic-only setup still needs one of those two keys for this page.
- The agent reaches the same index through the `search_knowledge` tool. The
  page's search box runs that identical query path, so what it shows is what
  the agent would retrieve.

## Observability

Set a standard OTLP endpoint to export Eve and AI SDK trace spans:

```bash
docker compose --profile observability up -d jaeger
# .env
OTEL_EXPORTER_OTLP_ENDPOINT="http://127.0.0.1:4318"
```

Open `http://127.0.0.1:16686` locally. The same exporter works with any
OTLP/HTTP-compatible collector; configure `OTEL_EXPORTER_OTLP_HEADERS` when it
requires authentication.

Full model inputs and outputs are disabled by default. Set
`OTEL_RECORD_INPUTS=true` or `OTEL_RECORD_OUTPUTS=true` only after reviewing the
collector, access policy, and retention path.

Workflow state can also be inspected directly:

```bash
pnpm observe
pnpm observe:web
```

## Verification

Static checks do not require a model key:

```bash
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm exec eve info --json
pnpm typecheck
pnpm build
docker compose config --quiet
pnpm audit --prod --audit-level high
make -C deploy check
```

Live checks use the configured model provider and may incur provider cost:

```bash
set -a && . ./.env && set +a
pnpm smoke:self-host
pnpm test:eval
```

The smoke client verifies health, agent inspection, sandboxed Python, exact
movie facts, streaming, a follow-up on the same session, and bounded server-side
cancellation and output. Set
`SELF_HOST_URL`, and set `SELF_HOST_EXPECT_AUTH=1` when targeting a production
origin.

See [PROOF.md](./PROOF.md) for isolation and crash-recovery procedures.

## Deployment

The `deploy/` directory provisions a DigitalOcean droplet and installs the two
Node services, PostgreSQL, optional Beszel monitoring, optional Jaeger tracing,
and Caddy. Start with [deploy/README.md](./deploy/README.md).

Before each Workflow schema migration, Ansible writes a custom-format PostgreSQL
backup under `/opt/steve-backups/`. Production-shaped unauthenticated and
authenticated requests are checked before a deployment is reported healthy.

The one-time upgrade from Eve versions before `0.20` is guarded specially.
Active runs from that runtime line did not replay safely in verification against
the current Workflow runtime. Ansible refuses the cutover until the operator
inspects and explicitly cancels those old active runs; later `0.25` restarts
continue to resume compatible parked sessions normally.

## Limitations

- One host is a single point of failure.
- The embedded Postgres world's workers are not separated from the Eve process.
- Database backup retention and off-host replication are operator responsibilities.
- Docker sandbox CPU and memory quotas are not exposed by Eve's built-in Docker backend.
- Basic auth is appropriate for a controlled reference deployment, not multi-tenant identity.
- Model provider availability, policy, retention, and cost remain external dependencies.

## Project layout

```text
agent/                    Eve agent, channel, tools, sandbox, instrumentation
app/                      Next.js chat UI
evals/                    live Eve regression evals
scripts/                  reusable self-host smoke client
deploy/                   Ansible single-host deployment
docker-compose.yml        PostgreSQL and optional local Jaeger
Makefile                  local operations and verification helpers
DEMO.md                   customer-safe demo script
PROOF.md                  reproducible verification procedures
```
