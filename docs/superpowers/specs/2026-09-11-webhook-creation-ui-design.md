# Webhook Creation UI Design

## Goal

Refine the existing `Automations > New automation` flow when the selected trigger is `Webhook`. The UI should feel like a premium SaaS product inspired by the supplied Linear/Stripe/Vercel reference, while preserving Senka's visual language, existing components, API contract, translations, and automation model.

## Scope

- Update the existing `AutomationDialog`; do not create a second creation flow.
- Apply the two-column composition only to webhook-specific content where it improves clarity.
- Preserve current trigger, channel, agent, and automation creation behavior.
- Keep current webhook endpoint shape: `/api/automations/:id/webhook`.
- Keep server-generated webhook secret behavior.
- Add clear copy affordances and request instructions for endpoint and secret.
- Make layout collapse to one column on narrow screens.

## Out Of Scope

- New event taxonomy. Senka currently models webhook as an automation trigger, not a list of subscribable domain events.
- New webhook persistence model.
- Changing webhook authentication protocol.
- Changing automation execution semantics.
- Redesigning the complete Automations page.

## Layout

The existing side drawer remains the shell. When trigger is `webhook`, its form uses a responsive two-column grid inside the scrollable body:

- Left column: automation identity and routing configuration.
- Right column: webhook endpoint, secret, request example, and operational summary.
- A subtle vertical divider separates columns at desktop widths.
- At mobile widths, columns stack in reading order: configuration, then endpoint details.
- Drawer header and footer remain stable; only body content scrolls.

## Left Column

- Name: existing required automation name field.
- Description: existing optional description field.
- Trigger: existing trigger selector, with Webhook selected.
- Secret field:
  - Small uppercase label: `WEBHOOK SECRET`.
  - Monospace value.
  - Copy action.
  - Regenerate action only if supported by existing API flow; otherwise no destructive-looking control is added.
  - Helper text explains that callers send it through `x-webhook-secret`.
- Channel: existing channel selector.
- Agent: existing agent selector.

Non-webhook triggers retain current form layout and behavior.

## Right Column

- Endpoint card:
  - Heading: `Webhook endpoint`.
  - Generated endpoint for existing automations.
  - Preview text for new unsaved automations because no ID exists until creation.
  - Copy button becomes available only when a concrete endpoint exists.
- Request card:
  - Compact `POST` method indicator.
  - Endpoint path.
  - `x-webhook-secret` header example.
  - `Content-Type: application/json` line.
- Summary card:
  - Current channel.
  - Current agent or default agent.
  - Current automation state where available.
- Status treatment uses existing Senka status colors; no saturated decorative colors or gradients.

## Visual Direction

- Existing Senka font and design tokens remain authoritative.
- Off-white/background card surfaces, subtle borders, moderate radius, minimal shadows.
- Strong hierarchy through spacing and type weight rather than decoration.
- Monospace only for URLs, headers, secrets, and request snippets.
- Dark primary action remains consistent with current product controls.
- Blue may identify copy/link affordances only where existing tokens support it.
- Green is reserved for successful copy/valid state.
- Preserve existing icon system.

## Interaction And States

- Secret remains editable for compatibility with existing API behavior.
- Empty secret on create still allows backend generation.
- Copy controls provide transient success feedback and accessible labels.
- Endpoint is unavailable before creation; explanatory preview prevents misleading users.
- API errors remain surfaced through existing error handling.
- Submit behavior, reset behavior, and navigation remain unchanged.
- Keyboard navigation follows form order. Copy buttons are real buttons and do not submit the form.

## Accessibility

- Every input keeps a visible label or accessible name.
- Informational cards use headings or labelled groups.
- Copy actions identify what they copy, not only `Copy`.
- Color is not the sole state indicator.
- Focus states use existing component styles.
- Responsive stacking preserves logical reading order.

## Verification

- Existing automation and API tests remain passing.
- Typecheck passes.
- Verify non-webhook dialog behavior is unchanged.
- Verify webhook layout at desktop and mobile widths.
- Verify copy actions, submit, API failure, and keyboard interaction.
