# Demo: Steve on self-hosted Eve infrastructure

This five-minute walkthrough demonstrates a durable Eve agent running on a
regular Node.js host with PostgreSQL and Docker. Replace `<app-domain>` with the
TLS-enabled deployment URL.

The precise claim is:

> Eve, Workflow state, sandbox execution, the web app, and telemetry run on the
> operator's host. Model inference goes directly to the configured OpenAI or
> Anthropic API, without Vercel-managed runtime services.

## Before the demo

1. Confirm `systemctl status steve steve-web` is healthy.
2. Load `.env`, then run the smoke test:

   ```bash
   set -a && . ./.env && set +a
   SELF_HOST_URL=https://<app-domain> SELF_HOST_EXPECT_AUTH=1 pnpm smoke:self-host
   ```
3. Confirm the sandbox image is already present so the first visible turn is not a cold pull.
4. Have the Basic auth username and password available without displaying them.

## 1. Show useful work

1. Open `https://<app-domain>` and sign in.
2. Ask for something the agent has to compute, with a chart:

   > Con estos ingresos por canal — WhatsApp 48200, Messenger 15900,
   > Instagram 27400 — calcula el porcentaje de cada uno y grafícalo.

3. Expand the `run_python` tool card while the answer streams.
4. Point out that the code runs in the sandbox and returns computed values —
   the model is not doing the arithmetic itself.
5. Show the rendered Mermaid chart and the accompanying figures.

Use a checkable follow-up in the same conversation:

> Guarda esa tabla en /workspace/canales.csv y volvé a leerla para
> confirmar que quedó.

`/workspace` persists across turns in the same durable session, so the second
turn reads back what the first one wrote.

## 2. Show the trust boundary

Ask:

> Use run_python to print the container hostname and
> os.environ.get("HOST_ONLY_SECRET", "<unset in sandbox>").

The expected result contains a container hostname and `<unset in sandbox>`.
This demonstrates that model-authored Python ran in Docker without receiving the
host process environment. The Docker backend also has `deny-all` network egress.

Do not claim that all code runs in the sandbox. Authored TypeScript tools and
Eve itself run in the trusted app process; only delegated shell, file, and
Python work runs through the sandbox.

## 3. Show durability

1. Start a multi-step request such as **Average box office by decade - and chart it**.
2. Wait until at least one tool result appears.
3. From `deploy/`, run `make demo-kill`.
4. Watch the client reconnect and the same durable session settle after systemd restarts Eve.

Retrieve the session ID from the browser console:

```js
JSON.parse(localStorage.getItem("steve:eve-chat:v1")).session.sessionId
```

Then inspect only that run tree:

```bash
make demo-events SESSION=<session-id>
```

The evidence is the same session and child-run IDs continuing after process
replacement, with previously completed actions represented by their durable
events rather than a second user session.

## 4. Show the host

Use whichever operational view is enabled:

- `make status` for systemd and container state;
- `docker ps` for PostgreSQL and session sandboxes;
- `pnpm observe` for Workflow runs;
- Jaeger for the `ai.eve.turn` trace hierarchy;
- Beszel for host metrics, when configured.

Treat `x-hosted-on-vercel: false` as informational metadata, not proof. The
deployment configuration, process list, network bindings, and durable database
are the substantive evidence.

## Failure recovery

- `401`: verify the Basic credentials and confirm both route-auth variables are set.
- UI loads but turns stall: confirm Caddy forwards `/.well-known/workflow/*`.
- First sandbox call is slow: pre-pull the pinned image digest.
- No traces: confirm `OTEL_EXPORTER_OTLP_ENDPOINT` and the collector's OTLP/HTTP receiver.
- Chart appears as text: ask the agent to return the computed Mermaid source in a fenced block.

Signing out clears the browser's stored Eve cursor and event history. In local
development, clear `steve:eve-chat:v1` from local storage to start over.
